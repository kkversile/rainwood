import {
  RECOMMENDATION_COMPRESSION_MIN_LEAD_DAYS,
  RECOMMENDATION_COMPRESSION_OCCUPANCY,
  RECOMMENDATION_PICKUP_STRONG_PERCENT,
  RECOMMENDATION_PICKUP_WEAK_PERCENT,
  RECOMMENDATION_SOFT_LEAD_DAYS,
  RECOMMENDATION_SOFT_OCCUPANCY,
  RECOMMENDATION_STRONG_OCCUPANCY,
  RECOMMENDATION_STRONG_UPWARD_MAX_PERCENT,
  RECOMMENDATION_STRONG_UPWARD_MIN_PERCENT,
  RECOMMENDATION_UPWARD_MAX_PERCENT,
  RECOMMENDATION_UPWARD_MIN_PERCENT,
} from './revenue-recommendation.constants';

export type RecommendationType = 'HOLD_RATE' | 'REVIEW_UPWARD' | 'REVIEW_STRONG_UPWARD' | 'REVIEW_SOFT_DEMAND' | 'INSUFFICIENT_DATA';
export type PickupStrength = 'WEAK' | 'NORMAL' | 'STRONG' | 'UNKNOWN';
export type RecommendationRateContext = { available: boolean; multipleRates?: boolean; rows?: Array<{ effectivePrePromoRate: number; source?: string; ratePlan?: string; roomTypeId?: string }> };
export type RevenueRecommendationInput = {
  daysToArrival: number;
  sellableRooms: number | null;
  occupancyPercent: number | null;
  forecast: { occupancyPercent: number | null } | null;
  completion: { available: boolean; reason?: string; confidence?: 'LOW' | 'MEDIUM' | 'HIGH'; sampleSize: number };
  pickup: Record<string, number | null>;
  paceStatus: string;
  demandSignal?: string;
  rateContext?: RecommendationRateContext | null;
};
export type RevenueRecommendation = {
  type: RecommendationType;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'INFO';
  title: string;
  currentRate: number | null;
  suggestedRateRange: { min: number; max: number } | null;
  reasons: string[];
  pickupStrength: PickupStrength;
  pickup7dPercentOfSellable: number | null;
  manualReviewRequired: boolean;
  rateContext: 'SINGLE_RATE' | 'MULTIPLE_RATES' | 'UNAVAILABLE';
  dataQuality: { forecastAvailable: boolean; confidence: 'LOW' | 'MEDIUM' | 'HIGH' | null; sampleSize: number };
};

const roundMoney = (value: number) => Number(value.toFixed(2));
const percent = (value: number | null, sellableRooms: number | null) => value === null || sellableRooms === null || sellableRooms <= 0 ? null : roundMoney(value / sellableRooms * 100);

function pickupStrength(pickup7dRooms: number | null, sellableRooms: number | null) {
  const normalized = percent(pickup7dRooms, sellableRooms);
  if (normalized === null) return { strength: 'UNKNOWN' as const, normalized };
  if (normalized <= RECOMMENDATION_PICKUP_WEAK_PERCENT) return { strength: 'WEAK' as const, normalized };
  if (normalized >= RECOMMENDATION_PICKUP_STRONG_PERCENT) return { strength: 'STRONG' as const, normalized };
  return { strength: 'NORMAL' as const, normalized };
}

function rateDetails(rateContext?: RecommendationRateContext | null) {
  if (!rateContext?.available || !rateContext.rows?.length) return { currentRate: null, rateContext: 'UNAVAILABLE' as const, manualReviewRequired: false };
  if (rateContext.multipleRates || rateContext.rows.length !== 1) return { currentRate: null, rateContext: 'MULTIPLE_RATES' as const, manualReviewRequired: rateContext.rows.some((row) => row.source === 'MANUAL_OVERRIDE') };
  const row = rateContext.rows[0];
  return { currentRate: Number.isFinite(Number(row.effectivePrePromoRate)) && Number(row.effectivePrePromoRate) > 0 ? roundMoney(Number(row.effectivePrePromoRate)) : null, rateContext: 'SINGLE_RATE' as const, manualReviewRequired: row.source === 'MANUAL_OVERRIDE' };
}

function range(currentRate: number | null, minPercent: number, maxPercent: number) {
  return currentRate === null ? null : { min: roundMoney(currentRate * (1 + minPercent / 100)), max: roundMoney(currentRate * (1 + maxPercent / 100)) };
}

export function buildRevenueRecommendation(input: RevenueRecommendationInput): RevenueRecommendation {
  const pickup7dRooms = input.pickup['7'] ?? null;
  const pickup = pickupStrength(pickup7dRooms, input.sellableRooms);
  const rate = rateDetails(input.rateContext);
  const forecastOccupancy = input.forecast?.occupancyPercent ?? null;
  const forecastAvailable = Boolean(input.forecast && input.completion.available && forecastOccupancy !== null);
  const reasons: string[] = [];
  let type: RecommendationType = 'HOLD_RATE';
  let severity: RevenueRecommendation['severity'] = 'INFO';
  let title = 'Hold current pricing';

  if (!input.forecast || !input.completion.available || forecastOccupancy === null) {
    type = 'INSUFFICIENT_DATA'; severity = 'INFO'; title = 'Insufficient data for pricing guidance';
    reasons.push('Insufficient historical data for a forecast-based pricing recommendation.');
  } else if (forecastOccupancy >= RECOMMENDATION_COMPRESSION_OCCUPANCY && input.daysToArrival >= RECOMMENDATION_COMPRESSION_MIN_LEAD_DAYS) {
    type = 'REVIEW_STRONG_UPWARD'; severity = 'HIGH'; title = 'Strong demand — review upward pricing';
    reasons.push(`Forecast occupancy is ${forecastOccupancy}%`);
    if (input.paceStatus === 'AHEAD') reasons.push('Booking pace is ahead of comparable dates');
    if (pickup.strength === 'STRONG') reasons.push('7-day pickup is strong');
    if (input.occupancyPercent !== null && input.occupancyPercent >= 85) reasons.push(`Current OTB occupancy is ${input.occupancyPercent}%`);
    reasons.push(`${input.daysToArrival} days remain before arrival`);
  } else if (forecastOccupancy >= RECOMMENDATION_STRONG_OCCUPANCY && forecastOccupancy < RECOMMENDATION_COMPRESSION_OCCUPANCY && (input.paceStatus === 'AHEAD' || pickup.strength === 'STRONG' || input.demandSignal === 'STRONG')) {
    type = 'REVIEW_UPWARD'; severity = 'MEDIUM'; title = 'Strong demand — review upward pricing';
    reasons.push(`Forecast occupancy is ${forecastOccupancy}%`);
    if (input.paceStatus === 'AHEAD') reasons.push('Booking pace is ahead of comparable dates');
    if (pickup.strength === 'STRONG') reasons.push('7-day pickup is strong');
    if (input.daysToArrival > 0) reasons.push(`${input.daysToArrival} days remain before arrival`);
  } else if (input.daysToArrival <= RECOMMENDATION_SOFT_LEAD_DAYS && forecastOccupancy < RECOMMENDATION_SOFT_OCCUPANCY && input.paceStatus === 'BEHIND' && (pickup.strength === 'WEAK' || pickup.strength === 'UNKNOWN')) {
    type = 'REVIEW_SOFT_DEMAND'; severity = 'MEDIUM'; title = 'Soft demand — review pricing strategy';
    reasons.push(`Forecast occupancy is ${forecastOccupancy}%`);
    reasons.push('Booking pace is behind comparable dates');
    reasons.push('7-day pickup is weak or unavailable');
    reasons.push(`${input.daysToArrival} days remain before arrival`);
  } else {
    reasons.push(forecastOccupancy === null ? 'Forecast occupancy is unavailable.' : `Forecast occupancy is ${forecastOccupancy}%`);
    reasons.push(input.paceStatus === 'ON_PACE' ? 'Booking pace is on pace with comparable dates' : `Booking pace is ${input.paceStatus.toLowerCase().replace('_', ' ')}`);
    reasons.push('Continue monitoring current demand signals');
  }

  if (input.daysToArrival < RECOMMENDATION_COMPRESSION_MIN_LEAD_DAYS && type === 'REVIEW_STRONG_UPWARD') {
    type = 'HOLD_RATE'; severity = 'INFO'; title = 'High demand — limited commercial action remaining';
    reasons.push('The stay date is at or near arrival, so no aggressive upward review range is suggested.');
  }
  if (rate.manualReviewRequired) reasons.push('A manual rate override is currently active; review the decision manually before changing pricing.');
  const currentRate = rate.currentRate;
  const suggestedRateRange = type === 'REVIEW_UPWARD' ? range(currentRate, RECOMMENDATION_UPWARD_MIN_PERCENT, RECOMMENDATION_UPWARD_MAX_PERCENT) : type === 'REVIEW_STRONG_UPWARD' ? range(currentRate, RECOMMENDATION_STRONG_UPWARD_MIN_PERCENT, RECOMMENDATION_STRONG_UPWARD_MAX_PERCENT) : null;
  return { type, severity, title, currentRate, suggestedRateRange: rate.rateContext === 'MULTIPLE_RATES' ? null : suggestedRateRange, reasons, pickupStrength: pickup.strength, pickup7dPercentOfSellable: pickup.normalized, manualReviewRequired: rate.manualReviewRequired, rateContext: rate.rateContext, dataQuality: { forecastAvailable, confidence: input.completion.confidence ?? null, sampleSize: input.completion.sampleSize } };
}

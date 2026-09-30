import { buildRevenueRecommendation } from './revenue-recommendation';

const input = (overrides: Record<string, unknown> = {}) => ({ daysToArrival: 14, sellableRooms: 100, occupancyPercent: 82, forecast: { occupancyPercent: 96 }, completion: { available: true, confidence: 'MEDIUM' as const, sampleSize: 9 }, pickup: { '7': 8 }, paceStatus: 'AHEAD', demandSignal: 'COMPRESSION', rateContext: { available: true, rows: [{ effectivePrePromoRate: 6600, source: 'BASE' }] }, ...overrides });

describe('buildRevenueRecommendation', () => {
  it('returns insufficient data without a range', () => expect(buildRevenueRecommendation(input({ forecast: null, completion: { available: false, reason: 'INSUFFICIENT_HISTORY', sampleSize: 0 } })).type).toBe('INSUFFICIENT_DATA'));
  it('returns strong upward guidance for compression', () => expect(buildRevenueRecommendation(input())).toMatchObject({ type: 'REVIEW_STRONG_UPWARD', suggestedRateRange: { min: 7260, max: 7920 }, pickupStrength: 'NORMAL' }));
  it('returns strong upward guidance for strong pickup', () => expect(buildRevenueRecommendation(input({ forecast: { occupancyPercent: 92 }, pickup: { '7': 12 }, paceStatus: 'ON_PACE' })).type).toBe('REVIEW_STRONG_UPWARD'));
  it('returns upward guidance for strong demand', () => expect(buildRevenueRecommendation(input({ forecast: { occupancyPercent: 82 }, demandSignal: 'NORMAL' })).type).toBe('REVIEW_UPWARD'));
  it('returns upward guidance for strong pickup below compression', () => expect(buildRevenueRecommendation(input({ forecast: { occupancyPercent: 78 }, pickup: { '7': 12 }, paceStatus: 'ON_PACE', demandSignal: 'NORMAL' })).type).toBe('REVIEW_UPWARD'));
  it('holds normal demand', () => { const result = buildRevenueRecommendation(input({ forecast: { occupancyPercent: 65 }, occupancyPercent: 60, pickup: { '7': 4 }, paceStatus: 'ON_PACE', demandSignal: 'NORMAL' })); expect(result).toMatchObject({ type: 'HOLD_RATE', suggestedRateRange: null }); });
  it('flags soft demand without a downward range', () => { const result = buildRevenueRecommendation(input({ daysToArrival: 7, forecast: { occupancyPercent: 35 }, pickup: { '7': 0 }, paceStatus: 'BEHIND', demandSignal: 'SOFT' })); expect(result).toMatchObject({ type: 'REVIEW_SOFT_DEMAND', suggestedRateRange: null }); });
  it('avoids an aggressive range on arrival day', () => { const result = buildRevenueRecommendation(input({ daysToArrival: 0 })); expect(result).toMatchObject({ type: 'HOLD_RATE', suggestedRateRange: null }); });
  it('marks manual override recommendations for manual review', () => expect(buildRevenueRecommendation(input({ rateContext: { available: true, rows: [{ effectivePrePromoRate: 6600, source: 'MANUAL_OVERRIDE' }] } })).manualReviewRequired).toBe(true));
  it('does not fake a single rate when multiple rates exist', () => { const result = buildRevenueRecommendation(input({ rateContext: { available: true, multipleRates: true, rows: [{ effectivePrePromoRate: 6600 }, { effectivePrePromoRate: 7200 }] } })); expect(result).toMatchObject({ rateContext: 'MULTIPLE_RATES', currentRate: null, suggestedRateRange: null }); });
  it('returns no range when rate context is missing', () => expect(buildRevenueRecommendation(input({ rateContext: { available: false } })).suggestedRateRange).toBeNull());
});

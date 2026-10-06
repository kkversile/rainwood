import { toDateOnly } from '../../common/dates';

export function applyAdjustment(amount: number, type: 'PERCENT' | 'FIXED', value: number) {
  return Math.max(0, type === 'PERCENT' ? amount + amount * value / 100 : amount + value);
}

function targetMatches(targets: Array<{ roomTypeId?: string; ratePlanId?: string }> | undefined, id: string) {
  return !targets?.length || targets.some((target) => target.roomTypeId === id || target.ratePlanId === id);
}

export function selectSeason(seasons: any[], date: string, weekday: number, roomTypeId: string, ratePlanId: string) {
  return seasons.find((season) => date >= toDateOnly(new Date(season.startDate)) && date <= toDateOnly(new Date(season.endDate)) && (!season.daysOfWeek?.length || season.daysOfWeek.includes(weekday)) && targetMatches(season.roomTypes, roomTypeId) && targetMatches(season.ratePlans, ratePlanId));
}

export function selectYieldRule(rules: any[], occupancyPercent: number, roomTypeId: string) {
  return rules.find((rule) => occupancyPercent >= rule.occupancyFrom && (occupancyPercent < rule.occupancyTo || (rule.occupancyTo === 100 && occupancyPercent <= 100)) && (!rule.roomTypeId || rule.roomTypeId === roomTypeId));
}

export type PrePromotionRateContext = {
  baseRate: number;
  manualOverride: number | null;
  season: any | null;
  yield: any | null;
  occupancyPercent: number;
  seasonAdjustedRate: number;
  effectivePrePromoRate: number;
  source: 'BASE' | 'MANUAL_OVERRIDE' | 'BASE_SEASON' | 'BASE_YIELD' | 'BASE_SEASON_YIELD';
};

export function resolvePrePromotionRate(input: { rate: any; commercialBase?: number; date: string; weekday: number; roomTypeId: string; ratePlanId: string; inventoryDay?: any; seasons?: any[]; yieldRules?: any[] }): PrePromotionRateContext {
  const baseRate = Number(input.rate?.baseAmount ?? input.rate?.amount ?? 0); const manualOverride = input.rate?.overrideAmount == null ? null : Number(input.rate.overrideAmount); const contractRate = input.rate?.priceSource === 'AGENT_SLAB'; const commercialBase = input.commercialBase ?? (manualOverride ?? baseRate); const hasManualOverride = manualOverride !== null;
  const occupancyPercent = input.inventoryDay?.available > 0 ? Math.min(100, Math.max(0, (Number(input.inventoryDay.held ?? 0) + Number(input.inventoryDay.sold ?? 0) + Number(input.inventoryDay.groupBlocked ?? 0)) / Number(input.inventoryDay.available) * 100)) : 100;
  const season = hasManualOverride || contractRate ? null : selectSeason(input.seasons ?? [], input.date, input.weekday, input.roomTypeId, input.ratePlanId) ?? null; const yieldRule = hasManualOverride || contractRate ? null : selectYieldRule(input.yieldRules ?? [], occupancyPercent, input.roomTypeId) ?? null;
  const seasonAmount = season ? applyAdjustment(commercialBase, season.adjustmentType, Number(season.adjustmentValue)) : commercialBase; const effectivePrePromoRate = yieldRule ? applyAdjustment(seasonAmount, yieldRule.adjustmentType, Number(yieldRule.adjustmentValue)) : seasonAmount;
  const source = hasManualOverride ? 'MANUAL_OVERRIDE' : season && yieldRule ? 'BASE_SEASON_YIELD' : season ? 'BASE_SEASON' : yieldRule ? 'BASE_YIELD' : 'BASE';
  return { baseRate, manualOverride, season, yield: yieldRule, occupancyPercent, seasonAdjustedRate: seasonAmount, effectivePrePromoRate, source };
}

import { Injectable } from '@nestjs/common';
import { toDateOnly } from '../../common/dates';

export type RateValue = {
  amount: number;
  baseAmount: number;
  overrideAmount: number | null;
  taxAmount: number;
  childAmount: number;
  extraAdultAmount: number;
  occupancyPrices: Record<string, number>;
  priceSource: 'RATE_PLAN' | 'LEGACY_AGENT_RATE_PLAN' | 'AGENT_CATEGORY';
  agentRatePlanId?: string;
  contractRateUnavailable?: boolean;
  extraChildWithBedAmount?: number;
  childWithoutBedAmount?: number;
  taxRatePercent?: number;
  taxPolicy?: 'RATE_DAY_PERCENTAGE' | 'CALCULATED_AT_BOOKING';
  category?: 'RACK' | 'A' | 'B' | 'C' | 'D' | 'E';
  assignmentId?: string;
  rateBandId?: string;
  childWithBedAmount?: number;
  canonicalPricing?: boolean;
};

export type AgentCategoryContext = {
  agentId: string;
  hotelId: string;
  category: 'RACK' | 'A' | 'B' | 'C' | 'D' | 'E' | null;
  categoryByDate?: Record<string, 'RACK' | 'A' | 'B' | 'C' | 'D' | 'E'>;
  assignmentByDate?: Record<string, { id: string; category: 'RACK' | 'A' | 'B' | 'C' | 'D' | 'E'; validFrom: Date; validTo: Date }>;
  bands: Array<{ id: string; ratePlanId: string; validFrom: Date; validTo: Date; categoryAAmount: unknown; categoryBAmount: unknown; categoryCAmount: unknown; categoryDAmount: unknown; categoryEAmount: unknown; active?: boolean }>;
  dailyRates?: Array<{ id: string; ratePlanId: string; category: 'A' | 'B' | 'C' | 'D' | 'E'; date: Date; singleAmount: unknown; doubleAmount: unknown; extraAdultAmount: unknown; childWithBedAmount: unknown; childWithoutBedAmount: unknown; active?: boolean }>;
  rackRates?: Array<{ id: string; ratePlanId: string; date: Date; amount: unknown; baseAmount: unknown; childAmount: unknown; childWithoutBedAmount: unknown; extraAdultAmount: unknown; occupancyPrices?: unknown; active?: boolean }>;
  supplements: Array<{ mealPlan: string; validFrom: Date; validTo: Date; extraAdultAmount: unknown; childWithBedAmount: unknown; childWithoutBedAmount: unknown; active?: boolean }>;
  complete: boolean;
  coverageError?: boolean;
};

export const CONTRACT_RATE_ERROR = 'Contract rate is not available for all selected nights.';

export function categoryRateMatches(context: AgentCategoryContext, ratePlanId: string, occupiedNights: Date[]) {
  return occupiedNights.every((night) => {
    const key = toDateOnly(night);
    const category = context.categoryByDate?.[key] ?? context.category;
    if (category === 'RACK') {
      const rack = context.rackRates?.filter((item) => item.ratePlanId === ratePlanId && item.active !== false && toDateOnly(item.date) === key) ?? [];
      return rack.length === 1 && numberOr((rack[0].occupancyPrices as any)?.double ?? rack[0].baseAmount ?? rack[0].amount, 0) > 0;
    }
    const daily = context.dailyRates?.filter((item) => item.ratePlanId === ratePlanId && item.category === category && item.active !== false && toDateOnly(item.date) === key) ?? [];
    if (daily.length) return daily.length === 1 && numberOr(daily[0].doubleAmount, 0) > 0;
    const band = context.bands.find((item) => item.ratePlanId === ratePlanId && item.active !== false && new Date(item.validFrom) <= night && new Date(item.validTo) >= night);
    return Boolean(category) && Boolean(band) && numberOr(band?.[`category${category}Amount` as keyof typeof band], 0) > 0 && context.bands.filter((item) => item.ratePlanId === ratePlanId && item.active !== false && new Date(item.validFrom) <= night && new Date(item.validTo) >= night).length === 1;
  });
}

function numberOr(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function occupancyMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, amount]) => Number.isFinite(Number(amount))).map(([key, amount]) => [key, Number(amount)]));
}

/**
 * RateDay.taxAmount is a persisted fixed tax snapshot for that dated public
 * rate. Category rates are contracted amounts before statutory tax, so retain
 * the authoritative RateDay policy by deriving its effective percentage and
 * applying that percentage to the contracted amount.
 */
function effectiveTaxRatePercent(base: any) {
  const taxableAmount = numberOr(base?.overrideAmount ?? base?.baseAmount ?? base?.amount, 0);
  const taxAmount = numberOr(base?.taxAmount, 0);
  if (taxableAmount <= 0 || taxAmount <= 0) return 0;
  return Number(((taxAmount / taxableAmount) * 100).toFixed(4));
}

@Injectable()
export class RateResolverService {
  taxRatePercent(base: any) {
    return effectiveTaxRatePercent(base);
  }

  resolve(base: any, agentRatePlanId?: string, priceSource: RateValue['priceSource'] = 'RATE_PLAN'): RateValue {
    const baseAmount = numberOr(base?.baseAmount ?? base?.amount, 0);
    const overrideAmount = base?.overrideAmount == null ? null : numberOr(base.overrideAmount, baseAmount);
    const result: RateValue = {
      amount: overrideAmount ?? baseAmount,
      baseAmount,
      overrideAmount,
      taxAmount: numberOr(base?.taxAmount, 0),
      childAmount: numberOr(base?.childAmount, 0),
      extraAdultAmount: numberOr(base?.extraAdultAmount, 0),
      occupancyPrices: occupancyMap(base?.occupancyPrices),
      priceSource,
      ...(agentRatePlanId ? { agentRatePlanId } : {}),
    };
    if (Object.prototype.hasOwnProperty.call(base ?? {}, 'childWithBedAmount')) result.childWithBedAmount = numberOr(base.childWithBedAmount, result.childAmount);
    if (Object.prototype.hasOwnProperty.call(base ?? {}, 'childWithoutBedAmount')) result.childWithoutBedAmount = numberOr(base.childWithoutBedAmount, 0);
    return result;
  }

  categoryResolve(base: any, band: any, context: AgentCategoryContext, plan: any): RateValue {
    const date = new Date(base?.date ?? Date.now());
    const category = context.categoryByDate?.[toDateOnly(date)] ?? context.category;
    if (category === 'RACK') {
      const assignment = context.assignmentByDate?.[toDateOnly(date)];
      const result = this.resolve(base, undefined, 'AGENT_CATEGORY');
      return { ...result, canonicalPricing: true, category, assignmentId: assignment?.id, rateBandId: undefined, contractRateUnavailable: !base || result.amount <= 0 };
    }
    const daily = category ? context.dailyRates?.find((item) => item.ratePlanId === plan?.id && item.category === category && item.active !== false && toDateOnly(item.date) === toDateOnly(date)) : undefined;
    const singleAmount = daily ? numberOr(daily.singleAmount, 0) : 0;
    const doubleAmount = daily ? numberOr(daily.doubleAmount, 0) : category && band ? numberOr(band[`category${category}Amount`], 0) : 0;
    const taxRatePercent = effectiveTaxRatePercent(base);
    const supplement = context.supplements.find((item) => String(item.mealPlan).toUpperCase() === String(plan?.mealPlan).toUpperCase() && new Date(item.validFrom) <= new Date(base?.date ?? Date.now()) && new Date(item.validTo) >= new Date(base?.date ?? Date.now()));
    const extraAdultAmount = daily ? numberOr(daily.extraAdultAmount, 0) : numberOr(supplement?.extraAdultAmount, 0);
    const childWithBedAmount = daily ? numberOr(daily.childWithBedAmount, 0) : numberOr(supplement?.childWithBedAmount, 0);
    const childWithoutBedAmount = daily ? numberOr(daily.childWithoutBedAmount, 0) : numberOr(supplement?.childWithoutBedAmount, 0);
    const result = this.resolve({ ...base, amount: doubleAmount, baseAmount: doubleAmount, overrideAmount: null, taxAmount: Number((doubleAmount * taxRatePercent / 100).toFixed(2)), extraAdultAmount, childAmount: childWithBedAmount, childWithBedAmount, childWithoutBedAmount, occupancyPrices: { single: singleAmount, double: doubleAmount } }, undefined, 'AGENT_CATEGORY');
    const assignment = context.assignmentByDate?.[toDateOnly(date)];
    return { ...result, taxRatePercent, taxPolicy: 'RATE_DAY_PERCENTAGE', extraChildWithBedAmount: childWithBedAmount, childWithBedAmount, childWithoutBedAmount, canonicalPricing: true, category: category ?? undefined, assignmentId: assignment?.id, rateBandId: daily?.id ?? band?.id, contractRateUnavailable: (!daily && !band) || !category || doubleAmount <= 0 };
  }

  private categoryForDate(context: AgentCategoryContext, value: Date) {
    return context.categoryByDate?.[toDateOnly(value)] ?? context.category;
  }

  byDate(plan: any, agentId?: string, categoryContext?: AgentCategoryContext | null) {
    const assignment = agentId ? plan?.assignedAgents?.find((item: any) => item.agentId === agentId && item.active !== false) : undefined;
    return {
      assignment,
      get: (base: any) => {
        if (categoryContext && this.categoryForDate(categoryContext, new Date(base?.date ?? Date.now()))) {
          const date = new Date(base?.date ?? Date.now());
          const band = categoryContext.bands.find((item) => item.ratePlanId === plan?.id && new Date(item.validFrom) <= date && new Date(item.validTo) >= date && item.active !== false);
          return this.categoryResolve(base, band, categoryContext, plan);
        }
        return this.resolve(base, assignment?.id, assignment ? 'LEGACY_AGENT_RATE_PLAN' : 'RATE_PLAN');
      },
    };
  }
}

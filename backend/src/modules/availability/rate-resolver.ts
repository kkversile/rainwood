import { BadRequestException, Injectable } from '@nestjs/common';
import { toDateOnly } from '../../common/dates';

export type RateValue = {
  amount: number;
  baseAmount: number;
  overrideAmount: number | null;
  taxAmount: number;
  childAmount: number;
  extraAdultAmount: number;
  occupancyPrices: Record<string, number>;
  priceSource: 'RATE_PLAN' | 'LEGACY_AGENT_RATE_PLAN' | 'AGENT_SLAB' | 'AGENT_CATEGORY';
  agentRatePlanId?: string;
  slabId?: string;
  slabCode?: string;
  slabVersion?: number;
  slabRateId?: string;
  contractRateUnavailable?: boolean;
  extraChildWithBedAmount?: number;
  childWithoutBedAmount?: number;
  taxRatePercent?: number;
  taxPolicy?: 'RATE_DAY_PERCENTAGE' | 'CALCULATED_AT_BOOKING';
  category?: 'A' | 'B' | 'C' | 'D' | 'E';
  assignmentId?: string;
  rateBandId?: string;
};

export type AgentSlabContext = {
  assignment: { slabId: string; slab: { id: string; code: string; version: number } };
  rates: Array<{ id: string; slabId: string; ratePlanId: string; validFrom: Date; validTo: Date; amount: unknown; extraAdultAmount: unknown; extraChildWithBedAmount: unknown; childWithoutBedAmount: unknown; occupancyPrices?: unknown; active?: boolean }>;
  fullAssignmentCoverage?: boolean;
};

export type AgentCategoryContext = {
  agentId: string;
  hotelId: string;
  category: 'A' | 'B' | 'C' | 'D' | 'E' | null;
  categoryByDate?: Record<string, 'A' | 'B' | 'C' | 'D' | 'E'>;
  assignmentByDate?: Record<string, { id: string; category: 'A' | 'B' | 'C' | 'D' | 'E'; validFrom: Date; validTo: Date }>;
  bands: Array<{ id: string; ratePlanId: string; validFrom: Date; validTo: Date; categoryAAmount: unknown; categoryBAmount: unknown; categoryCAmount: unknown; categoryDAmount: unknown; categoryEAmount: unknown; active?: boolean }>;
  supplements: Array<{ mealPlan: string; validFrom: Date; validTo: Date; extraAdultAmount: unknown; childWithBedAmount: unknown; childWithoutBedAmount: unknown; active?: boolean }>;
  complete: boolean;
  coverageError?: boolean;
};

export const CONTRACT_RATE_ERROR = 'Contract rate is not available for all selected nights.';

export function slabRateMatches(context: AgentSlabContext, ratePlanId: string, occupiedNights: Date[]) {
  return occupiedNights.every((night) => context.rates.filter((item) => item.ratePlanId === ratePlanId && item.active !== false && toDateOnly(item.validFrom) <= toDateOnly(night) && toDateOnly(item.validTo) >= toDateOnly(night)).length === 1);
}

export function assertSlabCoverage(context: AgentSlabContext | null | undefined, ratePlanId: string, occupiedNights: Date[]) {
  if (context && !slabRateMatches(context, ratePlanId, occupiedNights)) throw new BadRequestException(CONTRACT_RATE_ERROR);
}

export function categoryRateMatches(context: AgentCategoryContext, ratePlanId: string, occupiedNights: Date[]) {
  return occupiedNights.every((night) => {
    const key = toDateOnly(night);
    const category = context.categoryByDate?.[key] ?? context.category;
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
 * rate. Agent slabs are contracted amounts before statutory tax, so retain the
 * authoritative RateDay policy by deriving its effective percentage and
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
    return {
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
  }

  slabResolve(base: any, slabRate: any, context: AgentSlabContext): RateValue {
    if (!slabRate) return { ...this.resolve(base, undefined, 'AGENT_SLAB'), amount: 0, baseAmount: 0, contractRateUnavailable: true, slabId: context.assignment.slab.id, slabCode: context.assignment.slab.code, slabVersion: context.assignment.slab.version };
    const taxRatePercent = effectiveTaxRatePercent(base);
    const contractAmount = numberOr(slabRate.amount, 0);
    const result = this.resolve({ ...base, amount: contractAmount, baseAmount: contractAmount, overrideAmount: null, taxAmount: Number((contractAmount * taxRatePercent / 100).toFixed(2)), extraAdultAmount: slabRate.extraAdultAmount, childAmount: slabRate.extraChildWithBedAmount, occupancyPrices: slabRate.occupancyPrices }, undefined, 'AGENT_SLAB');
    return { ...result, taxRatePercent, taxPolicy: 'RATE_DAY_PERCENTAGE', slabId: context.assignment.slab.id, slabCode: context.assignment.slab.code, slabVersion: context.assignment.slab.version, slabRateId: slabRate.id, extraChildWithBedAmount: numberOr(slabRate.extraChildWithBedAmount, 0), childWithoutBedAmount: numberOr(slabRate.childWithoutBedAmount, 0) };
  }

  categoryResolve(base: any, band: any, context: AgentCategoryContext, plan: any): RateValue {
    const date = new Date(base?.date ?? Date.now());
    const category = context.categoryByDate?.[toDateOnly(date)] ?? context.category;
    const amount = category && band ? numberOr(band[`category${category}Amount`], 0) : 0;
    const taxRatePercent = effectiveTaxRatePercent(base);
    const supplement = context.supplements.find((item) => String(item.mealPlan).toUpperCase() === String(plan?.mealPlan).toUpperCase() && new Date(item.validFrom) <= new Date(base?.date ?? Date.now()) && new Date(item.validTo) >= new Date(base?.date ?? Date.now()));
    const result = this.resolve({ ...base, amount, baseAmount: amount, overrideAmount: null, taxAmount: Number((amount * taxRatePercent / 100).toFixed(2)), extraAdultAmount: supplement?.extraAdultAmount ?? 0, childAmount: supplement?.childWithBedAmount ?? 0 }, undefined, 'AGENT_CATEGORY');
    const assignment = context.assignmentByDate?.[toDateOnly(date)];
    return { ...result, taxRatePercent, taxPolicy: 'RATE_DAY_PERCENTAGE', extraChildWithBedAmount: numberOr(supplement?.childWithBedAmount, 0), childWithoutBedAmount: numberOr(supplement?.childWithoutBedAmount, 0), category: category ?? undefined, assignmentId: assignment?.id, rateBandId: band?.id, slabId: undefined, slabCode: undefined, slabVersion: undefined, slabRateId: undefined, contractRateUnavailable: !band || !category || amount <= 0 };
  }

  private categoryForDate(context: AgentCategoryContext, value: Date) {
    return context.categoryByDate?.[toDateOnly(value)] ?? context.category;
  }

  byDate(plan: any, agentId?: string, slabContext?: AgentSlabContext | null, categoryContext?: AgentCategoryContext | null) {
    const assignment = agentId ? plan?.assignedAgents?.find((item: any) => item.agentId === agentId && item.active !== false) : undefined;
    return {
      assignment,
      get: (base: any) => {
        if (slabContext?.assignment) {
          // A hotel/category contract is more specific than an agent-wide slab.
          // Keep the slab as a fallback for hotels without a category mapping.
          if (categoryContext && this.categoryForDate(categoryContext, new Date(base?.date ?? Date.now()))) {
            const date = new Date(base?.date ?? Date.now());
            const band = categoryContext.bands.find((item) => item.ratePlanId === plan?.id && new Date(item.validFrom) <= date && new Date(item.validTo) >= date && item.active !== false);
            return this.categoryResolve(base, band, categoryContext, plan);
          }
          const date = new Date(base?.date ?? Date.now());
          const slabRate = slabContext.rates.find((item) => item.ratePlanId === plan?.id && new Date(item.validFrom) <= date && new Date(item.validTo) >= date && item.active !== false);
          return this.slabResolve(base, slabRate, slabContext);
        }
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

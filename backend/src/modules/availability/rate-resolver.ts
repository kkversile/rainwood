import { Injectable } from '@nestjs/common';

export type RateValue = {
  amount: number;
  taxAmount: number;
  childAmount: number;
  extraAdultAmount: number;
  occupancyPrices: Record<string, number>;
  priceSource: 'BASE' | 'AGENT_OVERRIDE';
  agentRatePlanId?: string;
};

function numberOr(value: unknown, fallback: number) {
  if (value === null || value === undefined || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function occupancyMap(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, amount]) => Number.isFinite(Number(amount))).map(([key, amount]) => [key, Number(amount)]));
}

@Injectable()
export class RateResolverService {
  resolve(base: any, override?: any, agentRatePlanId?: string): RateValue {
    const baseOccupancy = occupancyMap(base?.occupancyPrices);
    const overrideOccupancy = occupancyMap(override?.occupancyPrices);
    const hasOverrideValue = Boolean(override) && [override?.amount, override?.taxAmount, override?.childAmount, override?.extraAdultAmount].some((value) => value !== null && value !== undefined) || Object.keys(overrideOccupancy).length > 0;
    return {
      amount: numberOr(override?.amount, numberOr(base?.amount, 0)),
      taxAmount: numberOr(override?.taxAmount, numberOr(base?.taxAmount, 0)),
      childAmount: numberOr(override?.childAmount, numberOr(base?.childAmount, 0)),
      extraAdultAmount: numberOr(override?.extraAdultAmount, numberOr(base?.extraAdultAmount, 0)),
      occupancyPrices: { ...baseOccupancy, ...overrideOccupancy },
      priceSource: hasOverrideValue ? 'AGENT_OVERRIDE' : 'BASE',
      ...(hasOverrideValue && agentRatePlanId ? { agentRatePlanId } : {}),
    };
  }

  byDate(plan: any, agentId?: string) {
    const assignment = agentId ? plan?.assignedAgents?.find((item: any) => item.agentId === agentId && item.active !== false) : undefined;
    const overrides = new Map<string, any>(assignment?.pricingMode === 'OVERRIDE' ? (assignment?.rates ?? []).map((rate: any) => [this.dateKey(rate.date), rate]) : []);
    return {
      assignment,
      get: (base: any) => this.resolve(base, base ? overrides.get(this.dateKey(base.date)) : undefined, assignment?.id),
    };
  }

  dateKey(value: Date | string) {
    return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
  }
}

import { Injectable } from '@nestjs/common';

export type RateValue = {
  amount: number;
  taxAmount: number;
  childAmount: number;
  extraAdultAmount: number;
  occupancyPrices: Record<string, number>;
  priceSource: 'RATE_PLAN';
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
  resolve(base: any, agentRatePlanId?: string): RateValue {
    return {
      amount: numberOr(base?.amount, 0),
      taxAmount: numberOr(base?.taxAmount, 0),
      childAmount: numberOr(base?.childAmount, 0),
      extraAdultAmount: numberOr(base?.extraAdultAmount, 0),
      occupancyPrices: occupancyMap(base?.occupancyPrices),
      priceSource: 'RATE_PLAN',
      ...(agentRatePlanId ? { agentRatePlanId } : {}),
    };
  }

  byDate(plan: any, agentId?: string) {
    const assignment = agentId ? plan?.assignedAgents?.find((item: any) => item.agentId === agentId && item.active !== false) : undefined;
    return {
      assignment,
      get: (base: any) => this.resolve(base, assignment?.id),
    };
  }
}

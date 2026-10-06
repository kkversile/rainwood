import { RateResolverService, assertSlabCoverage, CONTRACT_RATE_ERROR } from './rate-resolver';
import { BadRequestException } from '@nestjs/common';

describe('RateResolverService', () => {
  const resolver = new RateResolverService();
  const base = { date: new Date('2099-01-10T00:00:00Z'), amount: 5000, taxAmount: 500, childAmount: 200, extraAdultAmount: 300, occupancyPrices: { double: 5000, triple: 6200 } };

  it('resolves the selected RateDay without an agent price source', () => {
    const result = resolver.resolve(base, 'agent-plan-1');
    expect(result).toEqual({ amount: 5000, baseAmount: 5000, overrideAmount: null, taxAmount: 500, childAmount: 200, extraAdultAmount: 300, occupancyPrices: { double: 5000, triple: 6200 }, priceSource: 'RATE_PLAN', agentRatePlanId: 'agent-plan-1' });
  });

  it('uses the RateDay for an active agent assignment', () => {
    const plan = { assignedAgents: [{ id: 'agent-plan-1', agentId: 'agent-1', active: true }] };
    const result = resolver.byDate(plan, 'agent-1').get(base);
    expect(result.amount).toBe(5000);
    expect(result.priceSource).toBe('LEGACY_AGENT_RATE_PLAN');
    expect(result.agentRatePlanId).toBe('agent-plan-1');
  });

  it('does not attach an assignment when the agent has no active mapping', () => {
    const plan = { assignedAgents: [{ id: 'agent-plan-1', agentId: 'agent-1', active: false }] };
    const result = resolver.byDate(plan, 'agent-1').get(base);
    expect(result.priceSource).toBe('RATE_PLAN');
    expect(result.agentRatePlanId).toBeUndefined();
  });

  it('uses the assigned slab row and keeps child pricing separate', () => {
    const plan = { id: 'plan-1', assignedAgents: [{ id: 'legacy-plan', agentId: 'agent-1', active: true }] };
    const slab = { assignment: { slabId: 'slab-1', slab: { id: 'slab-1', code: 'PARTNER-2026', version: 1 } }, rates: [{ slabId: 'slab-1', ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), amount: 7200, extraAdultAmount: 900, extraChildWithBedAmount: 450, childWithoutBedAmount: 200, occupancyPrices: { double: 7200 } }] };
    const result = resolver.byDate(plan, 'agent-1', slab as any).get({ ...base, ratePlanId: 'plan-1' } as any);
    expect(result).toMatchObject({ amount: 7200, extraAdultAmount: 900, extraChildWithBedAmount: 450, childWithoutBedAmount: 200, priceSource: 'AGENT_SLAB', slabId: 'slab-1' });
  });

  it('derives slab tax from the authoritative RateDay percentage instead of copying a fixed tax amount', () => {
    const plan = { id: 'plan-1' };
    const slabContext = { assignment: { slabId: 'slab-1', slab: { id: 'slab-1', code: 'SLAB-B', version: 1 } }, rates: [{ id: 'slab-rate-1', slabId: 'slab-1', ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), amount: 6000, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 }] } as any;
    const first = resolver.byDate(plan, 'agent-1', slabContext).get({ ...base, amount: 5000, taxAmount: 900, ratePlanId: 'plan-1', date: new Date('2099-01-10') });
    expect(first).toMatchObject({ amount: 6000, taxAmount: 1080, taxRatePercent: 18, taxPolicy: 'RATE_DAY_PERCENTAGE' });
    slabContext.rates[0].amount = 6500;
    const second = resolver.byDate(plan, 'agent-1', slabContext).get({ ...base, amount: 5000, taxAmount: 900, ratePlanId: 'plan-1', date: new Date('2099-01-10') });
    expect(second).toMatchObject({ amount: 6500, taxAmount: 1170, taxRatePercent: 18 });
    expect(second.taxAmount).not.toBe(900);
  });

  it('does not fall back to a legacy agent rate when a slab row is missing', () => {
    const plan = { assignedAgents: [{ id: 'legacy-plan', agentId: 'agent-1', active: true }] };
    const slab = { assignment: { slabId: 'slab-1', slab: { id: 'slab-1', code: 'PARTNER-2026', version: 1 } }, rates: [] };
    const result = resolver.byDate(plan, 'agent-1', slab as any).get({ ...base, ratePlanId: 'plan-1' } as any);
    expect(result).toMatchObject({ amount: 0, priceSource: 'AGENT_SLAB', slabId: 'slab-1', contractRateUnavailable: true });
    expect(result.agentRatePlanId).toBeUndefined();
  });

  it('requires exactly one active row for every occupied night', () => {
    const context: any = { assignment: { slabId: 'slab-1', slab: { id: 'slab-1', code: 'PARTNER-2026', version: 1 } }, rates: [{ ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-10'), active: true }] };
    expect(() => assertSlabCoverage(context, 'plan-1', [new Date('2099-01-10'), new Date('2099-01-11')])).toThrow(new BadRequestException(CONTRACT_RATE_ERROR));
    context.rates.push({ ...context.rates[0], validFrom: new Date('2099-01-05'), validTo: new Date('2099-01-10') });
    expect(() => assertSlabCoverage(context, 'plan-1', [new Date('2099-01-10')])).toThrow(CONTRACT_RATE_ERROR);
  });
});

import { RateResolverService } from './rate-resolver';

describe('RateResolverService', () => {
  const resolver = new RateResolverService();
  const base = { date: new Date('2099-01-10T00:00:00Z'), amount: 5000, taxAmount: 500, childAmount: 200, extraAdultAmount: 300, occupancyPrices: { double: 5000, triple: 6200 } };

  it('uses agent values and inherits nullable fields from the base rate', () => {
    const result = resolver.resolve(base, { amount: 4000, taxAmount: null, occupancyPrices: { double: 4100 } }, 'agent-plan-1');
    expect(result.amount).toBe(4000);
    expect(result.taxAmount).toBe(500);
    expect(result.childAmount).toBe(200);
    expect(result.occupancyPrices).toEqual({ double: 4100, triple: 6200 });
    expect(result.priceSource).toBe('AGENT_OVERRIDE');
    expect(result.agentRatePlanId).toBe('agent-plan-1');
  });

  it('does not resolve an agent override without a base date', () => {
    const plan = { assignedAgents: [{ id: 'agent-plan-1', agentId: 'agent-1', active: true, rates: [{ date: base.date, amount: 4000 }] }] };
    const result = resolver.byDate(plan, 'agent-1').get(undefined);
    expect(result.priceSource).toBe('BASE');
    expect(result.amount).toBe(0);
  });

  it('ignores stored overrides in BASE mode', () => {
    const plan = { assignedAgents: [{ id: 'agent-plan-1', agentId: 'agent-1', active: true, pricingMode: 'BASE', rates: [{ date: base.date, amount: 4000 }] }] };
    const result = resolver.byDate(plan, 'agent-1').get(base);
    expect(result.amount).toBe(5000);
    expect(result.priceSource).toBe('BASE');
  });

  it('applies date overrides only in OVERRIDE mode', () => {
    const plan = { assignedAgents: [{ id: 'agent-plan-1', agentId: 'agent-1', active: true, pricingMode: 'OVERRIDE', rates: [{ date: base.date, amount: 4000 }] }] };
    const result = resolver.byDate(plan, 'agent-1').get(base);
    expect(result.amount).toBe(4000);
    expect(result.priceSource).toBe('AGENT_OVERRIDE');
  });
});

import { RateResolverService } from './rate-resolver';

describe('RateResolverService', () => {
  const resolver = new RateResolverService();
  const base = { date: new Date('2099-01-10T00:00:00Z'), amount: 5000, taxAmount: 500, childAmount: 200, extraAdultAmount: 300, occupancyPrices: { double: 5000, triple: 6200 } };

  it('resolves the selected RateDay without an agent price source', () => {
    const result = resolver.resolve(base, 'agent-plan-1');
    expect(result).toEqual({ amount: 5000, taxAmount: 500, childAmount: 200, extraAdultAmount: 300, occupancyPrices: { double: 5000, triple: 6200 }, priceSource: 'RATE_PLAN', agentRatePlanId: 'agent-plan-1' });
  });

  it('uses the RateDay for an active agent assignment', () => {
    const plan = { assignedAgents: [{ id: 'agent-plan-1', agentId: 'agent-1', active: true }] };
    const result = resolver.byDate(plan, 'agent-1').get(base);
    expect(result.amount).toBe(5000);
    expect(result.priceSource).toBe('RATE_PLAN');
    expect(result.agentRatePlanId).toBe('agent-plan-1');
  });

  it('does not attach an assignment when the agent has no active mapping', () => {
    const plan = { assignedAgents: [{ id: 'agent-plan-1', agentId: 'agent-1', active: false }] };
    const result = resolver.byDate(plan, 'agent-1').get(base);
    expect(result.priceSource).toBe('RATE_PLAN');
    expect(result.agentRatePlanId).toBeUndefined();
  });
});

import { RateResolverService, categoryRateMatches } from './rate-resolver';

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

  it('resolves a hotel category contract', () => {
    const plan = { id: 'plan-1', mealPlan: 'CP', assignedAgents: [{ id: 'legacy-plan', agentId: 'agent-1', active: true }] };
    const category: any = { agentId: 'agent-1', hotelId: 'hotel-a', category: 'C', categoryByDate: { '2099-01-10': 'C' }, bands: [{ ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), categoryAAmount: 7000, categoryBAmount: 6400, categoryCAmount: 5600, categoryDAmount: 5200, categoryEAmount: 4800 }], supplements: [], complete: true };
    const result = resolver.byDate(plan, 'agent-1', category).get({ ...base, date: new Date('2099-01-10'), ratePlanId: 'plan-1' });
    expect(result).toMatchObject({ amount: 5600, priceSource: 'AGENT_CATEGORY' });
    expect(result.amount).not.toBe(6200);
  });

  it('resolves sequential category assignments per night', () => {
    const context: any = { category: 'C', categoryByDate: { '2099-01-10': 'C', '2099-01-11': 'A' }, bands: [{ ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-10'), categoryAAmount: 5000, categoryBAmount: 4800, categoryCAmount: 4600, categoryDAmount: 4400, categoryEAmount: 4200 }, { ratePlanId: 'plan-1', validFrom: new Date('2099-01-11'), validTo: new Date('2099-01-31'), categoryAAmount: 5100, categoryBAmount: 4900, categoryCAmount: 4700, categoryDAmount: 4500, categoryEAmount: 4300 }], supplements: [], complete: true };
    const plan = { id: 'plan-1', mealPlan: 'CP' };
    expect(resolver.byDate(plan, 'agent-1', context).get({ ...base, date: new Date('2099-01-10') }).amount).toBe(4600);
    expect(resolver.byDate(plan, 'agent-1', context).get({ ...base, date: new Date('2099-01-11') }).amount).toBe(5100);
  });

  it('resolves an internal agent category and meal-plan guest supplements', () => {
    const context: any = {
      agentId: 'agent-1', hotelId: 'hotel-1', category: 'C', complete: true,
      bands: [{ id: 'band-1', ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), categoryAAmount: 7000, categoryBAmount: 6800, categoryCAmount: 6400, categoryDAmount: 6100, categoryEAmount: 5900 }],
      supplements: [{ mealPlan: 'CP', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), extraAdultAmount: 900, childWithBedAmount: 450, childWithoutBedAmount: 200 }],
    };
    const result = resolver.byDate({ id: 'plan-1', mealPlan: 'CP' }, 'agent-1', context).get({ ...base, date: new Date('2099-01-10'), amount: 5000, taxAmount: 900 });
    expect(result).toMatchObject({ amount: 6400, priceSource: 'AGENT_CATEGORY', extraAdultAmount: 900, extraChildWithBedAmount: 450, childWithoutBedAmount: 200, taxRatePercent: 18 });
    expect(categoryRateMatches(context, 'plan-1', [new Date('2099-01-10')])).toBe(true);
  });

  it('prefers a normalized daily category row over legacy scalar bands', () => {
    const context: any = {
      agentId: 'agent-1', hotelId: 'hotel-1', category: 'C', categoryByDate: { '2099-01-10': 'C' }, complete: true,
      dailyRates: [{ id: 'daily-1', ratePlanId: 'plan-1', category: 'C', date: new Date('2099-01-10'), singleAmount: 5100, doubleAmount: 5600, extraAdultAmount: 700, childWithBedAmount: 350, childWithoutBedAmount: 150 }],
      bands: [{ id: 'legacy-1', ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), categoryAAmount: 7000, categoryBAmount: 6800, categoryCAmount: 6400, categoryDAmount: 6100, categoryEAmount: 5900 }],
      supplements: [{ mealPlan: 'CP', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), extraAdultAmount: 900, childWithBedAmount: 450, childWithoutBedAmount: 200 }],
    };
    const result = resolver.byDate({ id: 'plan-1', mealPlan: 'CP' }, 'agent-1', context).get({ ...base, date: new Date('2099-01-10'), amount: 5000, taxAmount: 900 });
    expect(result).toMatchObject({ amount: 5600, priceSource: 'AGENT_CATEGORY', canonicalPricing: true, extraAdultAmount: 700, childWithBedAmount: 350, childWithoutBedAmount: 150, rateBandId: 'daily-1' });
    expect(result.occupancyPrices).toEqual({ single: 5100, double: 5600 });
  });

  it('marks a category period incomplete instead of falling back', () => {
    const context: any = { category: 'A', bands: [{ ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-10'), active: true }] };
    expect(categoryRateMatches(context, 'plan-1', [new Date('2099-01-10'), new Date('2099-01-11')])).toBe(false);
  });

  it('resolves RACK from the canonical RateDay and never from category A', () => {
    const context: any = {
      category: 'RACK', categoryByDate: { '2099-01-10': 'RACK' }, complete: true,
      bands: [{ ratePlanId: 'plan-1', validFrom: new Date('2099-01-01'), validTo: new Date('2099-01-31'), categoryAAmount: 100, categoryBAmount: 200, categoryCAmount: 300, categoryDAmount: 400, categoryEAmount: 500 }],
      rackRates: [{ id: 'rack-1', ratePlanId: 'plan-1', date: new Date('2099-01-10'), amount: 5000, baseAmount: 5000, occupancyPrices: { single: 4500, double: 5000 }, childAmount: 250, extraAdultAmount: 600 }], supplements: [],
    };
    const result = resolver.byDate({ id: 'plan-1', mealPlan: 'EP' }, 'agent-1', context).get({ ...base, date: new Date('2099-01-10'), amount: 5000 });
    expect(result).toMatchObject({ amount: 5000, priceSource: 'AGENT_CATEGORY', category: 'RACK', canonicalPricing: true, contractRateUnavailable: false });
    expect(result.amount).not.toBe(100);
    expect(categoryRateMatches(context, 'plan-1', [new Date('2099-01-10')])).toBe(true);
  });

  it('rejects a RACK contract when the canonical RateDay is missing or zero', () => {
    const context: any = { category: 'RACK', categoryByDate: { '2099-01-10': 'RACK' }, rackRates: [], bands: [], supplements: [] };
    expect(categoryRateMatches(context, 'plan-1', [new Date('2099-01-10')])).toBe(false);
  });
});

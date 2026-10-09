import { AgentCategoryRatesService } from './agent-rate-slabs.service';

describe('AgentCategoryRatesService', () => {
  it('returns category-based rates without consulting legacy slabs', async () => {
    const categoryRates = { source: 'AGENT_CATEGORY', mappings: [{ hotelId: 'hotel-1' }], rates: [{ id: 'plan-1' }] };
    const rateMaster = { effectiveRatesForAgent: jest.fn().mockResolvedValue(categoryRates) };
    const service = new AgentCategoryRatesService({} as any, undefined, undefined, rateMaster as any);

    await expect(service.effectiveRates('agent-1', '2026-10-10', '2026-10-12')).resolves.toEqual(categoryRates);
    expect(rateMaster.effectiveRatesForAgent).toHaveBeenCalled();
  });
});

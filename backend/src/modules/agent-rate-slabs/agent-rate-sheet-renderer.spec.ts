import { AgentRateSheetRenderer } from './agent-rate-sheet-renderer';

describe('AgentRateSheetRenderer', () => {
  it('renders a static escaped sheet with no executable content', () => {
    const html = new AgentRateSheetRenderer().render({ agent: { name: '<Agent>', companyName: 'Agency', email: 'a@example.test' }, slab: { code: 'SLAB-B', name: 'Winter', version: 1, validFrom: '2026-10-01', validTo: '2027-03-31' }, hotels: [{ name: '<Hotel>', city: 'Kodaikanal', description: 'Safe', canonicalLink: 'https://example.test/hotel', rooms: [{ name: 'Deluxe', rates: [{ mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2026-12-31', amount: 6000, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 }, { mealPlan: 'CP', validFrom: '2027-01-01', validTo: '2027-03-31', amount: 6500, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 }] }], supplements: [], inclusions: 'Breakfast', guidelines: 'Guidelines', bankAccounts: [] }] });
    expect(html).toContain('&lt;Agent&gt;');
    expect(html).toContain('INR 6,000.00');
    expect(html).toContain('2026-10-01');
    expect(html).toContain('2026-12-31');
    expect(html).toContain('2027-01-01');
    expect(html).toContain('INR 6,500.00');
    expect(html).toContain('target="_blank" rel="noopener noreferrer"');
    expect(html).not.toContain('<script');
  });
});

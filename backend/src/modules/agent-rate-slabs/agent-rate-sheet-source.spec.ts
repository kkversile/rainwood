import { AgentRateSheetRenderer } from './agent-rate-sheet-renderer';

describe('audited seasonal source rate-sheet fixture', () => {
  it('renders the selected Casa Bella source values without inventing missing meal plans', () => {
    const html = new AgentRateSheetRenderer().render({
      agent: { name: 'Demo Agent', email: 'agent@example.test' },
      slab: { code: 'SLAB-DEMO-SOURCE-2026-27', name: '2026-27 Seasonal Contract', version: 1, validFrom: '2026-10-01', validTo: '2027-03-31' },
      hotels: [{
        name: 'Casa Bella Thekkady', city: 'Thekkady', description: 'Sanctuary where time stands still, offering simplicity and natural beauty.', canonicalLink: 'https://rainwoodhotels.com/hotels/casa-bella-thekkady/',
        rooms: [
          { name: 'Premium Cottage', rates: [
            { mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2027-03-31', amount: 5000, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 },
            { mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2027-03-31', amount: 6700, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 },
          ] },
          { name: 'Duplex Cottage (For 4 Pax)', rates: [
            { mealPlan: 'CP', validFrom: '2026-10-01', validTo: '2027-03-31', amount: 9500, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 },
            { mealPlan: 'MAP', validFrom: '2026-10-01', validTo: '2027-03-31', amount: 12900, extraAdultAmount: 1500, extraChildWithBedAmount: 1000, childWithoutBedAmount: 800 },
          ] },
        ],
        supplements: [{ name: 'Diwali Hike (05 Nov 2026 - 15 Nov 2026)', startDate: '2026-11-05', endDate: '2026-11-15', amountPerRoomNight: 1000, scope: 'AGENTS' }],
        inclusions: 'CP — Breakfast included; MAP — Breakfast + Dinner. Configured property amenities: On-site parking, High-speed Wi-Fi',
        guidelines: 'Subject to property availability and the published booking terms.',
        bankAccounts: [{ accountName: 'Rain Wood Hotels', bankName: 'ICICI Bank', branch: 'Ravipuram Branch, Ernakulam', accountNumber: '1162-0500-0866', ifsc: 'ICIC0001162', accountType: 'Current Account' }],
      }],
    });

    expect(html).toContain('Casa Bella Thekkady');
    expect(html).toContain('Premium Cottage');
    expect(html).toContain('INR 5,000.00');
    expect(html).toContain('INR 6,700.00');
    expect(html).toContain('INR 9,500.00');
    expect(html).toContain('INR 12,900.00');
    expect(html).toContain('INR 1,500.00');
    expect(html).toContain('INR 1,000.00');
    expect(html).toContain('2026-10-01');
    expect(html).toContain('2027-03-31');
    expect(html).toContain('Diwali Hike (05 Nov 2026 - 15 Nov 2026)');
    expect(html).toContain('ICIC0001162');
    expect(html).toContain('<td>Premium Cottage</td><td>EP</td><td>—</td>');
  });
});

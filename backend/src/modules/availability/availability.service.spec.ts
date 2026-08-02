import { AvailabilityService } from './availability.service';

describe('availability restrictions and pricing', () => {
  const service = new AvailabilityService({} as any);
  const room = { id: 'room', hotelId: 'hotel', name: 'Room', maxAdults: 2, maxChildren: 1, inventory: [{ date: new Date('2099-01-10T00:00:00Z'), available: 2, held: 0, sold: 0, stopSell: false }, { date: new Date('2099-01-11T00:00:00Z'), available: 2, held: 0, sold: 0, stopSell: false }] };
  const plan = { id: 'plan', name: 'Rate', mealPlan: 'CP', rates: [{ date: new Date('2099-01-10T00:00:00Z'), amount: 1000, taxAmount: 100, cta: false, ctd: false, minLos: 2, maxLos: 5 }, { date: new Date('2099-01-11T00:00:00Z'), amount: 1000, taxAmount: 100, cta: false, ctd: false, minLos: 2, maxLos: 5 }] };

  it('checks MLOS at arrival and returns a per-night breakdown', () => {
    const calculate = (service as any).calculate.bind(service);
    const option = calculate(room, plan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.available).toBe(true);
    expect(option.priceBreakdown).toHaveLength(2);
    expect(option.total).toBe(2200);
  });

  it('rejects stop-sell and occupancy without skipping nights', () => {
    const calculate = (service as any).calculate.bind(service);
    const option = calculate({ ...room, inventory: [{ ...room.inventory[0], stopSell: true }, room.inventory[1]] }, plan, { rooms: 1, adults: 3, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.available).toBe(false);
  });
});

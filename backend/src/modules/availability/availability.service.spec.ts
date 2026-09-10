import { AvailabilityService } from './availability.service';
import { RateResolverService } from './rate-resolver';

describe('availability restrictions and pricing', () => {
  const service = new AvailabilityService({} as any, new RateResolverService());
  const room = { id: 'room', hotelId: 'hotel', name: 'Room', maxAdults: 2, maxChildren: 1, maxOccupancy: 3, inventory: [{ date: new Date('2099-01-10T00:00:00Z'), available: 2, held: 0, sold: 0, stopSell: false }, { date: new Date('2099-01-11T00:00:00Z'), available: 2, held: 0, sold: 0, stopSell: false }] };
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

  it('uses an active agent override while retaining base availability', () => {
    const calculate = (service as any).calculate.bind(service);
    const agentPlan = { ...plan, assignedAgents: [{ id: 'agent-rate-1', agentId: 'agent-1', active: true, pricingMode: 'OVERRIDE', rates: [{ date: new Date('2099-01-10T00:00:00Z'), amount: 800, taxAmount: null }, { date: new Date('2099-01-11T00:00:00Z'), amount: 900, taxAmount: null }] }] };
    const option = calculate(room, agentPlan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, 'agent-1');
    expect(option.available).toBe(true);
    expect(option.total).toBe(1900);
    expect(option.priceSource).toBe('AGENT_OVERRIDE');
    expect(option.priceBreakdown.every((night: any) => night.priceSource === 'AGENT_OVERRIDE')).toBe(true);
  });

  it('keeps a plan unavailable when only an agent override exists without base rates', () => {
    const calculate = (service as any).calculate.bind(service);
    const option = calculate(room, { ...plan, rates: [], assignedAgents: [{ id: 'agent-rate-1', agentId: 'agent-1', active: true, rates: [{ date: new Date('2099-01-10T00:00:00Z'), amount: 800 }, { date: new Date('2099-01-11T00:00:00Z'), amount: 900 }] }] }, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, 'agent-1');
    expect(option.available).toBe(false);
  });

  it('uses configured occupancy pricing for the selected occupancy', () => {
    const calculate = (service as any).calculate.bind(service);
    const occupancyPlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 1000, occupancyPrices: { single: 800, double: 1000, triple: 1300 } })) };
    const option = calculate(room, occupancyPlan, { rooms: 1, adults: 1, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.total).toBe(1800);
  });

  it('does not turn a missing double occupancy price into a free booking', () => {
    const calculate = (service as any).calculate.bind(service);
    const option = calculate(room, plan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.total).toBe(2200);
  });

  it('prices two rooms from their deterministic per-room occupancies', () => {
    const calculate = (service as any).calculate.bind(service);
    const twoRoomPlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 3500, occupancyPrices: { single: 3000, double: 4000 } })) };
    const twoRoom = { ...room, inventory: room.inventory.map((day) => ({ ...day, available: 2 })) };
    const option = calculate(twoRoom, twoRoomPlan, { rooms: 2, adults: 3, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.priceBreakdown[0].baseAmount).toBe(7000);
    expect(option.priceBreakdown[0].occupancy).toEqual(['double', 'single']);
  });

  it('accepts explicit per-room occupancy and validates each room independently', () => {
    const calculate = (service as any).calculate.bind(service);
    const twoRoomPlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 3500, occupancyPrices: { single: 3000, double: 4000 } })) };
    const option = calculate({ ...room, inventory: room.inventory.map((day) => ({ ...day, available: 2 })) }, twoRoomPlan, { rooms: 2, adults: 3, children: 0, occupancies: [{ adults: 2, children: 0 }, { adults: 1, children: 0 }] }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.priceBreakdown[0].rooms[0].baseAmount).toBe(4000);
    expect(option.priceBreakdown[0].rooms[1].baseAmount).toBe(3000);
    expect(option.total).toBe(14400);

    const invalid = calculate({ ...room, maxAdults: 3, maxChildren: 1, maxOccupancy: 3 }, plan, { rooms: 1, adults: 2, children: 2, occupancies: [{ adults: 2, children: 2 }] }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(invalid.available).toBe(false);
  });

  it('treats an exact triple occupancy price as the complete room price', () => {
    const calculate = (service as any).calculate.bind(service);
    const triplePlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 3500, extraAdultAmount: 800, occupancyPrices: { triple: 5000 } })) };
    const option = calculate({ ...room, maxAdults: 3, maxOccupancy: 3 }, triplePlan, { rooms: 1, adults: 3, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.priceBreakdown[0].baseAmount).toBe(5000);
    expect(option.priceBreakdown[0].extrasAmount).toBe(0);
  });

  it('applies child and extra-adult supplements only on the base-rate fallback path', () => {
    const calculate = (service as any).calculate.bind(service);
    const supplementPlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 3500, childAmount: 600, extraAdultAmount: 800 })) };
    const childOption = calculate({ ...room, maxAdults: 3, maxChildren: 1, maxOccupancy: 3 }, supplementPlan, { rooms: 1, adults: 2, children: 1 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(childOption.priceBreakdown[0].extrasAmount).toBe(600);
    expect(childOption.total).toBe(8400);
    const adultOption = calculate({ ...room, maxAdults: 3, maxChildren: 0, maxOccupancy: 3 }, supplementPlan, { rooms: 1, adults: 3, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(adultOption.priceBreakdown[0].extrasAmount).toBe(800);
  });
});

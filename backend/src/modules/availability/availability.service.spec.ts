import { AvailabilityService, supplementaryScopeFilter } from './availability.service';
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

  it('uses the RateDay price for an active agent assignment', () => {
    const calculate = (service as any).calculate.bind(service);
    const agentPlan = { ...plan, assignedAgents: [{ id: 'agent-rate-1', agentId: 'agent-1', active: true }] };
    const option = calculate(room, agentPlan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, 'agent-1');
    expect(option.available).toBe(true);
    expect(option.total).toBe(2200);
    expect(option.priceSource).toBe('LEGACY_AGENT_RATE_PLAN');
    expect(option.agentRatePlanId).toBe('agent-rate-1');
    expect(option.priceBreakdown.every((night: any) => night.priceSource === 'LEGACY_AGENT_RATE_PLAN')).toBe(true);
  });

  it('keeps a plan unavailable when RateDay rows are missing', () => {
    const calculate = (service as any).calculate.bind(service);
    const option = calculate(room, { ...plan, rates: [], assignedAgents: [{ id: 'agent-rate-1', agentId: 'agent-1', active: true }] }, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, 'agent-1');
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

  it('uses double plus extra adult for three adults and ignores legacy triple prices', () => {
    const calculate = (service as any).calculate.bind(service);
    const triplePlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 3500, extraAdultAmount: 800, occupancyPrices: { triple: 5000 } })) };
    const option = calculate({ ...room, maxAdults: 3, maxOccupancy: 3 }, triplePlan, { rooms: 1, adults: 3, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(option.priceBreakdown[0].baseAmount).toBe(3500);
    expect(option.priceBreakdown[0].extrasAmount).toBe(800);
  });

  it('uses adult count for the canonical Single/Double grid and keeps child supplements separate', () => {
    const calculate = (service as any).calculate.bind(service);
    const canonicalPlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 2000, occupancyPrices: { single: 1500, double: 2000 }, extraAdultAmount: 500, childAmount: 300, childWithoutBedAmount: 200 })) };
    const oneAdult = calculate({ ...room, maxAdults: 4, maxChildren: 2, maxOccupancy: 6 }, canonicalPlan, { rooms: 1, adults: 1, children: 1 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(oneAdult.priceBreakdown[0].rooms[0]).toEqual(expect.objectContaining({ baseRate: 1500, supplementAmount: 300 }));
    const twoAdultsAndChild = calculate({ ...room, maxAdults: 4, maxChildren: 2, maxOccupancy: 6 }, canonicalPlan, { rooms: 1, adults: 2, children: 1 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(twoAdultsAndChild.priceBreakdown[0].rooms[0]).toEqual(expect.objectContaining({ baseRate: 2000, supplementAmount: 300 }));
    const fourAdults = calculate({ ...room, maxAdults: 4, maxChildren: 0, maxOccupancy: 4 }, canonicalPlan, { rooms: 1, adults: 4, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2);
    expect(fourAdults.priceBreakdown[0].rooms[0]).toEqual(expect.objectContaining({ baseRate: 2000, supplementAmount: 1000 }));
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

  it('applies named supplementary charges per room and night without taxing them', () => {
    const calculate = (service as any).calculate.bind(service);
    const threeNightPlan = { ...plan, rates: [...plan.rates, { ...plan.rates[0], date: new Date('2099-01-12T00:00:00Z') }] };
    const threeNightRoom = { ...room, inventory: [...room.inventory, { ...room.inventory[0], date: new Date('2099-01-12T00:00:00Z') }].map((day) => ({ ...day, available: 2 })) };
    const option = calculate(threeNightRoom, threeNightPlan, { rooms: 2, adults: 3, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-13T00:00:00Z'), 3, undefined, [{ id: 'ny', name: 'New Year Supplement', amountPerRoomNight: 1000, startDate: new Date('2099-01-10T00:00:00Z'), endDate: new Date('2099-01-12T00:00:00Z') }]);
    expect(option.taxTotal).toBe(600);
    expect(option.supplementaryTotal).toBe(6000);
    expect(option.priceBreakdown[0].supplementaryAmount).toBe(2000);
    expect(option.total).toBe(12600);
  });

  it('uses ALL charges for both agent and public searches while AGENTS stays agent-only', () => {
    expect(supplementaryScopeFilter('agent-1')).toEqual({ in: ['AGENTS', 'ALL'] });
    expect(supplementaryScopeFilter()).toBe('ALL');
  });

  it('applies one targeted season then yield per night after the season', () => {
    const calculate = (service as any).calculate.bind(service);
    const seasonalRoom = { ...room, inventory: [{ ...room.inventory[0], available: 2, sold: 1 }, { ...room.inventory[1], available: 2, sold: 1 }] };
    const seasonalPlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 5000, taxAmount: 0 })) };
    const season = { id: 'season-1', name: 'Christmas Peak', startDate: new Date('2099-01-01T00:00:00Z'), endDate: new Date('2099-01-31T00:00:00Z'), daysOfWeek: [], adjustmentType: 'PERCENT', adjustmentValue: 20, priority: 10, roomTypes: [], ratePlans: [] };
    const yieldRule = { id: 'yield-1', name: 'Medium demand', occupancyFrom: 40, occupancyTo: 70, adjustmentType: 'PERCENT', adjustmentValue: 10, priority: 1, roomTypeId: null };
    const option = calculate(seasonalRoom, seasonalPlan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, undefined, [], [], 'DIRECT', undefined, 'UTC', [season], [yieldRule]);
    expect(option.priceBreakdown[0].rooms[0].seasonApplied.name).toBe('Christmas Peak');
    expect(option.priceBreakdown[0].rooms[0].yieldRuleApplied.occupancyPercent).toBe(50);
    expect(option.priceBreakdown[0].baseAmount).toBe(6600);
    expect(option.total).toBe(13200);
  });

  it('suppresses season and yield when a manual override exists', () => {
    const calculate = (service as any).calculate.bind(service);
    const overridePlan = { ...plan, rates: plan.rates.map((rate) => ({ ...rate, amount: 5000, baseAmount: 5000, overrideAmount: 5800, taxAmount: 0 })) };
    const option = calculate(room, overridePlan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, undefined, [], [], 'DIRECT', undefined, 'UTC', [{ id: 'season-1', name: 'Peak', startDate: new Date('2099-01-01T00:00:00Z'), endDate: new Date('2099-01-31T00:00:00Z'), daysOfWeek: [], adjustmentType: 'PERCENT', adjustmentValue: 20, roomTypes: [], ratePlans: [] }], [{ id: 'yield-1', name: 'Yield', occupancyFrom: 0, occupancyTo: 100, adjustmentType: 'PERCENT', adjustmentValue: 30, roomTypeId: null }]);
    expect(option.priceBreakdown[0].rooms[0].manualOverride).toBe(5800);
    expect(option.priceBreakdown[0].rooms[0].seasonApplied).toBeNull();
    expect(option.priceBreakdown[0].rooms[0].yieldRuleApplied).toBeNull();
    expect(option.total).toBe(11600);
  });

  it('allocates promotion cents so nightly discounts and final totals reconcile', () => {
    const calculate = (service as any).calculate.bind(service);
    const dates = ['2099-01-10', '2099-01-11', '2099-01-12'];
    const roundingRoom = { ...room, inventory: dates.map((date) => ({ ...room.inventory[0], date: new Date(`${date}T00:00:00Z`) })) };
    const roundingPlan = { ...plan, rates: dates.map((date, index) => ({ ...plan.rates[0], date: new Date(`${date}T00:00:00Z`), amount: [333.33, 333.33, 333.34][index], taxAmount: 0 })) };
    const option = calculate(roundingRoom, roundingPlan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-13T00:00:00Z'), 3, undefined, [], [{ id: 'fixed', name: 'Fixed', discountType: 'FIXED', discountValue: 100 }], 'DIRECT');
    expect(option.discountAmount).toBe(100);
    expect(option.priceBreakdown.reduce((sum: number, item: any) => sum + item.discountAmount, 0)).toBe(100);
    expect(option.priceBreakdown.reduce((sum: number, item: any) => sum + item.totalAmount, 0)).toBe(option.total);
  });

  it('applies fixed and percentage corporate rates after public pre-promotion pricing', () => {
    const calculate = (service as any).calculate.bind(service);
    const base = { ...room, inventory: room.inventory.map((day) => ({ ...day, available: 2 })) };
    const fixed = calculate(base, plan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, undefined, [], [], 'COMPANY', undefined, 'UTC', [], [], { account: { id: 'corp-1', name: 'Synthetic Corp' }, agreements: [{ id: 'agreement-1', corporateAccountId: 'corp-1', hotelId: 'hotel', roomTypeId: 'room', ratePlanId: 'plan', validFrom: new Date('2099-01-01T00:00:00Z'), validTo: new Date('2099-12-31T00:00:00Z'), pricingType: 'FIXED', fixedRate: 700, discountPercent: null }] });
    expect(fixed.total).toBe(1600);
    expect(fixed.priceBreakdown[0].rooms[0]).toEqual(expect.objectContaining({ publicPrePromoRate: 1000, corporateEffectiveRate: 700, corporateAdjustment: -300 }));
    const percentage = calculate(base, plan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, undefined, [], [], 'COMPANY', undefined, 'UTC', [], [], { account: { id: 'corp-1', name: 'Synthetic Corp' }, agreements: [{ id: 'agreement-2', corporateAccountId: 'corp-1', hotelId: 'hotel', roomTypeId: 'room', ratePlanId: 'plan', validFrom: new Date('2099-01-01T00:00:00Z'), validTo: new Date('2099-12-31T00:00:00Z'), pricingType: 'DISCOUNT_PERCENT', fixedRate: null, discountPercent: 15 }] });
    expect(percentage.total).toBe(1900);
  });

  it('does not stack a public promotion on corporate pricing unless COMPANY is explicit', () => {
    const calculate = (service as any).calculate.bind(service);
    const corporate = { account: { id: 'corp-1', name: 'Synthetic Corp' }, agreements: [{ id: 'agreement-1', roomTypeId: 'room', ratePlanId: 'plan', validFrom: new Date('2099-01-01T00:00:00Z'), validTo: new Date('2099-12-31T00:00:00Z'), pricingType: 'FIXED', fixedRate: 900, discountPercent: null }] };
    const publicPromotion = { id: 'promo-public', name: 'Public', discountType: 'PERCENT', discountValue: 20, channels: ['DIRECT'] };
    const corporatePromotion = { id: 'promo-company', name: 'Company', discountType: 'PERCENT', discountValue: 10, channels: ['COMPANY'] };
    const option = calculate(room, plan, { rooms: 1, adults: 2, children: 0 }, new Date('2099-01-10T00:00:00Z'), new Date('2099-01-12T00:00:00Z'), 2, undefined, [], [publicPromotion, corporatePromotion], 'COMPANY', undefined, 'UTC', [], [], corporate);
    expect(option.promotionApplied?.id).toBe('promo-company');
    expect(option.total).toBe(1800);
  });
});

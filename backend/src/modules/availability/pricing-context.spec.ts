import { resolvePrePromotionRate } from './pricing-context';

const baseInput = (overrides: Record<string, unknown> = {}) => ({
  rate: { amount: 5000, baseAmount: 5000, overrideAmount: null },
  date: '2026-09-30',
  weekday: 3,
  roomTypeId: 'room-1',
  ratePlanId: 'plan-1',
  ...overrides,
});

describe('resolvePrePromotionRate', () => {
  it('returns the base rate without commercial adjustments', () => {
    expect(resolvePrePromotionRate(baseInput())).toMatchObject({ baseRate: 5000, effectivePrePromoRate: 5000, season: null, yield: null, source: 'BASE' });
  });

  it('applies season and then yield through the canonical pricing path', () => {
    const result = resolvePrePromotionRate(baseInput({
      inventoryDay: { available: 20, held: 2, sold: 8 },
      seasons: [{ id: 'season-1', name: 'Peak', startDate: '2026-09-01', endDate: '2026-10-31', daysOfWeek: [], adjustmentType: 'PERCENT', adjustmentValue: 20, roomTypes: [], ratePlans: [] }],
      yieldRules: [{ id: 'yield-1', name: 'Compression', occupancyFrom: 50, occupancyTo: 100, adjustmentType: 'PERCENT', adjustmentValue: 10 }],
    }));
    expect(result).toMatchObject({ occupancyPercent: 50, season: { id: 'season-1' }, yield: { id: 'yield-1' }, seasonAdjustedRate: 6000, effectivePrePromoRate: 6600, source: 'BASE_SEASON_YIELD' });
  });

  it('lets a manual override suppress season and yield adjustments', () => {
    const result = resolvePrePromotionRate(baseInput({
      rate: { amount: 5000, baseAmount: 5000, overrideAmount: 5800 },
      seasons: [{ id: 'season-1', name: 'Peak', startDate: '2026-09-01', endDate: '2026-10-31', daysOfWeek: [], adjustmentType: 'PERCENT', adjustmentValue: 20, roomTypes: [], ratePlans: [] }],
      yieldRules: [{ id: 'yield-1', name: 'Compression', occupancyFrom: 0, occupancyTo: 100, adjustmentType: 'PERCENT', adjustmentValue: 10 }],
    }));
    expect(result).toMatchObject({ manualOverride: 5800, season: null, yield: null, effectivePrePromoRate: 5800, source: 'MANUAL_OVERRIDE' });
  });

  it('uses held plus sold inventory for yield occupancy', () => {
    const result = resolvePrePromotionRate(baseInput({
      inventoryDay: { available: 10, held: 3, sold: 2 },
      yieldRules: [{ id: 'yield-1', name: 'High demand', occupancyFrom: 50, occupancyTo: 100, adjustmentType: 'FIXED', adjustmentValue: 750 }],
    }));
    expect(result).toMatchObject({ occupancyPercent: 50, effectivePrePromoRate: 5750, source: 'BASE_YIELD' });
  });
});

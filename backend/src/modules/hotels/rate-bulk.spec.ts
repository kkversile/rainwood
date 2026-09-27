import { HotelsService } from './hotels.service';

describe('bulk rate management', () => {
  it('previews weekday percentage changes without mutating rates', async () => {
    const prisma: any = {
      ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-1', code: 'BAR', name: 'BAR', roomTypeId: 'room-1', roomType: { name: 'Valley Room' } }]) },
      rateDay: { findMany: jest.fn().mockResolvedValue([{ id: 'day-1', ratePlanId: 'plan-1', date: new Date('2026-10-02T00:00:00Z'), amount: 1000, baseAmount: 1000, overrideAmount: null, cta: false, ctd: false, minLos: 1, maxLos: 5 }]) },
    };
    const service = new HotelsService(prisma, {} as any);
    const result = await service.previewBulkRates('hotel-1', { fromDate: '2026-10-01', toDate: '2026-10-03', daysOfWeek: [5], action: 'INCREASE_PERCENT', value: 10 });
    expect(result.affected).toBe(1);
    expect(result.changes[0].before.effectiveAmount).toBe(1000);
    expect(result.changes[0].after.overrideAmount).toBe(1100);
    expect(prisma.rateDay.update).toBeUndefined();
  });
});

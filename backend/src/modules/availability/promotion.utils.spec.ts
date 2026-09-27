import { selectBestPromotion } from './promotion.utils';

describe('promotion eligibility', () => {
  const base = { bookingDate: '2026-09-28', stayDate: '2026-12-21', nights: 3, subtotal: 10000, roomTypeId: 'room-1', ratePlanId: 'plan-1' };

  it('selects the best eligible promotion and excludes date-window failures', () => {
    const result = selectBestPromotion([
      { id: 'early', name: 'Early bird', discountType: 'PERCENT', discountValue: 10, stayStart: '2026-01-01', stayEnd: '2026-12-31' },
      { id: 'expired', name: 'Expired', discountType: 'PERCENT', discountValue: 50, stayEnd: '2026-12-01' },
      { id: 'fixed', name: 'Best fixed', discountType: 'FIXED', discountValue: 1500, stayStart: '2026-12-01' },
    ], base);
    expect(result?.promotion.id).toBe('fixed');
    expect(result?.discount).toBe(1500);
  });

  it('honours minimum stay, channel, target, and explicit code filters', () => {
    const promotion = { id: 'direct', name: 'Direct', code: 'DIRECT10', discountType: 'PERCENT' as const, discountValue: 10, minNights: 2, channels: ['DIRECT'], roomTypes: [{ roomTypeId: 'room-1' }], ratePlans: [{ ratePlanId: 'plan-1' }] };
    expect(selectBestPromotion([promotion], { ...base, channel: 'WEBSITE', code: 'DIRECT10' })).toBeNull();
    expect(selectBestPromotion([promotion], { ...base, channel: 'DIRECT', code: 'DIRECT10', nights: 1 })).toBeNull();
    expect(selectBestPromotion([promotion], { ...base, channel: 'DIRECT', code: 'DIRECT10' })?.discount).toBe(1000);
  });
});

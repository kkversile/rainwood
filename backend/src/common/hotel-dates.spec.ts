import { getHotelBusinessDayUtcRange, getHotelOperationalDate } from './hotel-dates';
import { toDateOnly } from './dates';

describe('hotel date utilities', () => {
  it('converts an Asia/Kolkata business day to its UTC interval', () => {
    const range = getHotelBusinessDayUtcRange(new Date('2026-09-28T00:00:00.000Z'), 'Asia/Kolkata');
    expect(range.startUtc.toISOString()).toBe('2026-09-27T18:30:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-09-28T18:30:00.000Z');
  });

  it('keeps UTC hotels on UTC calendar boundaries', () => {
    const range = getHotelBusinessDayUtcRange(new Date('2026-09-28T00:00:00.000Z'), 'UTC');
    expect(range.startUtc.toISOString()).toBe('2026-09-28T00:00:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-09-29T00:00:00.000Z');
  });

  it('handles a DST transition without a fixed offset', () => {
    const range = getHotelBusinessDayUtcRange(new Date('2026-03-29T00:00:00.000Z'), 'Europe/London');
    expect(range.startUtc.toISOString()).toBe('2026-03-29T00:00:00.000Z');
    expect(range.endUtc.toISOString()).toBe('2026-03-29T23:00:00.000Z');
  });

  it('returns the current operational calendar date', () => {
    expect(toDateOnly(getHotelOperationalDate('Asia/Kolkata'))).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

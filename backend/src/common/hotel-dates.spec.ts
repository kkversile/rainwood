import { getHotelBusinessDayUtcRange, getHotelOperationalDate, hotelLocalDateTimeToUtc } from './hotel-dates';
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

  it('uses the hotel-local date at a UTC boundary', () => {
    expect(toDateOnly(getHotelOperationalDate('Asia/Kolkata', new Date('2026-09-27T20:00:00.000Z')))).toBe('2026-09-28');
  });

  it('keeps the local date after midnight at 00:30 IST', () => {
    expect(toDateOnly(getHotelOperationalDate('Asia/Kolkata', new Date('2026-09-27T19:00:00.000Z')))).toBe('2026-09-28');
  });

  it('converts hotel-local datetime values to UTC instants', () => {
    expect(hotelLocalDateTimeToUtc('2026-10-03T01:15', 'Asia/Kolkata').toISOString()).toBe('2026-10-02T19:45:00.000Z');
  });
});

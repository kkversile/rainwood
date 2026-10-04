import { HotelBusinessDayStatus } from '@prisma/client';
import { getCurrentHotelBusinessDate } from './hotel-business-day';

describe('getCurrentHotelBusinessDate', () => {
  it('uses the next date after the latest closed business day', async () => {
    const db = { hotelBusinessDay: { findFirst: jest.fn().mockResolvedValueOnce({ businessDate: new Date('2026-10-01T00:00:00Z') }).mockResolvedValueOnce(null) } };
    const result = await getCurrentHotelBusinessDate(db as any, 'hotel-a', 'Asia/Kolkata', new Date('2026-10-03T01:15:00+05:30'));
    expect(result.toISOString().slice(0, 10)).toBe('2026-10-02');
    expect(db.hotelBusinessDay.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { hotelId: 'hotel-a', status: HotelBusinessDayStatus.CLOSED } }));
  });

  it('uses an existing open day and falls back to the hotel calendar when history is absent', async () => {
    const openDb = { hotelBusinessDay: { findFirst: jest.fn().mockResolvedValueOnce(null).mockResolvedValueOnce({ businessDate: new Date('2026-10-02T00:00:00Z') }) } };
    expect((await getCurrentHotelBusinessDate(openDb as any, 'hotel-a', 'Asia/Kolkata', new Date('2026-10-03T01:15:00+05:30'))).toISOString().slice(0, 10)).toBe('2026-10-02');
    const newDb = { hotelBusinessDay: { findFirst: jest.fn().mockResolvedValue(null) } };
    expect((await getCurrentHotelBusinessDate(newDb as any, 'hotel-a', 'Asia/Kolkata', new Date('2026-10-03T01:15:00+05:30'))).toISOString().slice(0, 10)).toBe('2026-10-03');
  });
});

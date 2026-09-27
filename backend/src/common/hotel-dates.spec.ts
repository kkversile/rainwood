import { BadRequestException } from '@nestjs/common';
import { getHotelOperationalDate } from './hotel-dates';

describe('hotel operational dates', () => {
  const boundary = new Date('2026-09-26T20:00:00.000Z');

  it('uses the hotel timezone at the exact Asia/Kolkata boundary', () => {
    expect(getHotelOperationalDate('Asia/Kolkata', boundary).toISOString().slice(0, 10)).toBe('2026-09-27');
    expect(getHotelOperationalDate('UTC', boundary).toISOString().slice(0, 10)).toBe('2026-09-26');
  });

  it('rejects an unknown timezone safely', () => {
    expect(() => getHotelOperationalDate('Not/A_Timezone', boundary)).toThrow(BadRequestException);
  });
});

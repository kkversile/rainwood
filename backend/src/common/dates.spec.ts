import { BadRequestException } from '@nestjs/common';
import { eachNight, nightsBetween, parseDateOnly } from './dates';

describe('date-only stay utilities', () => {
  it('generates check-in inclusive/check-out exclusive nights', () => {
    const nights = eachNight(parseDateOnly('2099-01-10', 'checkIn'), parseDateOnly('2099-01-13', 'checkOut'));
    expect(nights.map((date) => date.toISOString().slice(0, 10))).toEqual(['2099-01-10', '2099-01-11', '2099-01-12']);
    expect(nightsBetween(nights[0], parseDateOnly('2099-01-13', 'checkOut'))).toBe(3);
  });

  it('rejects invalid calendar dates', () => {
    expect(() => parseDateOnly('2099-02-30', 'checkIn')).toThrow(BadRequestException);
  });
});

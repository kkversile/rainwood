import { BadRequestException } from '@nestjs/common';
import { validateCategoryBandInput, validateNewB2cBaseRate } from './rate-master.validation';

describe('Rate Master input validation', () => {
  it('rejects a new category band when B is missing', () => {
    expect(() => validateCategoryBandInput([5000, undefined, 5600, 6000, 6500], false)).toThrow(BadRequestException);
  });

  it('rejects a zero category amount', () => {
    expect(() => validateCategoryBandInput([5000, 0, 5600, 6000, 6500], false)).toThrow('greater than zero');
  });

  it('accepts five positive category amounts and retains omitted update fields', () => {
    expect(() => validateCategoryBandInput([5000, 5200, 5600, 6000, 6500], false)).not.toThrow();
    expect(() => validateCategoryBandInput([undefined, 5600, undefined, undefined, undefined], true)).not.toThrow();
  });

  it('rejects a partial new B2C period without a positive double rate', () => {
    expect(() => validateNewB2cBaseRate(undefined, false)).toThrow('Double occupancy rate');
    expect(() => validateNewB2cBaseRate(0, false)).toThrow('greater than zero');
    expect(() => validateNewB2cBaseRate(5000, false)).not.toThrow();
  });
});

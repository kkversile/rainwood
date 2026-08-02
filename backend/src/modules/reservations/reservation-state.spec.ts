import { BadRequestException } from '@nestjs/common';
import { assertReservationTransition, canTransition } from './reservation-state';

describe('reservation state machine', () => {
  it('allows payment confirmation and prevents cancellation reversal', () => {
    expect(canTransition('PENDING_PAYMENT', 'CONFIRMED')).toBe(true);
    expect(canTransition('CANCELLED', 'CONFIRMED')).toBe(false);
    expect(() => assertReservationTransition('CANCELLED', 'CONFIRMED')).toThrow(BadRequestException);
  });
});

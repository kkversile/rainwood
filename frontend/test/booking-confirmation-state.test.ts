import assert from 'node:assert/strict';
import test from 'node:test';
import { bookingConfirmationState } from '../src/lib/booking-confirmation-state';

test('an offline proof remains pending until booking approval is persisted', () => {
  assert.deepEqual(bookingConfirmationState('PENDING_PAYMENT', 'PENDING'), { label: 'Pending approval', title: 'Booking submitted', tone: 'warn' });
  assert.equal(bookingConfirmationState('PENDING_PAYMENT', 'UNPAID').label, 'Pending confirmation');
  assert.equal(bookingConfirmationState('CONFIRMED', 'PAID').label, 'Confirmed');
});
test('terminal and unknown booking states never claim confirmation', () => {
  for (const status of ['CANCELLED', 'NO_SHOW', 'EXPIRED', 'COMPLETED', 'UNEXPECTED']) assert.notEqual(bookingConfirmationState(status, 'PAID').label, 'Confirmed');
});

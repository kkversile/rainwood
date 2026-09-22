import assert from 'node:assert/strict';
import test from 'node:test';
import { validMilestones } from '../src/components/PaymentMilestoneEditor';
import { agentPaymentConfirmation } from '../src/lib/booking-pricing';

test('payment terms editor requires exactly 100 percent and keeps check-in separate', () => {
  assert.equal(validMilestones([{ percentage: '90', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' }]), false);
  assert.equal(validMilestones([
    { percentage: '10', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '30', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '20' },
    { percentage: '20', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '10' },
    { percentage: '40', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
  ]), true);
});

test('booking confirmation does not call all outstanding balance due at check-in', () => {
  const message = agentPaymentConfirmation({ advanceAmount: 2000, balanceAmount: 18000, totalAmount: 20000, paymentStatus: 'PARTIALLY_PAID', paymentTermsSnapshot: { policy: 'MILESTONES' } });
  assert.match(message, /according to the saved payment schedule/);
  assert.doesNotMatch(message, /due at check-in/);
});

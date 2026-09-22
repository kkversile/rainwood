import assert from 'node:assert/strict';
import test from 'node:test';
import { addRemainingMilestone, emptyMilestone, validMilestones } from '../src/components/PaymentMilestoneEditor';
import { amountDueNow } from '../src/components/ReservationPaymentSchedule';
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

test('blank days remain invalid while explicit zero means check-in', () => {
  assert.equal(validMilestones([{ percentage: '100', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '' }]), false);
  assert.equal(validMilestones([{ percentage: '100', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' }]), true);
  assert.equal(emptyMilestone().dueType, null);
  assert.equal(emptyMilestone().daysBeforeCheckIn, '');
});

test('add remaining leaves the due point unselected', () => {
  const result = addRemainingMilestone([{ percentage: '90', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' }]);
  assert.deepEqual(result[1], { percentage: '10', dueType: null, daysBeforeCheckIn: '' });
});

test('one pay-due action uses the combined dueNow outstanding amount', () => {
  const schedule = {
    paidAmount: 2000,
    outstandingAmount: 18000,
    milestones: [
      { percentage: 10, dueType: 'ON_BOOKING', amount: 2000, dueAt: '2026-09-01T00:00:00.000Z', paidAmount: 2000, outstandingAmount: 0, dueNow: true, status: 'PAID' as const },
      { percentage: 30, dueType: 'DAYS_BEFORE_CHECKIN', amount: 6000, dueAt: '2026-09-20T00:00:00.000Z', paidAmount: 0, outstandingAmount: 6000, dueNow: true, status: 'DUE' as const },
      { percentage: 20, dueType: 'DAYS_BEFORE_CHECKIN', amount: 4000, dueAt: '2026-10-01T00:00:00.000Z', paidAmount: 1000, outstandingAmount: 3000, dueNow: false, status: 'PARTIALLY_PAID' as const },
      { percentage: 40, dueType: 'DAYS_BEFORE_CHECKIN', amount: 8000, dueAt: '2026-11-30T00:00:00.000Z', paidAmount: 0, outstandingAmount: 8000, dueNow: false, status: 'UPCOMING' as const },
    ],
  };
  assert.equal(amountDueNow(schedule), 6000);
});

test('booking confirmation does not call all outstanding balance due at check-in', () => {
  const message = agentPaymentConfirmation({ advanceAmount: 2000, balanceAmount: 18000, totalAmount: 20000, paymentStatus: 'PARTIALLY_PAID', paymentTermsSnapshot: { policy: 'MILESTONES' } });
  assert.match(message, /according to the saved payment schedule/);
  assert.doesNotMatch(message, /due at check-in/);
});

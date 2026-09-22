import assert from 'node:assert/strict';
import test from 'node:test';
import { addAtBookingMilestone, addMilestone, addRemainingMilestone, availableDueSelections, emptyMilestone, finalizeMilestones, removeMilestone, shouldShowDueSelector, toDraft, updateMilestoneDays, updateMilestoneDue, updateMilestonePercentage, validMilestones } from '../src/components/PaymentMilestoneEditor';
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

test('add remaining creates a Days to Check-in milestone', () => {
  const result = addRemainingMilestone([{ percentage: '90', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' }]);
  assert.deepEqual(result[1], { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '' });
});

test('booking milestone is added explicitly without a dropdown', () => {
  const result = addAtBookingMilestone([{ percentage: '100', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' }]);
  assert.deepEqual(result[1], { percentage: '', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' });
  assert.strictEqual(addAtBookingMilestone(result), result);
});

test('fixed due points are unique while days-before-check-in remains available', () => {
  const items = [
    { percentage: '20', dueType: 'ON_BOOKING' as const, daysBeforeCheckIn: '' },
    { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: '0' },
    { percentage: '70', dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: '3' },
  ];
  assert.deepEqual(availableDueSelections(items, 2), ['DAYS_BEFORE_CHECKIN']);
  assert.deepEqual(availableDueSelections(items, 0), ['ON_BOOKING', 'DAYS_BEFORE_CHECKIN']);
  assert.deepEqual(availableDueSelections(items, 1), ['DAYS_BEFORE_CHECKIN']);
});

test('due selector appears only for booking or the first row when booking is absent', () => {
  const withBooking = [
    { percentage: '20', dueType: 'ON_BOOKING' as const, daysBeforeCheckIn: '' },
    { percentage: '40', dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: '5' },
    { percentage: '40', dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: '10' },
  ];
  assert.equal(shouldShowDueSelector(withBooking, 0), true);
  assert.equal(shouldShowDueSelector(withBooking, 1), false);
  assert.equal(shouldShowDueSelector(withBooking, 2), false);

  const withoutBooking = withBooking.slice(1);
  assert.equal(shouldShowDueSelector(withoutBooking, 0), true);
  assert.equal(shouldShowDueSelector(withoutBooking, 1), false);
});

test('editing a Days to Check-in value does not auto-add a balance row', () => {
  const selected = updateMilestoneDue([
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '10', dueType: null, daysBeforeCheckIn: '' },
  ], 1, 'DAYS_BEFORE_CHECKIN');
  const result = finalizeMilestones(selected.map((item, index) => index === 1 ? { ...item, daysBeforeCheckIn: '0' } : item));
  assert.deepEqual(result[1], { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' });
  assert.equal(result.length, 2);
});

test('percentage input is capped and remaining is added only by explicit action', () => {
  const capped = updateMilestonePercentage([
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
    { percentage: '70', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '3' },
  ], 2, '80');
  assert.equal(capped[2].percentage, '70');
  assert.equal(capped.length, 3);

  const remaining = finalizeMilestones(updateMilestonePercentage([
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
    { percentage: '70', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '3' },
  ], 2, '50'));
  assert.equal(remaining.length, 3);
  assert.equal(remaining.reduce((sum, item) => sum + Number(item.percentage || 0), 0), 80);
  const completed = addRemainingMilestone(remaining);
  assert.deepEqual(completed[3], { percentage: '20', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '' });
  assert.equal(completed.reduce((sum, item) => sum + Number(item.percentage || 0), 0), 100);
});

test('blur normalization merges repeated check-in and day milestones', () => {
  const merged = finalizeMilestones([
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '20', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '10' },
    { percentage: '20', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '10' },
    { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
    { percentage: '5', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
  ]);
  assert.deepEqual(merged, [
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '40', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '10' },
    { percentage: '15', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
  ]);
});

test('latest days value is merged when the days field loses focus', () => {
  const edited = updateMilestoneDays([
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '20', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '10' },
    { percentage: '15', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '5' },
  ], 2, '10');
  assert.deepEqual(finalizeMilestones(edited), [
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '35', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '10' },
  ]);
});

test('loaded payment terms merge duplicate check-in rows before rendering', () => {
  const draft = toDraft([
    { percentage: 20, dueType: 'ON_BOOKING', sortOrder: 0 },
    { percentage: 10, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 0, sortOrder: 1 },
    { percentage: 30, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 0, sortOrder: 2 },
    { percentage: 40, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 20, sortOrder: 3 },
  ]);
  assert.deepEqual(draft, [
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '40', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
    { percentage: '40', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '20' },
  ]);
});

test('Days rows are explicit and deletion does not auto-add the balance', () => {
  const selected = finalizeMilestones([
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '', dueType: null, daysBeforeCheckIn: '' },
  ]);
  assert.equal(selected[1].dueType, null);
  assert.equal(addMilestone(selected)[2].dueType, 'DAYS_BEFORE_CHECKIN');

  const afterDelete = removeMilestone([
    { percentage: '20', dueType: 'ON_BOOKING', daysBeforeCheckIn: '' },
    { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '0' },
    { percentage: '60', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '20' },
    { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '5' },
  ], 2);
  assert.deepEqual(afterDelete[afterDelete.length - 1], { percentage: '10', dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: '5' });
  assert.equal(afterDelete.reduce((sum, item) => sum + Number(item.percentage || 0), 0), 40);
  assert.equal(addRemainingMilestone(afterDelete).reduce((sum, item) => sum + Number(item.percentage || 0), 0), 100);
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

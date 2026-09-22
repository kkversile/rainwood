import assert from 'node:assert/strict';
import test from 'node:test';
import { agentPaymentConfirmation, agentStatusLabel, aggregatePriceBreakdown, dueNowForAgentBooking, hasUsableDocumentFile, showLegacyFullPaymentOption } from '../src/lib/booking-pricing';

test('aggregates named supplementary charges without merging them into room charges', () => {
  const summary = aggregatePriceBreakdown({ total: 39600, taxTotal: 3600, priceBreakdown: [
    { date: '2026-12-25', baseAmount: 10000, extrasAmount: 0, taxAmount: 1200, supplementaryAmount: 2000, supplementaryCharges: [{ id: 'ny', name: 'New Year Supplement', amountPerRoomNight: 1000, rooms: 2, amount: 2000 }], totalAmount: 13200 },
    { date: '2026-12-26', baseAmount: 10000, extrasAmount: 0, taxAmount: 1200, supplementaryAmount: 2000, supplementaryCharges: [{ id: 'ny', name: 'New Year Supplement', amountPerRoomNight: 1000, rooms: 2, amount: 2000 }], totalAmount: 13200 },
    { date: '2026-12-27', baseAmount: 10000, extrasAmount: 0, taxAmount: 1200, supplementaryAmount: 2000, supplementaryCharges: [{ id: 'ny', name: 'New Year Supplement', amountPerRoomNight: 1000, rooms: 2, amount: 2000 }], totalAmount: 13200 },
  ] });
  assert.equal(summary.roomCharges, 30000);
  assert.equal(summary.tax, 3600);
  assert.equal(summary.supplementaryCharges[0].amount, 6000);
});

test('confirmation wording follows immutable reservation payment values', () => {
  assert.match(agentPaymentConfirmation({ advanceAmount: 5000, balanceAmount: 15000, totalAmount: 20000, paymentStatus: 'PARTIALLY_PAID', paymentTermsSnapshot: { policy: 'PERCENTAGE', percentage: 25 } }), /INR 5000.00.*INR 15000.00/);
  assert.match(agentPaymentConfirmation({ advanceAmount: 0, balanceAmount: 20000, totalAmount: 20000, paymentStatus: 'UNPAID', paymentTermsSnapshot: { policy: 'CREDIT' } }), /confirmed on credit/);
});

test('agent status labels distinguish pending and deactivated', () => {
  assert.equal(agentStatusLabel(false, null), 'KYC Pending');
  assert.equal(agentStatusLabel(false, null, true), 'Under Review');
  assert.equal(agentStatusLabel(false, 'PERCENTAGE'), 'Deactivated');
  assert.equal(agentStatusLabel(true, null), 'Active');
});

test('legacy 100% payment terms are available only for an existing selected agent', () => {
  assert.equal(showLegacyFullPaymentOption('PERCENTAGE', 100, '100'), true);
  assert.equal(showLegacyFullPaymentOption(null, null, '100'), false);
  assert.equal(showLegacyFullPaymentOption('PERCENTAGE', 25, '25'), false);
  assert.equal(showLegacyFullPaymentOption('PERCENTAGE', 100, '50'), false);
});

test('KYC view/download is available only when a file id exists', () => {
  assert.equal(hasUsableDocumentFile('file-123'), true);
  assert.equal(hasUsableDocumentFile('  '), false);
  assert.equal(hasUsableDocumentFile(null), false);
});

test('agent due-now display follows milestone thresholds without changing the API payload', () => {
  const milestones = [
    { percentage: 10, dueType: 'ON_BOOKING' as const },
    { percentage: 30, dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: 20 },
    { percentage: 20, dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: 10 },
    { percentage: 40, dueType: 'DAYS_BEFORE_CHECKIN' as const, daysBeforeCheckIn: 0 },
  ];
  assert.equal(dueNowForAgentBooking(20000, '2026-11-30', milestones, new Date('2026-10-31T12:00:00Z')), 2000);
  assert.equal(dueNowForAgentBooking(20000, '2026-11-30', milestones, new Date('2026-11-15T12:00:00Z')), 8000);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { folioPaymentBadge, frontDeskOutstanding } from '../src/lib/front-desk';

test('a paid room with unpaid services remains due in front-desk queues and badges', () => {
  const due = frontDeskOutstanding('RW-1', 0, [{ reference: 'RW-1', totalOutstanding: '315' }]);
  assert.equal(due, 315); assert.deepEqual(folioPaymentBadge(due), { value: 'BALANCE_DUE', tone: 'warn' });
});
test('verified full settlement changes the complete folio to paid', () => {
  assert.equal(frontDeskOutstanding('RW-1', 0, [{ reference: 'RW-1', totalOutstanding: 0 }]), 0);
  assert.deepEqual(folioPaymentBadge(0), { value: 'PAID', tone: 'ok' });
});
test('expected arrivals retain their booking balance without borrowing another guest balance', () => {
  assert.equal(frontDeskOutstanding('RW-1', '6160', [{ reference: 'RW-2', totalOutstanding: 315 }]), 6160);
});
test('loading or unavailable folios never claim that a guest is paid', () => {
  assert.equal(folioPaymentBadge(null).value, 'LOADING_FOLIO');
  assert.equal(folioPaymentBadge(null, true).value, 'FOLIO_UNAVAILABLE');
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeReservationHold, type ReservationHold } from '../src/lib/reservation-quote';

const hold = (lines: ReservationHold['lines']): ReservationHold => ({ token: 'server-hold', expiresAt: '2026-11-18T12:00:00Z', lines });

test('the actual hold response supplies tax-inclusive totals within lines', () => {
  const quote = normalizeReservationHold(hold([{ quotedTotal: '6160', quotedTax: '660' }]));
  assert.equal(quote.quotedTotal, 6160); assert.equal(quote.quotedTax, 660); assert.equal(quote.token, 'server-hold');
});
test('multiple persisted quote lines add without multiplying rooms or applying tax again', () => {
  const quote = normalizeReservationHold(hold([{ quotedTotal: '6160.10', quotedTax: '660.10' }, { quotedTotal: '12320.20', quotedTax: '1320.20' }]));
  assert.equal(quote.quotedTotal, 18480.30); assert.equal(quote.quotedTax, 1980.30);
});
test('incomplete or invalid quotes fail closed instead of displaying NaN or accepting a free stay', () => {
  for (const lines of [[], [{ quotedTotal: '', quotedTax: 0 }], [{ quotedTotal: 'NaN', quotedTax: 0 }], [{ quotedTotal: -1, quotedTax: 0 }]]) assert.throws(() => normalizeReservationHold(hold(lines)));
  assert.throws(() => normalizeReservationHold({ ...hold([{ quotedTotal: 0, quotedTax: 0 }]), token: '' }));
  assert.throws(() => normalizeReservationHold({ ...hold([{ quotedTotal: 0, quotedTax: 0 }]), expiresAt: 'invalid' }));
});

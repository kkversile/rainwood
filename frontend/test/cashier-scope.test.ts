import assert from 'node:assert/strict';
import test from 'node:test';
import { formatHotelDateTime } from '../src/lib/hotel-date-time';
import { scopedCashierHotels } from '../src/lib/cashier-scope';

const hotels = [{ id: 'hotel-a', name: 'Hotel A' }, { id: 'hotel-b', name: 'Hotel B' }];

test('global cashier roles can select every hotel while property roles are fixed', () => {
  assert.deepEqual(scopedCashierHotels({ role: 'SUPER_ADMIN' }, hotels), hotels);
  assert.deepEqual(scopedCashierHotels({ role: 'CORPORATE_ADMIN' }, hotels), hotels);
  assert.deepEqual(scopedCashierHotels({ role: 'ACCOUNTS' }, hotels), hotels);
  assert.deepEqual(scopedCashierHotels({ role: 'ADMIN', staffHotelId: 'hotel-a' }, hotels), [hotels[0]]);
  assert.deepEqual(scopedCashierHotels({ role: 'RESERVATION', staffHotelId: 'hotel-b' }, hotels), [hotels[1]]);
  assert.deepEqual(scopedCashierHotels({ role: 'ADMIN' }, hotels), []);
});

test('cashier timestamps use the hotel timezone and business date remains date-only', () => {
  assert.equal(formatHotelDateTime('2026-10-01T04:30:00Z', 'Asia/Kolkata'), '01 Oct 2026, 10:00 AM');
  assert.equal(formatHotelDateTime('2026-10-01T04:30:00Z', 'UTC'), '01 Oct 2026, 04:30 AM');
  assert.equal(formatHotelDateTime('2026-07-01T04:30:00Z', 'America/New_York'), '01 Jul 2026, 12:30 AM');
});

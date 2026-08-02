import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInDays, validateSearchInput } from '../src/lib/booking-helpers';

test('dateInDays generates UTC date-only values', () => {
  assert.equal(dateInDays(1, new Date('2026-08-01T23:30:00Z')), '2026-08-02');
});

test('search validation rejects reversed dates and invalid occupancy', () => {
  assert.equal(validateSearchInput({ checkIn: '2026-08-03', checkOut: '2026-08-02', adults: 2, children: 0, rooms: 1 }), 'Check-out must be after check-in.');
  assert.equal(validateSearchInput({ checkIn: '2026-08-02', checkOut: '2026-08-03', adults: 0, children: 0, rooms: 1 }), 'At least one adult is required.');
  assert.equal(validateSearchInput({ checkIn: '2026-08-02', checkOut: '2026-08-03', adults: 2, children: 0, rooms: 0 }), 'At least one room is required.');
});

test('search validation accepts a normal one-night stay', () => {
  assert.equal(validateSearchInput({ checkIn: '2026-08-02', checkOut: '2026-08-03', adults: 2, children: 1, rooms: 1 }), null);
});

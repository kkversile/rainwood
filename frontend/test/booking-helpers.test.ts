import test from 'node:test';
import assert from 'node:assert/strict';
import { dateInDays, parseBookingSearch, serializeBookingSearch, validateSearchInput } from '../src/lib/booking-helpers';
import { addHotelDays, todayInHotelTimezone } from '../src/lib/hotel-date-time';

test('date-only hotel arithmetic is stable across timezone boundaries', () => {
  assert.equal(addHotelDays('2026-03-31', 1), '2026-04-01');
  assert.equal(addHotelDays('2026-10-25', 7), '2026-11-01');
  assert.equal(todayInHotelTimezone('Asia/Kolkata', new Date('2026-09-27T19:00:00Z')), '2026-09-28');
  assert.equal(todayInHotelTimezone('America/New_York', new Date('2026-09-28T03:30:00Z')), '2026-09-27');
});

test('dateInDays uses the hotel calendar at midnight IST', () => {
  assert.equal(dateInDays(0, new Date('2026-08-01T19:00:00Z')), '2026-08-02');
  assert.equal(dateInDays(1, new Date('2026-08-01T19:00:00Z')), '2026-08-03');
});

test('search validation rejects reversed dates and invalid occupancy', () => {
  const checkIn = dateInDays(2);
  const checkOut = dateInDays(3);
  assert.equal(validateSearchInput({ checkIn: checkOut, checkOut: checkIn, adults: 2, children: 0, rooms: 1 }), 'Check-out must be after check-in.');
  assert.equal(validateSearchInput({ checkIn, checkOut, adults: 0, children: 0, rooms: 1 }), 'At least one adult is required.');
  assert.equal(validateSearchInput({ checkIn, checkOut, adults: 2, children: 0, rooms: 0 }), 'At least one room is required.');
});

test('search validation accepts a normal one-night stay', () => {
  assert.equal(validateSearchInput({ checkIn: dateInDays(1), checkOut: dateInDays(2), adults: 2, children: 1, rooms: 1 }), null);
});

test('booking search preserves hotel slug and separate adult/child occupancy', () => {
  const state = parseBookingSearch('?hotel=rainwood-resort&checkIn=2026-10-02&checkOut=2026-10-03&adults=2&children=1&rooms=1', new Date('2026-09-30T12:00:00Z'));
  assert.deepEqual(state, { hotel: 'rainwood-resort', checkIn: '2026-10-02', checkOut: '2026-10-03', adults: 2, children: 1, rooms: 1 });
  assert.equal(serializeBookingSearch(state).toString(), 'checkIn=2026-10-02&checkOut=2026-10-03&adults=2&children=1&rooms=1&hotel=rainwood-resort');
});

test('booking search sanitizes invalid values and defaults missing values', () => {
  const state = parseBookingSearch('?hotel=not%20a%20slug&checkIn=2026-09-01&checkOut=2026-09-01&adults=0&children=-2&rooms=99', new Date('2026-10-01T12:00:00Z'));
  assert.equal(state.hotel, undefined);
  assert.equal(state.adults, 1);
  assert.equal(state.children, 0);
  assert.equal(state.rooms, 20);
  assert.equal(state.checkOut, '2026-10-03');
});

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const bookingFlow = readFileSync(join(process.cwd(), 'src/components/BookingFlow.tsx'), 'utf8');

test('agent booking uses the date-based rate book to choose eligible hotels', () => {
  assert.match(bookingFlow, /view: 'rate-book'/);
  assert.match(bookingFlow, /from: checkIn, to: checkOut/);
  assert.match(bookingFlow, /status === 'VALID'/);
  assert.match(bookingFlow, /plan\.rates\.length > 0/);
  assert.match(bookingFlow, /No hotels have complete published rates for these dates/);
  assert.match(bookingFlow, /RainwoodDatePicker/);
  assert.match(bookingFlow, /displayLabel="Check-in date"/);
  assert.match(bookingFlow, /displayLabel="Check-out date"/);
  assert.match(bookingFlow, /\/availability\/search/);
  assert.doesNotMatch(bookingFlow, /apiRequest<AssignedHotelPlan\[]>/);
});

test('agent booking clears stale room results when the stay changes', () => {
  assert.match(bookingFlow, /function resetSearchResults\(\)/);
  assert.match(bookingFlow, /function updateCheckIn\(value: string\)/);
  assert.match(bookingFlow, /function updateCheckOut\(value: string\)/);
  assert.match(bookingFlow, /function updateNights\(value: number\)/);
  assert.match(bookingFlow, /onCheckIn=\{updateCheckIn\}/);
  assert.match(bookingFlow, /onCheckOut=\{updateCheckOut\}/);
  assert.match(bookingFlow, /onNights=\{updateNights\}/);
});

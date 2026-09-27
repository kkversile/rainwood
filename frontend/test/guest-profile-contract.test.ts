import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const guestData = readFileSync(join(process.cwd(), 'src/components/GuestData.tsx'), 'utf8');
const arrivals = readFileSync(join(process.cwd(), 'src/components/AdminArrivals.tsx'), 'utf8');
const modal = readFileSync(join(process.cwd(), 'src/components/ArrivalDetailsModal.tsx'), 'utf8');

test('guest stay history renders room type and numeric room nights separately', () => {
  assert.match(guestData, /<th>Room Type<\/th><th>Room Nights<\/th>/);
  assert.match(guestData, /<td>\{stay\.roomTypes\.join\(', '\)\}<\/td><td>\{stay\.roomNights\}<\/td>/);
});

test('arrivals exposes repeat context and a scoped profile link in details', () => {
  assert.match(arrivals, /RETURNING GUEST/);
  assert.match(modal, /Guest History/);
  assert.match(modal, /View Guest Profile/);
  assert.match(modal, /operationalPreferences/);
});

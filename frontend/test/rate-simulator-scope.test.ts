import assert from 'node:assert/strict';
import test from 'node:test';
import { canUseRateSimulator, scopedRateSimulatorHotels } from '../src/lib/rate-simulator-scope';
import { linksForRole } from '../src/components/Shell';

const hotels = [{ id: 'hotel-a', name: 'Hotel A' }, { id: 'hotel-b', name: 'Hotel B' }];

test('global rate-management roles can select all active hotels', () => {
  assert.deepEqual(scopedRateSimulatorHotels({ role: 'SUPER_ADMIN' }, hotels), hotels);
  assert.deepEqual(scopedRateSimulatorHotels({ role: 'CORPORATE_ADMIN' }, hotels), hotels);
});

test('property Admin is restricted to the assigned hotel', () => {
  const visible = scopedRateSimulatorHotels({ role: 'ADMIN', staffHotelId: 'hotel-b' }, hotels);
  assert.deepEqual(visible, [hotels[1]]);
  assert.equal(visible.some((hotel) => hotel.id === 'hotel-a'), false);
});

test('loading, unknown, missing-scope, and operational roles fail closed', () => {
  assert.equal(canUseRateSimulator(null), false);
  assert.deepEqual(scopedRateSimulatorHotels(null, hotels), []);
  assert.deepEqual(scopedRateSimulatorHotels({ role: 'ADMIN' }, hotels), []);
  assert.deepEqual(scopedRateSimulatorHotels({ role: 'RESERVATION' }, hotels), []);
  assert.deepEqual(scopedRateSimulatorHotels({ role: 'SERVICE_STAFF' }, hotels), []);
});

test('Reservation and service staff navigation do not expose Rate Simulator', () => {
  assert.equal(linksForRole('RESERVATION').some(([href]) => href === '/admin/rate-simulator'), false);
  assert.equal(linksForRole('SERVICE_STAFF').some(([href]) => href === '/admin/rate-simulator'), false);
});

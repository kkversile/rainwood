import assert from 'node:assert/strict';
import test from 'node:test';
import { createDefaultPolicy, normalizePolicy } from '../src/components/HotelPolicies';

test('default policy matches the reference cancellation and toggle state', () => {
  const policy = createDefaultPolicy();
  assert.deepEqual(policy.cancellationRules.map(({ fromDays, toDays, charge }) => ({ fromDays, toDays, charge })), [
    { fromDays: 30, toDays: 999, charge: 0 },
    { fromDays: 15, toDays: 29, charge: 50 },
    { fromDays: 0, toDays: 14, charge: 100 },
  ]);
  assert.equal(policy.allowEarlyCheckIn, true);
  assert.equal(policy.allowPets, false);
  assert.equal(policy.alcoholAllowed, true);
});

test('legacy policy values are normalized for the new editor', () => {
  const policy = normalizePolicy({
    checkInTime: '14:00',
    checkOutTime: '11:00',
    noShowPolicy: '100% of total booking amount' as never,
    amendmentPolicy: 'Allow amendments' as never,
  });
  assert.equal(policy.checkInTime, '02:00 PM');
  assert.equal(policy.checkOutTime, '11:00 AM');
  assert.equal(policy.noShowPolicy, 'TOTAL');
  assert.equal(policy.amendmentPolicy, 'CHARGES_APPLY');
});

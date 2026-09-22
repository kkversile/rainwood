import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAssignedRatePlans } from '../src/lib/agent-rate-plan-view';

const plans = [
  { id: 'one', code: 'CP', name: 'Breakfast Plan', mealPlan: 'CP', hotel: { name: 'RainWood Aurum', city: 'Kodaikanal' }, room: { name: 'Premium Valley Room', code: 'PVR' } },
  { id: 'two', code: 'EP', name: 'Room Only', mealPlan: 'EP', hotel: { name: 'RainWood Lakeshore', city: 'Alleppey' }, room: { name: 'Lake View Room', code: 'LVR' } },
];

test('assigned rate plan filters match admin-style search fields', () => {
  assert.deepEqual(filterAssignedRatePlans(plans, { search: 'aurum', hotel: '', room: '', ratePlan: '', mealPlan: '' }).map((plan) => plan.id), ['one']);
  assert.deepEqual(filterAssignedRatePlans(plans, { search: '', hotel: 'RainWood Lakeshore', room: '', ratePlan: 'two', mealPlan: 'EP' }).map((plan) => plan.id), ['two']);
  assert.deepEqual(filterAssignedRatePlans(plans, { search: 'pvr', hotel: '', room: 'Premium Valley Room', ratePlan: '', mealPlan: 'EP' }), []);
});

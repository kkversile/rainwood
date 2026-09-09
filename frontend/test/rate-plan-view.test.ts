import assert from 'node:assert/strict';
import test from 'node:test';
import { filterRatePlanRows, flattenRatePlanRows, formatConfiguredDays, formatStartingRate, sortRatePlanRows } from '../src/lib/rate-plan-view';

test('rate-plan summaries display money rather than a rate-day count', () => {
  assert.equal(formatStartingRate(3500), 'From ₹3,500');
  assert.equal(formatStartingRate(null), '—');
});

test('configured rate days use an explicit non-currency label', () => {
  assert.equal(formatConfiguredDays(1), '1 day configured');
  assert.equal(formatConfiguredDays(131), '131 days configured');
});

const master = (overrides: Record<string, unknown> = {}) => ({ id: 'master-1', hotelId: 'hotel-1', code: 'EP', name: 'Contracted Nett Rate', mealPlan: 'EP', description: 'European Plan', active: true, hotel: { id: 'hotel-1', name: 'RainWood Aurum Kodaikanal', city: 'Kodaikanal' }, assignments: [], ...overrides });

test('one master assigned to three rooms produces three assignment rows', () => {
  const rows = flattenRatePlanRows([master({ assignments: [
    { id: 'a', roomTypeId: 'dgr', active: true, startingRate: 3000, confirmedBookingCount: 0, activeHoldCount: 0, _count: { rates: 10 }, roomType: { id: 'dgr', name: 'Deluxe Garden Room', code: 'DGR' } },
    { id: 'b', roomTypeId: 'pvr', active: true, startingRate: 3200, confirmedBookingCount: 2, activeHoldCount: 1, _count: { rates: 12 }, roomType: { id: 'pvr', name: 'Premium Valley Room', code: 'PVR' } },
    { id: 'c', roomTypeId: 'fms', active: true, startingRate: 3500, confirmedBookingCount: 1, activeHoldCount: 0, _count: { rates: 8 }, roomType: { id: 'fms', name: 'Family Mountain Suite', code: 'FMS' } },
  ] })], 'hotel-1');
  assert.deepEqual(rows.map((row) => row.id), ['a', 'b', 'c']);
});

test('room filtering and search only return matching assignment rows', () => {
  const rows = flattenRatePlanRows([master({ assignments: [
    { id: 'dgr-plan', roomTypeId: 'dgr', active: true, startingRate: 3000, confirmedBookingCount: 0, activeHoldCount: 0, _count: { rates: 10 }, roomType: { id: 'dgr', name: 'Deluxe Garden Room', code: 'DGR' } },
    { id: 'pvr-plan', roomTypeId: 'pvr', active: false, startingRate: 3200, confirmedBookingCount: 2, activeHoldCount: 1, _count: { rates: 12 }, roomType: { id: 'pvr', name: 'Premium Valley Room', code: 'PVR' } },
  ] })], 'hotel-1');
  assert.deepEqual(filterRatePlanRows(rows, { roomTypeId: 'pvr' }).map((row) => row.id), ['pvr-plan']);
  assert.deepEqual(filterRatePlanRows(rows, { search: 'garden' }).map((row) => row.id), ['dgr-plan']);
  assert.deepEqual(filterRatePlanRows(rows, { status: 'ACTIVE' }).map((row) => row.id), ['dgr-plan']);
});

test('unassigned masters remain visible and rates sort nulls last', () => {
  const rows = flattenRatePlanRows([master({ id: 'assigned', assignments: [{ id: 'assigned-row', roomTypeId: 'pvr', active: true, startingRate: 4100, confirmedBookingCount: 0, activeHoldCount: 0, _count: { rates: 1 }, roomType: { id: 'pvr', name: 'Premium Valley Room', code: 'PVR' } }] }), master({ id: 'unassigned', code: 'CP', assignments: [] })], 'hotel-1');
  assert.equal(rows.find((row) => row.unassigned)?.id, 'master:unassigned');
  assert.deepEqual(sortRatePlanRows(rows, 'rate', 'asc').map((row) => row.id), ['assigned-row', 'master:unassigned']);
});

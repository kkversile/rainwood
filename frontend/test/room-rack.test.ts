import assert from 'node:assert/strict';
import test from 'node:test';
import { addHotelDays } from '../src/lib/hotel-date-time';
import { roomRackBlockSpan, roomRackDates, roomRackDayCount, roomRackFacetOptions, roomRackMatches, roomRackToday } from '../src/lib/room-rack';

test('Room Rack defaults to a bounded fourteen-day hotel-local range', () => {
  assert.equal(roomRackDayCount(undefined), 14);
  assert.equal(roomRackDayCount('7'), 7);
  assert.equal(roomRackDayCount('30'), 30);
  assert.equal(roomRackDayCount('31'), 14);
  assert.deepEqual(roomRackDates('2026-10-02', 14).slice(0, 3), ['2026-10-02', '2026-10-03', '2026-10-04']);
  assert.equal(roomRackDates('2026-10-02', 31).length, 31);
});

test('Room Rack blocks use checkout-exclusive nights and clip to the visible range', () => {
  const dates = roomRackDates('2026-10-02', 7);
  assert.deepEqual(roomRackBlockSpan('2026-10-02', '2026-10-04', dates), { start: 0, span: 2 });
  assert.deepEqual(roomRackBlockSpan('2026-09-30', '2026-10-04', dates), { start: 0, span: 2 });
  assert.equal(roomRackBlockSpan('2026-09-20', '2026-09-21', dates), null);
  assert.equal(addHotelDays('2026-10-02', 7), '2026-10-09');
});

test('Room Rack searches room, guest, and reservation reference text', () => {
  assert.equal(roomRackMatches('Room 101 · Asha Guest · RW-101', 'asha'), true);
  assert.equal(roomRackMatches('Room 101 · Asha Guest · RW-101', 'RW-999'), false);
  assert.equal(roomRackMatches('Room 101', ''), true);
});

test('Room Rack uses the selected hotel timezone for today and preserves backend facets', () => {
  const now = new Date('2026-10-02T02:00:00.000Z');
  assert.equal(roomRackToday('Asia/Kolkata', now), '2026-10-02');
  assert.equal(roomRackToday('America/Los_Angeles', now), '2026-10-01');
  assert.deepEqual(roomRackFacetOptions({ roomTypes: [{ id: 'suite', name: 'Suite' }], floors: ['2'], wings: ['B'], roomStatuses: ['AVAILABLE'] }), { roomTypes: [{ id: 'suite', name: 'Suite' }], floors: ['2'], wings: ['B'], roomStatuses: ['AVAILABLE'] });
  assert.deepEqual(roomRackFacetOptions(), { roomTypes: [], floors: [], wings: [], roomStatuses: [] });
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { createRetryableSubmission } from '../src/lib/retryable-submission';
import { portalLoginPath } from '../src/lib/portal-session';
import { filterAgentBookings } from '../src/lib/agent-booking-filters';
import { getSafePostLoginRoute } from '../src/lib/role-landing';
import type { AgentReservation } from '../src/components/AgentData';
import { canUseStaffServiceOrders } from '../src/lib/staff-navigation';

test('uncertain service-order responses keep the original key on retry', async () => {
  let keys = 0; const sent: string[] = [];
  const request = createRetryableSubmission<{ reference: string; quantity: number }, string>(() => `attempt-${++keys}`);
  const payload = { reference: 'STAY-A', quantity: 2 };
  await assert.rejects(request.submit(payload, async (body) => { sent.push(body.idempotencyKey); throw new Error('response lost'); }), /response lost/);
  assert.equal(await request.submit(payload, async (body) => { sent.push(body.idempotencyKey); return 'saved'; }), 'saved');
  assert.deepEqual(sent, ['attempt-1', 'attempt-1']);
  await request.submit(payload, async (body) => { sent.push(body.idempotencyKey); return 'new order'; });
  assert.equal(sent[2], 'attempt-2');
});

test('rapid double submissions share a single request while changed orders get a new key', async () => {
  let keys = 0; let sends = 0;
  const request = createRetryableSubmission<{ reference: string }, string>(() => `attempt-${++keys}`);
  let finish!: (value: string) => void;
  const send = async () => { sends += 1; return new Promise<string>((resolve) => { finish = resolve; }); };
  const first = request.submit({ reference: 'STAY-A' }, send);
  const second = request.submit({ reference: 'STAY-A' }, send);
  assert.equal(first, second);
  await Promise.resolve(); finish('saved'); await Promise.all([first, second]);
  assert.equal(sends, 1);
  await assert.rejects(request.submit({ reference: 'STAY-A' }, async () => { throw new Error('offline'); }));
  let nextKey = '';
  await request.submit({ reference: 'STAY-B' }, async (body) => { nextKey = body.idempotencyKey; return 'saved'; });
  assert.equal(nextKey, 'attempt-3');
});

test('expired sessions return to the matching portal and retain the intended page', () => {
  assert.equal(portalLoginPath('/rainwood/agent/bookings/ABC', '?tab=payments', '/rainwood'), '/rainwood/agent/login?next=%2Frainwood%2Fagent%2Fbookings%2FABC%3Ftab%3Dpayments');
  assert.equal(portalLoginPath('/staff/lost-found'), '/staff/login?next=%2Fstaff%2Flost-found');
  assert.equal(portalLoginPath('/rainwood/admin/agents', '', '/rainwood'), '/rainwood/login?next=%2Frainwood%2Fadmin%2Fagents');
  assert.equal(getSafePostLoginRoute('AGENT', '/rainwood/agent/bookings?filter=cancelled'), '/agent/bookings?filter=cancelled');
  assert.equal(getSafePostLoginRoute('SERVICE_STAFF', '/rainwood/staff/lost-found'), '/staff/lost-found');
  assert.equal(getSafePostLoginRoute('AGENT', '/agent/login'), '/agent');
  assert.equal(getSafePostLoginRoute('AGENT', '/admin/agents'), '/agent');
});

test('service-order navigation respects department access to guest operations', () => {
  for (const department of ['FOOD_BEVERAGE', 'ROOM_SERVICE']) assert.equal(canUseStaffServiceOrders(department), true);
  for (const department of ['HOUSEKEEPING', 'MAINTENANCE', '', undefined, null]) assert.equal(canUseStaffServiceOrders(department), false);
});

const booking = (reference: string, status: string, createdAt: string): AgentReservation => ({ reference, status, createdAt, guestName: 'Guest', checkIn: '2026-11-20', checkOut: '2026-11-22', paymentStatus: 'PAID', totalAmount: 100, balanceAmount: 0, hotel: { name: 'Aurum', city: 'Kodaikanal' }, lines: [] });
const rows = [booking('CANCELLED-OLD', 'CANCELLED', '2026-10-01'), booking('CANCELLED-NEW', 'CANCELLED', '2026-11-17'), booking('CONFIRMED', 'CONFIRMED', '2026-11-17')];
const filters = { from: '2026-11-01', to: '2026-11-30', search: '', city: '', hotel: '', mode: 'booking' as const, cancelledOnly: true };

test('cancelled booking results respect the selected date basis and date range', () => {
  assert.deepEqual(filterAgentBookings(rows, filters).map((row) => row.reference), ['CANCELLED-NEW']);
  assert.equal(filterAgentBookings(rows, { ...filters, mode: 'checkIn' }).length, 2);
  assert.equal(filterAgentBookings(rows, { ...filters, cancelledOnly: false }).length, 2);
  assert.equal(filterAgentBookings(rows, { ...filters, from: '2026-12-01' }).length, 0);
  assert.equal(filterAgentBookings(rows, { ...filters, city: '  Kodaikanal ', hotel: 'AURUM', search: 'cancelled-new' }).length, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { categorizeFrontDeskExceptions, frontDeskQuery, frontDeskShortcut, frontDeskView, isEditableTarget } from '../src/lib/front-desk';

test('front desk defaults to arrivals and preserves queue URL state', () => {
  assert.equal(frontDeskView(undefined), 'arrivals');
  assert.equal(frontDeskView('not-a-view'), 'arrivals');
  assert.equal(frontDeskQuery('in-house', ' Ravi ', 3).toString(), 'view=in-house&search=Ravi&page=3');
});

test('front desk shortcuts are ignored while editing and support visible queue views', () => {
  assert.equal(frontDeskShortcut({ key: 'a', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, false), 'arrivals');
  assert.equal(frontDeskShortcut({ key: 'i', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, false), 'in-house');
  assert.equal(frontDeskShortcut({ key: 'd', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, false), 'departures');
  assert.equal(frontDeskShortcut({ key: 'k', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }, false), 'search');
  assert.equal(frontDeskShortcut({ key: 'a', ctrlKey: false, metaKey: false, altKey: false, shiftKey: false }, true), null);
  assert.equal(isEditableTarget({ closest: () => ({}) } as unknown as EventTarget), true);
});

test('exception queue contains only actionable operational states', () => {
  const rows = categorizeFrontDeskExceptions([
    { reference: 'RW-1', guestName: 'Ravi', stayStatus: 'EXPECTED', reconfirmed: false, assignedRooms: [] },
    { reference: 'RW-2', guestName: 'Maya', stayStatus: 'EXPECTED', reconfirmed: true, assignedRooms: [{ status: 'CLEAN' }] },
    { reference: 'RW-3', guestName: 'Ira', stayStatus: 'CHECKED_IN', balance: 1250, assignedRooms: [{ status: 'OCCUPIED' }] },
  ]);
  assert.deepEqual(rows.map((row) => row.title), ['Room not assigned', 'Arrival not reconfirmed', 'Outstanding balance']);
  assert.equal(rows.some((row) => row.reference === 'RW-2'), false);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const wizard = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/hotels/new/page.tsx'), 'utf8');
const extended = fs.readFileSync(path.join(process.cwd(), 'src/components/HotelExtendedSections.tsx'), 'utf8');
const location = fs.readFileSync(path.join(process.cwd(), 'src/components/HotelLocation.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(process.cwd(), 'src/components/Shell.tsx'), 'utf8');

test('wizard dirty tracking is section-scoped and excludes global input capture', () => {
  assert.doesNotMatch(wizard, /onInputCapture/);
  assert.match(wizard, /onInput=\{markDirty\}/);
  assert.match(wizard, /beforeunload/);
  assert.match(wizard, /setSaveState\("saved"\)/);
});

test('wizard discard restores persisted snapshots and remounts extended sections', () => {
  for (const token of ['persistedHotelRef', 'persistedCatalogRef', 'restoreDiscardedChanges', 'extendedResetKey', 'setRoomRows([])', 'setAmenityRows([])', 'onSaved={() => { setSaveState("saved"); void refreshSetupExtras(); }}']) {
    assert.ok(wizard.includes(token), 'missing discard/refresh token: ' + token);
  }
});

test('extended setup sections expose the complete semantic back and continue chain', () => {
  for (const transition of [
    "onNavigate?.('rates')",
    "onNavigate?.('policy')",
    "onNavigate?.('location', true)",
    "onNavigate?.('contacts')",
    "onNavigate?.('documents', true)",
    "onNavigate?.('guestReviews', true)",
  ]) assert.ok(extended.includes(transition), `missing transition: ${transition}`);
  assert.match(location, /onSaved\?:/);
  assert.match(location, /onContinue\?:/);
  assert.ok(location.includes('onSaved?.();'));
  assert.ok(location.includes('onContinue?.()'));
});

test('operations command search exposes keyboard result semantics and direct open state', () => {
  for (const token of ['activeResultIndex', 'ArrowDown', 'ArrowUp', 'aria-activedescendant', 'role', 'operations-command-results', '?open=']) {
    assert.ok(shell.includes(token), `missing command-search token: ${token}`);
  }
});

test('public guest mode hides agent-only fields while preserving agent payload mapping', () => {
  const booking = fs.readFileSync(path.join(process.cwd(), 'src/components/BookingFlow.tsx'), 'utf8');
  assert.match(booking, /step === 'guest' && hold && selected && !agentMode/);
  assert.match(booking, /agentMode && guest\.referenceNo/);
  assert.match(booking, /const internal = agentMode \?/);
});

test('admin reservations require an authoritative quote and support direct detail opening', () => {
  const adminData = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminData.tsx'), 'utf8');
  for (const token of ['ReservationCreateView', 'Check Availability & Price', 'quote.token', 'quote.expiresAt', 'startEditByReference', '/reservations/${encodeURIComponent(reference)}/detail']) {
    assert.ok(adminData.includes(token), 'missing admin reservation token: ' + token);
  }
});

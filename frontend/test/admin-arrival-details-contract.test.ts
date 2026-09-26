import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const arrivals = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminArrivals.tsx'), 'utf8');
const modal = fs.readFileSync(path.join(process.cwd(), 'src/components/ArrivalDetailsModal.tsx'), 'utf8');

test('reservation references are accessible lazy detail controls', () => {
  assert.match(arrivals, /className="arrivalsReservationLink"/);
  assert.match(arrivals, /aria-label=\{`View arrival details for \$\{row\.reference\}`\}/);
  assert.match(arrivals, /ArrivalDetailsModal/);
  assert.match(arrivals, /setSelectedReference\(row\.reference\)/);
});

test('arrival detail modal fetches only the selected reference and supports loading/error recovery', () => {
  assert.ok(modal.includes('/reservations/${encodeURIComponent(reference)}/detail'));
  assert.match(modal, /Loading reservation details/);
  assert.match(modal, /Unable to load reservation details/);
  assert.match(modal, /setReloadKey/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /event\.key === 'Escape'/);
});

test('arrival detail modal renders operational sections and reconfirmation', () => {
  for (const token of ['Guest Details', 'Stay / Room Details', 'Booking Details', 'Financial Details', 'Payment History', 'Payment Schedule', 'Remarks / Arrival Instructions', 'Reconfirmation', 'Reconfirm Arrival', 'tel:', 'mailto:']) {
    assert.match(modal, new RegExp(token.replace(/[\\/]/g, '\\$&')), `missing detail token: ${token}`);
  }
  assert.match(modal, /\/reconfirmation/);
  assert.match(modal, /onReconfirmed/);
  assert.match(modal, /Nightly rate breakdown/);
});

test('arrival detail modal uses canonical line occupancy totals for pax', () => {
  assert.match(modal, /detail\.lines\.reduce\(\(sum, line\) => sum \+ line\.adults \+ line\.children, 0\)/);
  assert.doesNotMatch(modal, /line\.rooms \* \(line\.adults \+ line\.children\)/);
});

test('arrival detail modal keeps guest folio accounting separate and auditable', () => {
  for (const token of ['/reservations/${encodeURIComponent(reference)}/folio', 'Guest Folio', 'Add Charge', 'No incidental charges', 'Original Reservation Balance', 'Incidental Charges', 'Total Outstanding', 'FOOD_AND_BEVERAGE', 'Void Guest Charge', 'voidReason', 'reservationBalance', 'totalOutstanding']) {
    assert.ok(modal.includes(token), `missing folio token: ${token}`);
  }
  assert.match(modal, /folio\/charges/);
  assert.match(modal, /folioCategories/);
  assert.match(modal, /setVoidTarget/);
  assert.match(modal, /The row remains in the audit history/);
});

test('closing details returns focus to the reservation control and does not navigate', () => {
  assert.match(arrivals, /reservationButtonRefs/);
  assert.match(arrivals, /requestAnimationFrame/);
  assert.match(arrivals, /onClose=\{closeDetails\}/);
  assert.doesNotMatch(arrivals, /window\.location/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const agentsPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/agents/page.tsx'), 'utf8');
const compactPaymentEditor = fs.readFileSync(path.join(process.cwd(), 'src/components/CompactPaymentTermsEditor.tsx'), 'utf8');
const globalsCss = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
const adminData = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminData.tsx'), 'utf8');

test('agent payment terms use one inline row editor while rate plans retain the modal', () => {
  assert.match(agentsPage, /CompactPaymentTermsEditor/);
  assert.match(agentsPage, /agentPaymentTermsCell/);
  assert.match(agentsPage, /agentPaymentTermsDisplay/);
  assert.doesNotMatch(agentsPage, /agentPaymentEditorRow/);
  assert.doesNotMatch(agentsPage, /agentInlinePaymentEditor/);
  assert.doesNotMatch(agentsPage, /colSpan=\{6\}/);
  assert.match(agentsPage, /cancelTerms/);
  assert.doesNotMatch(agentsPage, /Focused editor/);
  assert.doesNotMatch(agentsPage, /termsAgent/);
  assert.match(agentsPage, /agentRateModalBackdrop/);
});

test('compact payment terms editor preserves milestone due semantics and actions', () => {
  assert.match(compactPaymentEditor, /compactPaymentEditor/);
  assert.match(compactPaymentEditor, /Days to Check-in/);
  assert.match(compactPaymentEditor, /days to check-in/);
  assert.doesNotMatch(compactPaymentEditor, /<select/);
  assert.match(compactPaymentEditor, /Add At Booking/);
  assert.match(compactPaymentEditor, /Add Milestone/);
  assert.match(compactPaymentEditor, /step="5"/);
  assert.match(compactPaymentEditor, /Add Remaining/);
  assert.match(compactPaymentEditor, /onCancel/);
  assert.match(compactPaymentEditor, /onSave/);
  assert.doesNotMatch(compactPaymentEditor, /<PaymentMilestoneEditor/);
});

test('agent table keeps long emails readable without a horizontal scrollbar', () => {
  assert.match(agentsPage, /className="agentEmailCell"/);
  assert.match(agentsPage, /className="agentEmailDomain"/);
  assert.match(globalsCss, /agentEmail\{display:flex/);
  assert.match(globalsCss, /masterPanel>section\.panel:last-of-type>\.tableScroll\{overflow-x:hidden/);
  assert.match(globalsCss, /table-layout:fixed/);
  assert.match(globalsCss, /compactPaymentEditor\{width:100%;max-width:320px;padding:0;border:0/);
});

test('rate plan assignments use the selected hotel count and business wording', () => {
  assert.match(agentsPage, /Save assignment/);
  assert.match(agentsPage, /hotel-rate-plan/);
  assert.match(agentsPage, /selectedMasterId/);
  assert.doesNotMatch(agentsPage, /selectedHotelPlanIds/);
  assert.match(agentsPage, /Contract Rate/);
  assert.match(agentsPage, /Hotel Rate/);
});

test('admin reservation details render the saved payment schedule without a pay action', () => {
  assert.match(adminData, /ReservationPaymentSchedule schedule=\{detail\.paymentSchedule\}/);
  assert.doesNotMatch(adminData, /schedule=\{detail\.paymentSchedule\} onPay/);
});

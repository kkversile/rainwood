import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const agentsPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/agents/page.tsx'), 'utf8');
const adminData = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminData.tsx'), 'utf8');

test('agent payment terms use one inline row editor while rate plans retain the modal', () => {
  assert.match(agentsPage, /agentPaymentEditorRow/);
  assert.match(agentsPage, /cancelTerms/);
  assert.doesNotMatch(agentsPage, /Focused editor/);
  assert.doesNotMatch(agentsPage, /termsAgent/);
  assert.match(agentsPage, /agentRateModalBackdrop/);
});

test('rate plan assignments use the selected hotel count and business wording', () => {
  assert.match(agentsPage, /Save \$\{selectedHotelPlanIds\.length/);
  assert.match(agentsPage, /Contract Rate/);
  assert.match(agentsPage, /Hotel Rate/);
});

test('admin reservation details render the saved payment schedule without a pay action', () => {
  assert.match(adminData, /ReservationPaymentSchedule schedule=\{detail\.paymentSchedule\}/);
  assert.doesNotMatch(adminData, /schedule=\{detail\.paymentSchedule\} onPay/);
});

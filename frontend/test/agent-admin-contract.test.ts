import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const agentsPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/agents/page.tsx'), 'utf8');
const compactPaymentEditor = fs.readFileSync(path.join(process.cwd(), 'src/components/CompactPaymentTermsEditor.tsx'), 'utf8');
const globalsCss = fs.readFileSync(path.join(process.cwd(), 'src/app/globals.css'), 'utf8');
const workspaceCss = fs.readFileSync(path.join(process.cwd(), 'src/app/rainwood-workspace.css'), 'utf8');
const adminData = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminData.tsx'), 'utf8');

test('agent payment terms use one inline row editor while rate mappings open their dedicated workspace', () => {
  assert.match(agentsPage, /CompactPaymentTermsEditor/);
  assert.match(agentsPage, /agentPaymentTermsCell/);
  assert.match(agentsPage, /agentPaymentTermsDisplay/);
  assert.doesNotMatch(agentsPage, /agentPaymentEditorRow/);
  assert.doesNotMatch(agentsPage, /agentInlinePaymentEditor/);
  assert.doesNotMatch(agentsPage, /colSpan=\{6\}/);
  assert.match(agentsPage, /cancelTerms/);
  assert.doesNotMatch(agentsPage, /Focused editor/);
  assert.doesNotMatch(agentsPage, /termsAgent/);
  assert.doesNotMatch(agentsPage, /agentRateModalBackdrop/);
  assert.match(agentsPage, /href=\{`\/rainwood\/admin\/agent-mappings\?agentId=\$\{encodeURIComponent\(agent\.id\)\}`\}>Manage Mappings/);
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

test('agent table keeps long emails readable with contained keyboard-accessible scrolling', () => {
  assert.match(agentsPage, /className="agentEmailCell"/);
  assert.match(agentsPage, /className="agentEmailDomain"/);
  assert.match(globalsCss, /agentEmail\{display:flex/);
  assert.match(agentsPage, /adminAgentsTableWrap" role="region" aria-label="Agent accounts and payment terms" tabIndex=\{0\}/);
  assert.match(workspaceCss, /\.adminAgentsTableWrap\{overflow-x:auto!important/);
  assert.match(workspaceCss, /\.adminAgentsTable\{width:100%!important;min-width:1080px!important;table-layout:auto!important/);
  assert.match(workspaceCss, /\.adminAgentsTable :is\(td small,\.status,\.mutedText\)\{font-size:12px/);
  assert.match(globalsCss, /compactPaymentEditor\{width:100%;max-width:320px;padding:0;border:0/);
});

test('payment terms display one milestone per line in the agent table', () => {
  assert.match(agentsPage, /agentPaymentMilestones/);
  assert.match(globalsCss, /agentPaymentMilestones\{flex-direction:column/);
});

test('legacy agent mappings are displayed as migration fallback and cannot be mutated here', () => {
  assert.match(agentsPage, /Pricing source: Legacy Agent Rate Plan · view only/);
  assert.doesNotMatch(agentsPage, /\/agents\/[^`]*rate-plan-assignments|\/users\/agents\/[^`]*rate-plans/);
  assert.doesNotMatch(agentsPage, /Save assignment/);
  assert.doesNotMatch(agentsPage, /Delete assignment/);
  assert.doesNotMatch(agentsPage, /aria-label=\{'Edit rate plans for ' \+ agent\.name\}/);
  assert.doesNotMatch(agentsPage, /selectedHotelPlanIds/);
  assert.match(agentsPage, /Hotel Rate Mapping/);
  assert.match(agentsPage, /Rate Mapping/);
});

test('admin reservation details render the saved payment schedule without a pay action', () => {
  assert.match(adminData, /ReservationPaymentSchedule schedule=\{detail\.paymentSchedule\}/);
  assert.doesNotMatch(adminData, /schedule=\{detail\.paymentSchedule\} onPay/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const importPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/base-rate-import/page.tsx'), 'utf8');
const ratePlansPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/rate-plans/page.tsx'), 'utf8');
const sharedImportForm = fs.readFileSync(path.join(process.cwd(), 'src/components/RatePlanRateImportForm.tsx'), 'utf8');
const agentMappingsPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/agent-mappings/page.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(process.cwd(), 'src/components/Shell.tsx'), 'utf8');

test('rate import is scoped to a selected hotel and rate plan master', () => {
  assert.match(sharedImportForm, /rate-plan-masters\/\$\{masterId\}\/rates\/import/);
  assert.match(sharedImportForm, /Download Rate Template/);
  assert.match(sharedImportForm, /Agents assigned to this rate plan automatically receive these rates/);
  assert.match(sharedImportForm, /selectedFile/);
  assert.match(sharedImportForm, /onChange=\{chooseFile\}/);
  assert.match(importPage, /RatePlanRateImportForm/);
  assert.doesNotMatch(importPage, /apiRequest|apiFileBlob|function upload|function download/);
});

test('rate plans page launches master-scoped imports', () => {
  assert.match(ratePlansPage, /Import rates/);
  assert.match(ratePlansPage, /setRateImportModal/);
  assert.match(ratePlansPage, /RatePlanRateImportForm/);
  assert.doesNotMatch(ratePlansPage, /router\.push\(`\/admin\/base-rate-import/);
});

test('rate import form keeps modal context locked and reports row-level errors', () => {
  assert.match(sharedImportForm, /lockContext/);
  assert.match(sharedImportForm, /rateImportLockedField/);
  assert.match(sharedImportForm, /rateImportErrors/);
  assert.match(sharedImportForm, /No rows were saved/);
  assert.match(sharedImportForm, /await onImportSuccess/);
  assert.match(ratePlansPage, /role="dialog" aria-modal="true" aria-labelledby="rate-import-modal-title"/);
});

test('agent access page has no agent Excel import actions', () => {
  assert.match(agentMappingsPage, /redirect\('\/admin\/agents'\)/);
  assert.doesNotMatch(shell, /Agent Access & Contract Rates/);
  assert.doesNotMatch(agentMappingsPage, /Import Agent Rates|Download Agent Rate Template|agents\/rates\/import|rate-import-template|Use Contract Rate|Manage Contract Rates/);
});

test('admin navigation calls the feature Rate Import', () => {
  assert.match(shell, /admin\/base-rate-import', 'Rate Import'/);
});

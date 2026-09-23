import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const importPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/base-rate-import/page.tsx'), 'utf8');
const ratePlansPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/rate-plans/page.tsx'), 'utf8');
const agentMappingsPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/agent-mappings/page.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(process.cwd(), 'src/components/Shell.tsx'), 'utf8');

test('rate import is scoped to a selected hotel and rate plan master', () => {
  assert.match(importPage, /rate-plan-masters\/\$\{masterId\}\/rates\/import/);
  assert.match(importPage, /Download Rate Template/);
  assert.match(importPage, /Agents assigned to this rate plan automatically receive these rates/);
  assert.match(importPage, /disabled=\{!hotelId \|\| !masterId \|\| busy\}/);
});

test('rate plans page launches master-scoped imports', () => {
  assert.match(ratePlansPage, /Import rates/);
  assert.match(ratePlansPage, /base-rate-import\?hotelId=\$\{hotelId\}&masterId=\$\{row\.master\.id\}/);
});

test('agent access page has no agent Excel import actions', () => {
  assert.doesNotMatch(agentMappingsPage, /Import Agent Rates|Download Agent Rate Template|agents\/rates\/import|rate-import-template/);
});

test('admin navigation calls the feature Rate Import', () => {
  assert.match(shell, /admin\/base-rate-import', 'Rate Import'/);
});

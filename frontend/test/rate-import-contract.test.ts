import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import RateImportAliasPage from '../src/app/admin/base-rate-import/page';
import AgentRateSlabsAliasPage from '../src/app/admin/agent-rate-slabs/page';
import { adminLinks } from '../src/components/Shell';
import { FEATURE_CATALOG } from '../src/lib/admin-features';

const importPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/base-rate-import/page.tsx'), 'utf8');
const ratePlansPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/rate-plans/page.tsx'), 'utf8');
const sharedImportForm = fs.readFileSync(path.join(process.cwd(), 'src/components/RatePlanRateImportForm.tsx'), 'utf8');
const rateMasterPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/rates/page.tsx'), 'utf8');
const hotelImportForm = fs.readFileSync(path.join(process.cwd(), 'src/components/HotelRateImportForm.tsx'), 'utf8');
const agentMappingsPage = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/agent-mappings/page.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(process.cwd(), 'src/components/Shell.tsx'), 'utf8');

test('rate import is scoped to a selected hotel and rate plan master', () => {
  assert.match(sharedImportForm, /rate-plan-masters\/\$\{masterId\}\/rates\/import/);
  assert.match(sharedImportForm, /Download Rate Template/);
  assert.match(sharedImportForm, /Agents assigned to this rate plan automatically receive these rates/);
  assert.match(sharedImportForm, /selectedFile/);
  assert.match(sharedImportForm, /onChange=\{chooseFile\}/);
  const form = ratePlansPage.match(/<RatePlanRateImportForm\b[\s\S]*?\/>/)?.[0];
  assert.ok(form);
  for (const prop of ['initialHotelId={rateImportModal.hotelId}', 'initialMasterId={rateImportModal.masterId}', 'mode="modal"', 'lockContext']) assert.ok(form.includes(prop), prop);
  assert.doesNotMatch(importPage, /apiRequest|apiFileBlob|function upload|function download/);
});

test('legacy rate URLs redirect to the current workspaces', () => {
  for (const [page, target] of [[RateImportAliasPage, '/admin/rates'], [AgentRateSlabsAliasPage, '/admin/agent-mappings']] as const) {
    assert.throws(page, (error: unknown) => {
      const digest = (error as { digest?: string }).digest;
      assert.ok(typeof digest === 'string');
      assert.ok(digest.startsWith('NEXT_REDIRECT;'));
      assert.equal(digest.split(';')[2], target);
      return true;
    });
  }
});

test('Rate Master imports retain selected property, date range, scope and optional room type', () => {
  const form = rateMasterPage.match(/<HotelRateImportForm\b[\s\S]*?\/>/)?.[0];
  assert.ok(form);
  for (const prop of ['initialHotelId={hotelId}', 'initialFrom={from}', 'initialTo={to}', 'lockContext', 'fixedScope="HOTEL"']) assert.ok(form.includes(prop), prop);
  assert.match(hotelImportForm, /new URLSearchParams\(\{ scope, from, to \}\)/);
  assert.match(hotelImportForm, /params\.set\('roomTypeId', roomTypeId\)/);
  assert.match(hotelImportForm, /\/hotels\/\$\{hotelId\}\/rates\/import\?\$\{queryString\(\)\}/);
  assert.match(hotelImportForm, /disabled=\{busy \|\| !hotelId \|\| !isValidRange \|\| !file\}/);
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
  assert.match(agentMappingsPage, /Agent .*Hotel .*Category/);
  assert.doesNotMatch(shell, /Agent Access & Contract Rates/);
  assert.doesNotMatch(agentMappingsPage, /Import Agent Rates|Download Agent Rate Template|agents\/rates\/import|rate-import-template|Use Contract Rate|Manage Contract Rates/);
});

test('Rate Import remains a feature setting while Rate Master is its navigation destination', () => {
  assert.deepEqual(FEATURE_CATALOG.find(([key]) => key === 'rateImport'), ['rateImport', 'Rate Import', 'Revenue']);
  assert.ok(adminLinks.some((item) => item.href === '/admin/rates' && item.label === 'Rate Master'));
  assert.equal(adminLinks.some((item) => item.href === '/admin/base-rate-import'), false);
});

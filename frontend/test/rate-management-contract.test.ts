import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(process.cwd(), 'src');
test('rate calendar exposes base override effective and preview controls', () => {
  const page = readFileSync(join(root, 'app/admin/rate-calendar/page.tsx'), 'utf8');
  assert.match(page, /Rate Calendar/);
  assert.match(page, /Base/);
  assert.match(page, /Override/);
  assert.match(page, /Effective/);
  assert.match(page, /Preview changes/);
  assert.match(page, /Apply preview/);
});

test('rate master is the compact five-column canonical grid', () => {
  const page = readFileSync(join(root, 'app/admin/rates/page.tsx'), 'utf8');
  const grid = readFileSync(join(root, 'components/RateMasterGrid.tsx'), 'utf8');
  assert.match(page, /RateMasterGrid/);
  assert.match(grid, /Single/);
  assert.match(grid, /Double/);
  assert.match(grid, /Extra Adult/);
  assert.match(grid, /Child With Bed/);
  assert.match(grid, /Child Without Bed/);
  assert.doesNotMatch(grid, /Triple/);
  assert.match(grid, /type="number"/);
  assert.doesNotMatch(grid, /Mixed/);
  for (const plan of ['EP', 'CP', 'MAP', 'AP']) assert.match(page + grid, new RegExp(plan));
  for (const band of ['RACK', 'A', 'B', 'C', 'D', 'E']) assert.match(grid, new RegExp(`['"]${band}['"]`));
});

test('promotions are a separate admin workflow with disable action', () => {
  const page = readFileSync(join(root, 'app/admin/promotions/page.tsx'), 'utf8');
  assert.match(page, /Promotions/);
  assert.match(page, /Create promotion/);
  assert.match(page, /Disable/);
});

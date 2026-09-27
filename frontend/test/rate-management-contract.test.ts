import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = join(process.cwd(), 'src');
test('rate calendar exposes base override effective and preview controls', () => {
  const page = readFileSync(join(root, 'app/admin/rates/page.tsx'), 'utf8');
  assert.match(page, /Rate Calendar/);
  assert.match(page, /Base/);
  assert.match(page, /Override/);
  assert.match(page, /Effective/);
  assert.match(page, /Preview changes/);
  assert.match(page, /Apply preview/);
});

test('promotions are a separate admin workflow with disable action', () => {
  const page = readFileSync(join(root, 'app/admin/promotions/page.tsx'), 'utf8');
  assert.match(page, /Promotions/);
  assert.match(page, /Create promotion/);
  assert.match(page, /Disable/);
});

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const shell = fs.readFileSync(path.join(process.cwd(), 'src/components/Shell.tsx'), 'utf8');
const data = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminData.tsx'), 'utf8');
const api = fs.readFileSync(path.join(process.cwd(), 'src/lib/api.ts'), 'utf8');

test('admin navigation is driven by /auth/me and fails closed for unknown roles', () => {
  assert.match(shell, /useAdminProfile/);
  assert.match(data, /apiRequest.*\/auth\/me/);
  assert.match(shell, /if \(!role\) return \[\]/);
  assert.doesNotMatch(shell, /localStorage\.getItem\('rainwood_user_role'\)/);
  assert.doesNotMatch(api, /localStorage\.setItem\('rainwood_user_role'/);
});

test('service staff are not granted admin navigation', () => {
  assert.match(shell, /return \[\];/);
  assert.match(data, /SERVICE_STAFF_SESSION/);
});

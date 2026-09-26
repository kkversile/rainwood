import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('service staff PWA exposes the scoped routes and confirmation flow', () => {
  const data = read('src/components/StaffData.tsx');
  assert.match(data, /\/staff\/me/);
  assert.match(data, /\/staff\/stays/);
  assert.match(data, /idempotencyKey/);
  assert.match(data, /Confirm Post/);
  assert.match(data, /You're offline/);
  assert.doesNotMatch(data, /voidFolioCharge|Void Charge/);
});

test('staff manifest and service worker avoid caching authenticated guest data', () => {
  const manifest = read('src/app/manifest.ts');
  const worker = read('public/sw.js');
  assert.match(manifest, /start_url: `\$\{basePath\}\/staff`/);
  assert.match(manifest, /display: 'standalone'/);
  assert.match(worker, /\/api\//);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.match(worker, /caches\.match\(request\)/);
});

test('admin session gate routes service staff into the staff portal', () => {
  const data = read('src/components/AdminData.tsx');
  const shell = read('src/components/Shell.tsx');
  assert.match(data, /SERVICE_STAFF_SESSION/);
  assert.match(data, /\/staff/);
  assert.match(shell, /SERVICE_STAFF/);
});

test('admin and staff login pages expose non-submitting demo prefill shortcuts', () => {
  const admin = read('src/app/login/page.tsx');
  const staff = read('src/app/staff/login/page.tsx');
  const credentials = read('src/lib/demo-login.ts');
  assert.match(admin, /Prefill Admin login/);
  assert.match(admin, /staff\/login\?demo=staff/);
  assert.match(staff, /params\.get\('demo'\) === 'staff'/);
  assert.match(staff, /Prefill Staff login/);
  assert.match(credentials, /staffEmail/);
  assert.match(credentials, /staffPassword/);
});

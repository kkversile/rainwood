import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { staffServiceWorkerConfig } from '../src/lib/staff-service-worker';

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('service staff PWA exposes the scoped routes and confirmation flow', () => {
  const data = read('src/components/StaffData.tsx');
  assert.match(data, /\/staff\/me/);
  assert.match(data, /\/staff\/stays/);
  assert.match(data, /idempotencyKey/);
  assert.match(data, /Confirm Post/);
  assert.match(data, /You're offline/);
  assert.match(data, /VOIDED/);
  assert.match(data, /staffChargeVoided/);
  assert.match(data, /incidentalCharges/);
  assert.doesNotMatch(data, /voidFolioCharge|Void Charge/);
});

test('service worker registration is scoped to the staff portal for every base path', () => {
  assert.deepEqual(staffServiceWorkerConfig(''), { url: '/sw.js', scope: '/staff/' });
  assert.deepEqual(staffServiceWorkerConfig('/rainwood'), { url: '/rainwood/sw.js', scope: '/rainwood/staff/' });
  const data = read('src/components/StaffData.tsx');
  assert.match(data, /staffServiceWorkerConfig/);
  assert.match(data, /register\(url, \{ scope \}\)/);
});

test('staff manifest and service worker avoid caching authenticated guest data', () => {
  const manifest = read('src/app/manifest.ts');
  const worker = read('public/sw.js');
  assert.match(manifest, /start_url: `\$\{basePath\}\/staff`/);
  assert.match(manifest, /display: 'standalone'/);
  assert.match(worker, /\/api\//);
  assert.match(worker, /request\.method !== 'GET'/);
  assert.match(worker, /fetch\(request, \{ cache: 'no-store' \}\)/);
  assert.match(worker, /isStaticAsset/);
  assert.doesNotMatch(worker, /event\.request\.method === 'POST'/);
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
  assert.match(staff, /URLSearchParams\(window\.location\.search\).*demo.*staff/);
  assert.match(staff, /Prefill Housekeeping/);
  assert.match(staff, /Prefill Maintenance/);
  assert.match(credentials, /staffEmail/);
  assert.match(credentials, /staffPassword/);
});

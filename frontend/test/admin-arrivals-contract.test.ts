import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const page = fs.readFileSync(path.join(process.cwd(), 'src/app/admin/arrivals/page.tsx'), 'utf8');
const component = fs.readFileSync(path.join(process.cwd(), 'src/components/AdminArrivals.tsx'), 'utf8');
const shell = fs.readFileSync(path.join(process.cwd(), 'src/components/Shell.tsx'), 'utf8');

test('expected arrivals is a first-class admin route and navigation item', () => {
  assert.match(page, /AdminArrivals/);
  assert.match(page, /title="Arrivals"/);
  assert.match(shell, /admin\/arrivals', 'Arrivals'/);
});

test('expected arrivals exposes operational filters, exports, and reconfirmation', () => {
  for (const token of ['includeWaitlist', 'reconfirmedOnly', 'hotelIds', 'statuses', 'Excel', 'window.print', '/reports/expected-arrivals', '/reconfirmation']) {
    assert.ok(component.includes(token), `missing arrivals contract token: ${token}`);
  }
  assert.match(component, /PATCH/);
  assert.match(component, /summary\.reservations/);
});

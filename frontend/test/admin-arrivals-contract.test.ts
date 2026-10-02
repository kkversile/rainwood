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
  assert.match(shell, /href: '\/admin\/arrivals', label: 'Arrivals'/);
});

test('expected arrivals exposes operational filters, exports, and reconfirmation', () => {
  for (const token of ['includeWaitlist', 'reconfirmedOnly', 'hotelIds', 'statuses', 'CSV (current page)', 'window.print', '/reports/expected-arrivals', '/reconfirmation', 'todayInHotelTimezone', 'pageSize', 'arrivalsPagination']) {
    assert.ok(component.includes(token), `missing arrivals contract token: ${token}`);
  }
  assert.match(component, /PATCH/);
  assert.match(component, /summary\.reservations/);
  assert.match(component, /page: String\(page\)/);
  assert.match(component, /limit: String\(pageSize\)/);
  assert.match(component, /setPage\(1\)/);
});

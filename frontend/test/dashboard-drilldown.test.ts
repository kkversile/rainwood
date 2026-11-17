import assert from 'node:assert/strict';
import test from 'node:test';
import { dashboardDrilldownHref } from '../src/lib/dashboard-drilldown';
import { allowedAdminLinksForRole } from '../src/components/Shell';

test('every dashboard movement shortcut preserves the selected property', () => {
  for (const hotelId of ['first-hotel', 'different-hotel']) {
    for (const path of ['/admin/arrivals', '/admin/front-desk', '/admin/in-house', '/admin/rooms-inventory']) {
      const target = new URL(dashboardDrilldownHref(path, hotelId, '2026-11-01', '2026-11-17'), 'http://localhost');
      assert.equal(target.pathname, path);
      assert.equal(target.searchParams.get('hotelId'), hotelId);
      if (path === '/admin/arrivals' || path === '/admin/front-desk') {
        assert.equal(target.searchParams.get('from'), '2026-11-01');
        assert.equal(target.searchParams.get('to'), '2026-11-17');
      }
      if (path === '/admin/front-desk') assert.equal(target.searchParams.get('view'), 'departures');
    }
  }
});

test('admin navigation only offers the management dashboard to management roles', () => {
  for (const role of ['RESERVATION', 'ACCOUNTS', 'VIEWER', 'SERVICE_STAFF', 'AGENT']) {
    assert.equal(allowedAdminLinksForRole(role).some((link) => link.href === '/admin/dashboard'), false, role);
  }
  for (const role of ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN']) {
    assert.equal(allowedAdminLinksForRole(role).some((link) => link.href === '/admin/dashboard'), true, role);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLinks, buildNavigationGroups, isAdminRouteActive, linksForRole } from '../src/components/Shell';

const asAdminLinks = (role: string) => {
  const allowed = new Set(linksForRole(role).map(([href]) => href));
  return adminLinks.filter((item) => allowed.has(item.href));
};

test('grouped admin navigation keeps the requested information architecture', () => {
  const groups = buildNavigationGroups(asAdminLinks('SUPER_ADMIN'));
  assert.deepEqual(groups.map((group) => group.label), ['Operations', 'Reservations', 'Revenue', 'CRM & Sales', 'Reports', 'System']);
  assert.deepEqual(groups[0].items.map((item) => item.label), ['Rooms & Inventory', 'Physical Rooms', 'Housekeeping', 'Maintenance', 'Supplementary Charges']);
  assert.deepEqual(groups[1].items.map((item) => item.label), ['Reservations', 'Arrivals', 'In-house', 'Payments', 'Contact Requests']);
  assert.deepEqual(groups[2].items.map((item) => item.label), ['Revenue Forecast', 'Rate Plans', 'Rates', 'Rate Seasons', 'Yield Rules', 'Rate Simulator', 'Promotions', 'Rate Import']);
  assert.deepEqual(groups[3].items.map((item) => item.label), ['Guests', 'Agents']);
  assert.deepEqual(groups[4].items.map((item) => item.label), ['Reports', 'Night Audit']);
  assert.deepEqual(groups[5].items.map((item) => item.label), ['Manage Hotels', 'AxisRooms', 'Jobs', 'Users', 'Site Settings', 'Audit Logs']);
});

test('role filtering is fail-closed and groups only allowed links', () => {
  assert.deepEqual(linksForRole(), []);
  assert.deepEqual(linksForRole('NOT_A_ROLE'), []);
  assert.deepEqual(buildNavigationGroups(asAdminLinks('RESERVATION')).map((group) => group.label), ['Reservations', 'CRM & Sales', 'Reports']);
  assert.equal(buildNavigationGroups(asAdminLinks('ADMIN')).some((group) => group.key === 'system' && group.items.some((item) => item.label === 'Manage Hotels')), false);
  assert.equal(buildNavigationGroups(asAdminLinks('CORPORATE_ADMIN')).some((group) => group.items.some((item) => item.label === 'Site Settings')), false);
});

test('active route matching handles nested pages without prefix collisions', () => {
  assert.equal(isAdminRouteActive('/admin/rates/2026', '/admin/rates'), true);
  assert.equal(isAdminRouteActive('/admin/rate-seasons/2026', '/admin/rates'), false);
  assert.equal(isAdminRouteActive('/admin/guests/123', '/admin/guests'), true);
  assert.equal(isAdminRouteActive('/admin/reservations/123', '/admin/reservations'), true);
  assert.equal(isAdminRouteActive('/admin/dashboard/details', '/admin/dashboard'), false);
});

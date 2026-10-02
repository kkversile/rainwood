import assert from 'node:assert/strict';
import test from 'node:test';
import { getDefaultRouteForRole, getSafePostLoginRoute, isRoleRouteAllowed } from '../src/lib/role-landing';

test('each supported role receives an existing authorized landing route', () => {
  assert.deepEqual({
    SUPER_ADMIN: getDefaultRouteForRole('SUPER_ADMIN'),
    CORPORATE_ADMIN: getDefaultRouteForRole('CORPORATE_ADMIN'),
    ADMIN: getDefaultRouteForRole('ADMIN'),
    RESERVATION: getDefaultRouteForRole('RESERVATION'),
    ACCOUNTS: getDefaultRouteForRole('ACCOUNTS'),
    SERVICE_STAFF: getDefaultRouteForRole('SERVICE_STAFF'),
    VIEWER: getDefaultRouteForRole('VIEWER'),
    AGENT: getDefaultRouteForRole('AGENT'),
  }, {
    SUPER_ADMIN: '/admin/dashboard', CORPORATE_ADMIN: '/admin/dashboard', ADMIN: '/admin/dashboard',
    RESERVATION: '/admin/arrivals', ACCOUNTS: '/admin/cashier', SERVICE_STAFF: '/staff',
    VIEWER: '/admin/reports', AGENT: '/agent',
  });
});

test('post-login deep links fail closed to the role landing route', () => {
  assert.equal(getSafePostLoginRoute('RESERVATION', '/admin/settings'), '/admin/arrivals');
  assert.equal(getSafePostLoginRoute('VIEWER', '/admin/credit-notes'), '/admin/credit-notes');
  assert.equal(getSafePostLoginRoute('SERVICE_STAFF', '/admin/dashboard'), '/staff');
  assert.equal(isRoleRouteAllowed('ACCOUNTS', '/admin/cashier'), true);
  assert.equal(isRoleRouteAllowed('ACCOUNTS', '/admin/users'), false);
});

test('post-login deep links normalize the deployed base path', () => {
  assert.equal(getSafePostLoginRoute('ADMIN', '/rainwood/admin/agents?edit=demo&step=8'), '/admin/agents?edit=demo&step=8');
});

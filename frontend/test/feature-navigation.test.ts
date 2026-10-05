import assert from 'node:assert/strict';
import test from 'node:test';
import { adminLinks, filterAdminLinksByFeatures } from '../src/components/Shell';
import { featureKeyForPath } from '../src/lib/admin-features';

test('feature navigation hides disabled leaves while preserving unrelated links', () => {
  const visible = filterAdminLinksByFeatures(adminLinks, 'ADMIN', { banquets: false, groups: true });
  assert.equal(visible.some((item) => item.key === 'banquets'), false);
  assert.equal(visible.some((item) => item.key === 'groups'), true);
  assert.equal(visible.some((item) => item.key === 'features'), false);
});

test('SUPER_ADMIN bypasses feature filtering and direct paths map to the same keys', () => {
  assert.equal(filterAdminLinksByFeatures(adminLinks, 'SUPER_ADMIN', { banquets: false }).some((item) => item.key === 'banquets'), true);
  assert.equal(featureKeyForPath('/admin/banquets/calendar'), 'banquets');
  assert.equal(featureKeyForPath('/admin/groups/rooming'), 'groups');
});

test('feature navigation fails closed until effective access is ready', () => {
  assert.equal(filterAdminLinksByFeatures(adminLinks, 'ADMIN', { banquets: true }, 'loading').some((item) => item.key === 'banquets'), false);
  assert.equal(filterAdminLinksByFeatures(adminLinks, 'ADMIN', { banquets: true }, 'error').some((item) => item.key === 'banquets'), false);
  assert.equal(filterAdminLinksByFeatures(adminLinks, 'ADMIN', { banquets: true }, 'ready').some((item) => item.key === 'banquets'), true);
});

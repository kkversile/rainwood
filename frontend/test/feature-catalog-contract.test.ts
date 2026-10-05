import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import test from 'node:test';
import { canResetFeatureOverride, FEATURE_KEYS, orderFeatureRows } from '../src/lib/admin-features';

test('frontend and backend expose the same feature key contract', () => {
  const catalog = readFileSync(resolve(process.cwd(), '../backend/src/modules/features/features.catalog.ts'), 'utf8');
  const catalogSource = catalog.slice(catalog.indexOf('export const FEATURE_CATALOG'), catalog.indexOf('] as const satisfies'));
  const backendKeys = [...catalogSource.matchAll(/\['([^']+)',/g)].map((match) => match[1]);
  assert.deepEqual([...FEATURE_KEYS], backendKeys);
});

test('feature management presentation follows the shared admin navigation groups', () => {
  const rows = orderFeatureRows([
    { key: 'axisRooms', enabled: true },
    { key: 'jobs', enabled: true },
    { key: 'banquets', enabled: false },
  ]);
  assert.deepEqual(rowsFor(rows, 'taxSettings'), { key: 'taxSettings', label: 'Tax Settings', group: 'System', enabled: true, source: undefined });
  assert.equal(rowsFor(rows, 'axisRooms').group, 'System');
  assert.equal(rowsFor(rows, 'jobs').group, 'System');
  assert.deepEqual(rowsFor(rows, 'banquets'), { key: 'banquets', label: 'Banquets & Events', group: 'Operations', enabled: false, source: undefined });
});

function rowsFor(rows: ReturnType<typeof orderFeatureRows>, key: string) {
  return rows.find((row) => row.key === key)!;
}

test('hotel override reset is blocked while another feature draft is dirty', () => {
  assert.equal(canResetFeatureOverride(true), false);
  assert.equal(canResetFeatureOverride(false), true);
});

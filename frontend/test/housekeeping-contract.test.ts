import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('housekeeping PWA exposes the department-scoped workflow', () => {
  const component = read('src/components/HousekeepingData.tsx');
  const page = read('src/app/staff/page.tsx');
  for (const token of ['/staff/housekeeping/rooms', '/staff/housekeeping/tasks', "'accept' | 'start' | 'complete'", '/report-issue', 'My Rooms', 'Mark Ready']) assert.match(component, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(page, /StaffHomeRouter/);
});

test('admin housekeeping board exposes management filters and legal status actions', () => {
  const component = read('src/components/HousekeepingBoard.tsx');
  const page = read('src/app/admin/housekeeping/page.tsx');
  const shell = read('src/components/Shell.tsx');
  for (const token of ['/housekeeping/board', '/housekeeping/staff', 'Assigned to', 'OUT_OF_ORDER', 'Restore dirty', 'Cancel task']) assert.match(component, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(page, /HousekeepingBoard/);
  assert.match(shell, /admin\/housekeeping', 'Housekeeping'/);
});

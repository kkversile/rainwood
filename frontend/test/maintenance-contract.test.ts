import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(process.cwd());
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('maintenance admin board exposes filters and lifecycle actions', () => {
  const component = read('src/components/MaintenanceBoard.tsx');
  const page = read('src/app/admin/maintenance/page.tsx');
  const shell = read('src/components/Shell.tsx');
  for (const token of ['/maintenance/tickets', '/maintenance/staff', '/assign', '/start', '/resolve', '/cancel', '/take-room-out-of-order', 'Mark OOO', 'Create maintenance ticket']) assert.match(component, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(page, /MaintenanceBoard/);
  assert.match(shell, /admin\/maintenance', 'Maintenance'/);
});

test('maintenance staff PWA exposes accept, start, and resolve workflow', () => {
  const component = read('src/components/MaintenanceData.tsx');
  const router = read('src/components/StaffData.tsx');
  for (const token of ['/staff/maintenance/tasks', 'Open jobs', 'My jobs', 'Accept job', 'Start work', 'Resolve job', 'resolutionNote']) assert.match(component, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(router, /department === 'MAINTENANCE'/);
});

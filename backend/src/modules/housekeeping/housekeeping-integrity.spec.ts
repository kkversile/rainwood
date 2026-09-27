import { findHousekeepingIntegrityIssues } from './housekeeping-integrity';

const room = (overrides: Record<string, unknown> = {}) => ({ id: 'room-203', roomNumber: '203', hotelId: 'hotel-1', status: 'AVAILABLE', activeTasks: [], ...overrides });
const task = (overrides: Record<string, unknown> = {}) => ({ id: 'task-1', roomId: 'room-203', hotelId: 'hotel-1', status: 'PENDING', ...overrides });

describe('housekeeping integrity diagnostics', () => {
  it('returns no findings for a consistent room/task state', () => {
    expect(findHousekeepingIntegrityIssues([room({ status: 'DIRTY', activeTasks: [{ id: 'task-1', status: 'PENDING' }] })], [task()])).toEqual([]);
  });

  it('detects cleaning rooms without matching clean tasks', () => {
    const issues = findHousekeepingIntegrityIssues([room({ status: 'CLEANING' })], []);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatch(/without an active housekeeping task/);
  });

  it('detects contradictory statuses, duplicates, and cross-hotel tasks', () => {
    const rooms = [room({ status: 'DIRTY', activeTasks: [{ id: 'task-1', status: 'CLEANING' }, { id: 'task-2', status: 'PENDING' }] })];
    const issues = findHousekeepingIntegrityIssues(rooms, [task({ id: 'task-1', status: 'CLEANING', hotelId: 'hotel-2' }), task({ id: 'task-2' })]);
    expect(issues).toHaveLength(3);
    expect(issues.join('\n')).toMatch(/DIRTY/);
    expect(issues.join('\n')).toMatch(/active housekeeping tasks/);
    expect(issues.join('\n')).toMatch(/belongs to hotel/);
  });
});

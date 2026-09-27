type ActiveTask = { id: string; roomId: string; hotelId: string; status: string };
type RoomWithActiveTasks = { id: string; roomNumber: string; hotelId: string; status: string; activeTasks: Array<{ id: string; status: string }> };

export function findHousekeepingIntegrityIssues(rooms: RoomWithActiveTasks[], tasks: ActiveTask[]) {
  const issues: string[] = [];
  const tasksByRoom = new Map<string, ActiveTask[]>();
  for (const task of tasks) tasksByRoom.set(task.roomId, [...(tasksByRoom.get(task.roomId) ?? []), task]);

  for (const room of rooms) {
    const activeTasks = room.activeTasks;
    if (room.status === 'CLEANING' && !activeTasks.length) issues.push(`Room ${room.roomNumber} (${room.id}) is CLEANING without an active housekeeping task.`);
    if (room.status === 'CLEANING' && activeTasks.some((task) => task.status !== 'CLEANING')) issues.push(`Room ${room.roomNumber} (${room.id}) is CLEANING but its active housekeeping task is not CLEANING.`);
    if (room.status === 'DIRTY' && activeTasks.some((task) => task.status === 'CLEANING')) issues.push(`Room ${room.roomNumber} (${room.id}) is DIRTY but has a CLEANING housekeeping task.`);
  }

  for (const [roomId, activeTasks] of tasksByRoom) {
    if (activeTasks.length > 1) issues.push(`Room ${roomId} has ${activeTasks.length} active housekeeping tasks; expected one.`);
    const room = rooms.find((candidate) => candidate.id === roomId);
    for (const task of activeTasks) if (room && task.hotelId !== room.hotelId) issues.push(`Housekeeping task ${task.id} belongs to hotel ${task.hotelId}, but room ${roomId} belongs to hotel ${room.hotelId}.`);
  }
  return issues;
}

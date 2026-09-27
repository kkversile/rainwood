import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '../.env') });

import { PrismaService } from '../src/common/prisma.service';
import { findHousekeepingIntegrityIssues } from '../src/modules/housekeeping/housekeeping-integrity';

const prisma = new PrismaService();

async function main() {
  await prisma.$connect();
  const activeStatuses = ['PENDING', 'ACCEPTED', 'CLEANING'] as const;
  const [rooms, tasks] = await Promise.all([
    prisma.room.findMany({ where: { active: true }, select: { id: true, roomNumber: true, hotelId: true, status: true, housekeepingTasks: { where: { status: { in: activeStatuses } }, select: { id: true, status: true } } } }),
    prisma.housekeepingTask.findMany({ where: { status: { in: activeStatuses } }, select: { id: true, roomId: true, hotelId: true, status: true } }),
  ]);
  const issues = findHousekeepingIntegrityIssues(rooms, tasks);
  if (issues.length) {
    console.error(`Housekeeping integrity check found ${issues.length} issue(s):`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
  } else {
    console.log(`Housekeeping integrity check passed: ${rooms.length} active rooms and ${tasks.length} active tasks are consistent.`);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

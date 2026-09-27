import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '../.env') });

import { PrismaService } from '../src/common/prisma.service';
import { HousekeepingService } from '../src/modules/housekeeping/housekeeping.service';

const runDatabaseTests = process.env.RUN_DB_INTEGRATION === '1';

(runDatabaseTests ? describe : describe.skip)('PostgreSQL housekeeping task concurrency', () => {
  let prisma: PrismaService;
  let service: HousekeepingService;
  let roomId: string;
  let taskIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new HousekeepingService(prisma, {} as any, {} as any);
    const hotel = await prisma.hotel.findFirstOrThrow({ where: { active: true } });
    const roomType = await prisma.roomType.findFirstOrThrow({ where: { hotelId: hotel.id, active: true } });
    const room = await prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, roomNumber: `IT-HK-${Date.now()}`, status: 'DIRTY', active: true } });
    roomId = room.id;
  });

  afterAll(async () => {
    if (!prisma) return;
    if (roomId) {
      await prisma.housekeepingTask.deleteMany({ where: { roomId } });
      await prisma.room.delete({ where: { id: roomId } });
    }
    await prisma.$disconnect();
  });

  it('creates exactly one active task when two ensure calls race', async () => {
    const results = await Promise.all([
      service.ensureTaskForDirtyRoom(prisma, roomId),
      service.ensureTaskForDirtyRoom(prisma, roomId),
    ]);
    const ids = results.flatMap((result) => result ? [result.id] : []);
    taskIds.push(...ids);
    expect(ids).toHaveLength(2);
    expect(ids[0]).toBe(ids[1]);
    expect(await prisma.housekeepingTask.count({ where: { roomId, status: { in: ['PENDING', 'ACCEPTED', 'CLEANING'] } } })).toBe(1);
  });

  it('allows a new task after the previous task is completed', async () => {
    const current = await prisma.housekeepingTask.findFirstOrThrow({ where: { roomId, status: 'PENDING' } });
    await prisma.$transaction([
      prisma.housekeepingTask.update({ where: { id: current.id }, data: { status: 'COMPLETED', completedAt: new Date() } }),
      prisma.room.update({ where: { id: roomId }, data: { status: 'DIRTY' } }),
    ]);
    const next = await service.ensureTaskForDirtyRoom(prisma, roomId);
    expect(next).not.toBeNull();
    expect(next?.id).not.toBe(current.id);
    taskIds.push(next!.id);
    expect(await prisma.housekeepingTask.count({ where: { roomId, status: 'COMPLETED' } })).toBe(1);
    expect(await prisma.housekeepingTask.count({ where: { roomId, status: 'PENDING' } })).toBe(1);
  });
});

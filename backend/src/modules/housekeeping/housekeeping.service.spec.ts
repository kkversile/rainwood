import { ConflictException, ForbiddenException } from '@nestjs/common';
import { HousekeepingTaskStatus, RoomOperationalStatus, StaffDepartment, UserRole } from '@prisma/client';
import { HousekeepingService } from './housekeeping.service';

function staff(overrides: Record<string, unknown> = {}) {
  return { id: 'staff-1', name: 'Lakshmi', role: UserRole.SERVICE_STAFF, active: true, staffDepartment: StaffDepartment.HOUSEKEEPING, staffHotelId: 'hotel-1', staffHotel: { id: 'hotel-1', name: 'RainWood Aurum', active: true, timezoneName: 'Asia/Kolkata' }, ...overrides };
}

function task(overrides: Record<string, unknown> = {}) {
  return { id: 'task-1', hotelId: 'hotel-1', roomId: 'room-203', status: HousekeepingTaskStatus.PENDING, assignedToId: null, createdAt: new Date(), acceptedAt: null, cleaningStartedAt: null, completedAt: null, issueNote: null, issueReportedAt: null, assignedTo: null, completedBy: null, ...overrides };
}

function setup() {
  const prisma: any = {
    $transaction: jest.fn(async (operation: any) => operation(prisma)),
    user: { findUnique: jest.fn().mockResolvedValue(staff()) },
    room: { findUnique: jest.fn().mockResolvedValue({ id: 'room-203', hotelId: 'hotel-1', roomNumber: '203', status: RoomOperationalStatus.DIRTY }), update: jest.fn() },
    housekeepingTask: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(task()), findUnique: jest.fn().mockResolvedValue(task()), findUniqueOrThrow: jest.fn().mockResolvedValue(task()), update: jest.fn().mockResolvedValue(task()), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const audit = { log: jest.fn().mockResolvedValue({}) } as any;
  const hotels = { updatePhysicalRoom: jest.fn() } as any;
  return { service: new HousekeepingService(prisma, audit, hotels), prisma, audit };
}

describe('housekeeping workflow', () => {
  it('creates one pending task for a dirty room and reuses an active task', async () => {
    const { service, prisma } = setup();
    await service.ensureTaskForDirtyRoom(prisma, 'room-203', 'admin-1');
    expect(prisma.housekeepingTask.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ hotelId: 'hotel-1', roomId: 'room-203', status: HousekeepingTaskStatus.PENDING, createdById: 'admin-1' }) }));
    prisma.housekeepingTask.findFirst.mockResolvedValue(task());
    await service.ensureTaskForDirtyRoom(prisma, 'room-203', 'admin-1');
    expect(prisma.housekeepingTask.create).toHaveBeenCalledTimes(1);
  });

  it('denies non-housekeeping service staff', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(staff({ staffDepartment: StaffDepartment.FOOD_BEVERAGE }));
    await expect(service.staffRooms('staff-1', {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a pending dirty-room task for the assigned hotel', async () => {
    const { service, prisma } = setup();
    await expect(service.accept('staff-1', 'task-1')).resolves.toEqual(expect.objectContaining({ id: 'task-1' }));
    expect(prisma.housekeepingTask.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: HousekeepingTaskStatus.PENDING, assignedToId: null, room: { status: RoomOperationalStatus.DIRTY } }) }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'HOUSEKEEPING_TASK_ACCEPTED' }) }));
  });

  it('returns a conflict when another housekeeper already claimed the task', async () => {
    const { service, prisma } = setup();
    prisma.housekeepingTask.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.accept('staff-1', 'task-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('starts cleaning and completes the room as available', async () => {
    const { service, prisma } = setup();
    prisma.housekeepingTask.findUnique.mockResolvedValueOnce(task({ status: HousekeepingTaskStatus.ACCEPTED, assignedToId: 'staff-1', room: { id: 'room-203', roomNumber: '203', status: RoomOperationalStatus.DIRTY } })).mockResolvedValueOnce(task({ status: HousekeepingTaskStatus.CLEANING, assignedToId: 'staff-1', room: { id: 'room-203', roomNumber: '203', status: RoomOperationalStatus.CLEANING } }));
    await service.start('staff-1', 'task-1');
    expect(prisma.room.update).toHaveBeenCalledWith({ where: { id: 'room-203' }, data: { status: RoomOperationalStatus.CLEANING } });
    prisma.housekeepingTask.findUnique.mockResolvedValueOnce(task({ status: HousekeepingTaskStatus.CLEANING, assignedToId: 'staff-1', room: { id: 'room-203', roomNumber: '203', status: RoomOperationalStatus.CLEANING } })).mockResolvedValueOnce(task({ status: HousekeepingTaskStatus.COMPLETED, assignedToId: 'staff-1' }));
    await service.complete('staff-1', 'task-1');
    expect(prisma.room.update).toHaveBeenLastCalledWith({ where: { id: 'room-203' }, data: { status: RoomOperationalStatus.AVAILABLE } });
  });

  it('reports an issue without changing room status', async () => {
    const { service, prisma, audit } = setup();
    prisma.housekeepingTask.findUnique.mockResolvedValue(task({ status: HousekeepingTaskStatus.CLEANING, assignedToId: 'staff-1', room: { roomNumber: '203' } }));
    await service.reportIssue('staff-1', 'task-1', { note: 'AC leaking' });
    expect(prisma.housekeepingTask.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ issueNote: 'AC leaking' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOUSEKEEPING_ISSUE_REPORTED' }));
    expect(prisma.room.update).not.toHaveBeenCalled();
  });
});

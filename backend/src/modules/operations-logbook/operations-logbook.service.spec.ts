import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { OperationsLogCategory, OperationsLogPriority, OperationsLogStatus, UserRole } from '@prisma/client';
import { OperationsLogbookService } from './operations-logbook.service';

describe('OperationsLogbookService', () => {
  const p: any = {
    user: { findUnique: jest.fn(), findFirst: jest.fn(), findMany: jest.fn() },
    hotel: { findUnique: jest.fn() },
    hotelBusinessDay: { findFirst: jest.fn() },
    operationsLogEntry: { findMany: jest.fn(), findUnique: jest.fn(), count: jest.fn(), create: jest.fn(), update: jest.fn() },
    operationsLogUpdate: { create: jest.fn() },
    reservation: { findFirst: jest.fn(), findMany: jest.fn() },
    guestProfile: { findFirst: jest.fn(), findMany: jest.fn() },
    room: { findFirst: jest.fn(), findMany: jest.fn() },
    maintenanceTicket: { findFirst: jest.fn(), findMany: jest.fn() },
    housekeepingTask: { findFirst: jest.fn(), findMany: jest.fn() },
  };
  const audit = { log: jest.fn() } as any;
  const actor = (role: UserRole = UserRole.ADMIN) => {
    const hotelScoped = ([UserRole.ADMIN, UserRole.RESERVATION, UserRole.SERVICE_STAFF] as UserRole[]).includes(role);
    return { id: 'user-1', role, staffHotelId: hotelScoped ? 'hotel-a' : null, staffDepartment: role === UserRole.SERVICE_STAFF ? 'HOUSEKEEPING' : null, staffHotel: hotelScoped ? { id: 'hotel-a', active: true } : null };
  };
  let service: OperationsLogbookService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new OperationsLogbookService(p, audit);
    p.user.findUnique.mockResolvedValue(actor());
    p.hotel.findUnique.mockResolvedValue({ id: 'hotel-a', name: 'Synthetic Hotel', active: true, timezoneName: 'Asia/Kolkata' });
    p.operationsLogEntry.count.mockResolvedValue(0);
    p.operationsLogEntry.findMany.mockResolvedValue([]);
    p.operationsLogEntry.findUnique.mockResolvedValue(null);
    p.hotelBusinessDay.findFirst.mockResolvedValue(null);
  });

  it('lists only the actor hotel and returns bounded summary counts', async () => {
    await service.list('user-1', { page: 1, limit: 25 });
    expect(p.operationsLogEntry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hotelId: 'hotel-a' }), take: 25 }));
    expect(p.operationsLogEntry.count).toHaveBeenCalledTimes(8);
  });

  it('creates a business-date-scoped entry and audits it', async () => {
    const row: any = { id: 'log-1', hotelId: 'hotel-a', businessDate: new Date('2026-10-02T00:00:00Z'), category: OperationsLogCategory.ARRIVAL, priority: OperationsLogPriority.IMPORTANT, title: 'Arrival follow-up', details: 'Confirm transport', updates: [] };
    p.operationsLogEntry.create.mockResolvedValue(row);
    const result = await service.create('user-1', { hotelId: 'hotel-a', businessDate: '2026-10-02', category: OperationsLogCategory.ARRIVAL, priority: OperationsLogPriority.IMPORTANT, title: ' Arrival follow-up ', details: ' Confirm transport ' });
    expect(result.title).toBe('Arrival follow-up');
    expect(p.operationsLogEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ businessDate: new Date('2026-10-02T00:00:00Z'), createdByUserId: 'user-1' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'OPERATIONS_LOG_CREATED', entityId: 'log-1' }));
  });

  it('keeps acknowledgement and resolution as explicit lifecycle actions', async () => {
    const current: any = { id: 'log-1', hotelId: 'hotel-a', status: OperationsLogStatus.OPEN, category: OperationsLogCategory.GENERAL, assignedUserId: null, assignedDepartment: null };
    p.operationsLogEntry.findUnique.mockResolvedValue(current);
    p.operationsLogEntry.update.mockImplementation(async ({ data }: any) => ({ ...current, ...data }));
    await service.acknowledge('user-1', 'log-1');
    expect(p.operationsLogEntry.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: OperationsLogStatus.ACKNOWLEDGED }) }));
    p.operationsLogEntry.findUnique.mockResolvedValue({ ...current, status: OperationsLogStatus.ACKNOWLEDGED });
    await service.resolve('user-1', 'log-1', { resolutionNote: 'Completed by shift lead' });
    expect(p.operationsLogEntry.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: OperationsLogStatus.RESOLVED, resolutionNote: 'Completed by shift lead' }) }));
  });

  it('blocks viewer mutations', async () => {
    p.user.findUnique.mockResolvedValue(actor(UserRole.VIEWER));
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.GENERAL, title: 'Blocked', details: 'Read-only role' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restricts accounts users to payment follow-ups', async () => {
    p.user.findUnique.mockResolvedValue(actor(UserRole.ACCOUNTS));
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.ROOM, title: 'Blocked', details: 'Accounts scope' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.list('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.ROOM, page: 1, limit: 25 })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets hotel-less accounts select hotels for payment follow-ups and protects direct detail visibility', async () => {
    p.user.findUnique.mockResolvedValue(actor(UserRole.ACCOUNTS));
    await expect(service.list('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.PAYMENT_FOLLOWUP, page: 1, limit: 25 })).resolves.toMatchObject({ hotel: { id: 'hotel-a' } });
    const paymentEntry: any = { id: 'payment-1', hotelId: 'hotel-a', status: OperationsLogStatus.OPEN, category: OperationsLogCategory.PAYMENT_FOLLOWUP, assignedUserId: null, assignedDepartment: null, businessDate: new Date('2026-10-02T00:00:00Z'), updates: [] };
    p.operationsLogEntry.findUnique.mockResolvedValue(paymentEntry);
    await expect(service.detail('user-1', paymentEntry.id)).resolves.toMatchObject({ id: paymentEntry.id });
    p.operationsLogEntry.findUnique.mockResolvedValue({ ...paymentEntry, id: 'room-1', category: OperationsLogCategory.ROOM });
    await expect(service.detail('user-1', 'room-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.update('user-1', 'room-1', { title: 'Blocked' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.acknowledge('user-1', 'room-1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.resolve('user-1', 'room-1', { resolutionNote: 'Blocked' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addUpdate('user-1', 'room-1', { note: 'Blocked' })).rejects.toBeInstanceOf(NotFoundException);
    p.operationsLogEntry.create.mockResolvedValue({ ...paymentEntry, title: 'Payment follow-up', details: 'Confirm advance', priority: OperationsLogPriority.NORMAL });
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.PAYMENT_FOLLOWUP, title: 'Payment follow-up', details: 'Confirm advance' })).resolves.toMatchObject({ category: OperationsLogCategory.PAYMENT_FOLLOWUP });
  });

  it('keeps viewer hotel-less, read-only, and able to read selected hotel entries', async () => {
    p.user.findUnique.mockResolvedValue(actor(UserRole.VIEWER));
    await expect(service.list('user-1', { hotelId: 'hotel-a', page: 1, limit: 25 })).resolves.toMatchObject({ hotel: { id: 'hotel-a' } });
    const entry: any = { id: 'viewer-1', hotelId: 'hotel-a', status: OperationsLogStatus.OPEN, category: OperationsLogCategory.GENERAL, assignedUserId: null, assignedDepartment: null, businessDate: new Date('2026-10-02T00:00:00Z'), updates: [] };
    p.operationsLogEntry.findUnique.mockResolvedValue(entry);
    await expect(service.detail('user-1', entry.id)).resolves.toMatchObject({ id: entry.id });
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.GENERAL, title: 'Blocked', details: 'Viewer is read-only' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update('user-1', entry.id, { title: 'Blocked' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.acknowledge('user-1', entry.id)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.resolve('user-1', entry.id, { resolutionNote: 'Blocked' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.addUpdate('user-1', entry.id, { note: 'Blocked' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('keeps hotel-scoped roles from selecting another hotel', async () => {
    for (const role of [UserRole.ADMIN, UserRole.RESERVATION, UserRole.SERVICE_STAFF]) {
      p.user.findUnique.mockResolvedValue(actor(role));
      await expect(service.list('user-1', { hotelId: 'hotel-b', page: 1, limit: 25 })).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('keeps service staff inside their own department and blocks reassignment escalation', async () => {
    p.user.findUnique.mockResolvedValue(actor(UserRole.SERVICE_STAFF));
    p.user.findUnique.mockResolvedValue({ ...actor(UserRole.SERVICE_STAFF), staffDepartment: 'HOUSEKEEPING' });
    const current: any = { id: 'log-1', hotelId: 'hotel-a', status: OperationsLogStatus.OPEN, category: OperationsLogCategory.HOUSEKEEPING, assignedUserId: 'user-1', assignedDepartment: 'HOUSEKEEPING' };
    p.operationsLogEntry.findUnique.mockResolvedValue(current);
    await expect(service.update('user-1', 'log-1', { assignedDepartment: 'MAINTENANCE' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.MAINTENANCE, title: 'Blocked', details: 'Wrong department' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows service staff to create an entry in their own department by default', async () => {
    p.user.findUnique.mockResolvedValue({ ...actor(UserRole.SERVICE_STAFF), staffDepartment: 'HOUSEKEEPING' });
    p.operationsLogEntry.create.mockResolvedValue({ id: 'log-staff', hotelId: 'hotel-a', businessDate: new Date('2026-10-02T00:00:00Z'), category: OperationsLogCategory.HOUSEKEEPING, priority: OperationsLogPriority.NORMAL, title: 'Extra towels', details: 'Deliver before 9 PM', assignedDepartment: 'HOUSEKEEPING', assignedUserId: null, updates: [] });
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.HOUSEKEEPING, title: 'Extra towels', details: 'Deliver before 9 PM' })).resolves.toMatchObject({ id: 'log-staff' });
    expect(p.operationsLogEntry.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ hotelId: 'hotel-a', assignedDepartment: 'HOUSEKEEPING', assignedUserId: null }) }));
  });

  it('blocks service staff from assigning another user or creating cross-hotel entries', async () => {
    p.user.findUnique.mockResolvedValue({ ...actor(UserRole.SERVICE_STAFF), staffDepartment: 'HOUSEKEEPING' });
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.HOUSEKEEPING, assignedUserId: 'staff-2', title: 'Blocked', details: 'Another owner' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.create('user-1', { hotelId: 'hotel-b', category: OperationsLogCategory.HOUSEKEEPING, title: 'Blocked', details: 'Other hotel' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows management to assign an active same-hotel service staff user', async () => {
    p.user.findUnique.mockResolvedValue(actor(UserRole.ADMIN));
    p.user.findFirst.mockResolvedValue({ id: 'staff-1', role: UserRole.SERVICE_STAFF, staffDepartment: 'HOUSEKEEPING' });
    p.operationsLogEntry.create.mockResolvedValue({ id: 'log-2', hotelId: 'hotel-a', businessDate: new Date('2026-10-02T00:00:00Z'), category: OperationsLogCategory.HOUSEKEEPING, priority: OperationsLogPriority.NORMAL, title: 'Housekeeping follow-up', details: 'Inspect room', updates: [] });
    await expect(service.create('user-1', { hotelId: 'hotel-a', category: OperationsLogCategory.HOUSEKEEPING, title: 'Housekeeping follow-up', details: 'Inspect room', assignedUserId: 'staff-1', assignedDepartment: 'HOUSEKEEPING' })).resolves.toMatchObject({ id: 'log-2' });
  });

  it('keeps handover pagination and summary global across pages', async () => {
    p.operationsLogEntry.findMany.mockResolvedValue([]);
    p.operationsLogEntry.count.mockReset();
    p.operationsLogEntry.count
      .mockResolvedValueOnce(150)
      .mockResolvedValueOnce(70)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5);
    const pageOne = await service.handover('user-1', { page: 1, limit: 100 });
    expect(pageOne.handoverPagination).toMatchObject({ totalActive: 150, returnedActive: 0, hasMore: true, hasPrevious: false, limit: 100 });
    expect(pageOne.summary).toMatchObject({ open: 70, acknowledged: 80, urgent: 4, overdue: 2, dueSoon: 3, scheduled: 5, due: 10 });

    p.operationsLogEntry.count
      .mockResolvedValueOnce(150)
      .mockResolvedValueOnce(70)
      .mockResolvedValueOnce(80)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(5);
    const pageTwo = await service.handover('user-1', { page: 2, limit: 100 });
    expect(pageTwo.handoverPagination).toMatchObject({ totalActive: 150, returnedActive: 0, hasMore: false, hasPrevious: true, limit: 100 });
    expect(pageTwo.summary).toEqual(pageOne.summary);

    p.operationsLogEntry.count
      .mockResolvedValueOnce(100)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(50)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const exactPage = await service.handover('user-1', { page: 1, limit: 100 });
    expect(exactPage.handoverPagination?.hasMore).toBe(false);
  });

  it('includes a requested reservation reference outside the bounded option window', async () => {
    p.user.findMany.mockResolvedValue([]);
    p.reservation.findMany.mockResolvedValue([{ id: 'recent', reference: 'RW-RECENT', guestName: 'Recent Guest' }]);
    p.reservation.findFirst.mockResolvedValue({ id: 'far', reference: 'RW-FAR', guestName: 'Far Guest' });
    p.room.findMany.mockResolvedValue([]); p.maintenanceTicket.findMany.mockResolvedValue([]); p.housekeepingTask.findMany.mockResolvedValue([]); p.guestProfile.findMany.mockResolvedValue([]);
    const result = await service.options('user-1', 'hotel-a', 'RW-FAR');
    expect(result.reservations[0]).toMatchObject({ id: 'far', reference: 'RW-FAR' });
    expect(result.reservations).toHaveLength(2);
  });

  it('returns least-privilege option payloads for accounts, viewer, and service staff', async () => {
    p.reservation.findMany.mockResolvedValue([]); p.reservation.findFirst.mockResolvedValue(null); p.room.findMany.mockResolvedValue([]); p.guestProfile.findMany.mockResolvedValue([]); p.maintenanceTicket.findMany.mockResolvedValue([{ id: 'maintenance-1' }]); p.housekeepingTask.findMany.mockResolvedValue([{ id: 'housekeeping-1' }]); p.user.findMany.mockResolvedValue([{ id: 'user-1' }]);
    p.user.findUnique.mockResolvedValue(actor(UserRole.ACCOUNTS));
    const accounts = await service.options('user-1', 'hotel-a');
    expect(accounts.users).toHaveLength(0); expect(accounts.maintenanceTickets).toHaveLength(0); expect(accounts.housekeepingTasks).toHaveLength(0);
    p.user.findUnique.mockResolvedValue(actor(UserRole.VIEWER));
    const viewer = await service.options('user-1', 'hotel-a');
    expect(viewer.users).toHaveLength(0); expect(viewer.reservations).toHaveLength(0); expect(viewer.guests).toHaveLength(0);
    p.user.findUnique.mockResolvedValue(actor(UserRole.SERVICE_STAFF));
    const staff = await service.options('user-1', 'hotel-a');
    expect(staff.maintenanceTickets).toHaveLength(0); expect(staff.housekeepingTasks).toHaveLength(1);
  });
});

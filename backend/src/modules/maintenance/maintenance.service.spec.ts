import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { MaintenancePriority, MaintenanceTicketStatus, RoomOperationalStatus, StaffDepartment, UserRole } from '@prisma/client';
import { MaintenanceService } from './maintenance.service';

function setup() {
  const admin = { id: 'admin-1', role: UserRole.SUPER_ADMIN, staffHotelId: null };
  const ticket = { id: 'ticket-1', hotelId: 'hotel-1', roomId: 'room-203', status: MaintenanceTicketStatus.OPEN, assignedToId: null, priority: MaintenancePriority.NORMAL, requiresOutOfOrder: false, room: { id: 'room-203', hotelId: 'hotel-1', roomNumber: '203', status: RoomOperationalStatus.AVAILABLE, roomType: { name: 'Premium Valley Room' } }, assignedTo: null, reportedBy: null, source: 'ADMIN', category: 'GENERAL', title: 'AC inspection', description: 'Demo issue', reportedAt: new Date(), assignedAt: null, startedAt: null, completedAt: null, resolutionNote: null, outOfOrderAppliedAt: null, outOfOrderClearedAt: null, housekeepingTaskId: null, createdAt: new Date(), updatedAt: new Date() } as any;
  const maintenance = { id: 'staff-1', name: 'Suresh', role: UserRole.SERVICE_STAFF, active: true, staffDepartment: StaffDepartment.MAINTENANCE, staffHotelId: 'hotel-1', staffHotel: { active: true } };
  const p: any = { user: { findUnique: jest.fn().mockResolvedValue(admin) }, maintenanceTicket: { findUnique: jest.fn().mockResolvedValue(ticket), findUniqueOrThrow: jest.fn().mockResolvedValue(ticket), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0), create: jest.fn().mockResolvedValue(ticket), update: jest.fn().mockResolvedValue(ticket), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, room: { findUnique: jest.fn().mockResolvedValue({ id: 'room-203', hotelId: 'hotel-1', hotel: { active: true } }), count: jest.fn().mockResolvedValue(0), update: jest.fn() }, hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', active: true }) }, $transaction: jest.fn(async (fn: any) => fn(p)), auditLog: { create: jest.fn() } };
  const audit = { log: jest.fn() } as any;
  const hotels = {} as any;
  const housekeeping = { setManagementRoomStatus: jest.fn(), ensureTaskForDirtyRoom: jest.fn() } as any;
  return { service: new MaintenanceService(p, audit, hotels, housekeeping), p, audit, ticket, maintenance, housekeeping };
}

describe('maintenance workflow', () => {
  it('assigns only a same-hotel active maintenance technician', async () => {
    const { service, p, maintenance } = setup();
    p.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN, staffHotelId: null }).mockResolvedValueOnce(maintenance);
    await expect(service.assign('admin-1', 'ticket-1', { staffUserId: 'staff-1' })).resolves.toBeDefined();
    expect(p.maintenanceTicket.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ assignedToId: 'staff-1', status: MaintenanceTicketStatus.ASSIGNED }) }));
    p.user.findUnique.mockResolvedValueOnce({ id: 'admin-1', role: UserRole.SUPER_ADMIN, staffHotelId: null }).mockResolvedValueOnce({ ...maintenance, staffHotelId: 'hotel-2' });
    await expect(service.assign('admin-1', 'ticket-1', { staffUserId: 'staff-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects inactive or non-maintenance staff and non-maintenance users', async () => {
    const { service, p, maintenance } = setup();
    p.user.findUnique.mockResolvedValue({ ...maintenance, active: false });
    await expect(service.staffTasks('staff-1', { view: 'OPEN' })).rejects.toBeInstanceOf(ForbiddenException);
    p.user.findUnique.mockResolvedValue({ ...maintenance, staffDepartment: StaffDepartment.HOUSEKEEPING, active: true });
    await expect(service.staffTasks('staff-1', { view: 'OPEN' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts a ticket atomically and reports a race as a conflict', async () => {
    const { service, p, maintenance } = setup();
    p.user.findUnique.mockResolvedValue(maintenance);
    await expect(service.accept('staff-1', 'ticket-1')).resolves.toBeDefined();
    p.maintenanceTicket.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.accept('staff-1', 'ticket-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('requires the assigned technician to start', async () => {
    const { service, p, maintenance, ticket } = setup();
    p.user.findUnique.mockResolvedValue(maintenance);
    p.maintenanceTicket.findUnique.mockResolvedValue({ ...ticket, assignedToId: 'staff-2', status: MaintenanceTicketStatus.ASSIGNED });
    await expect(service.startAsStaff('staff-1', 'ticket-1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects occupied rooms when maintenance requests out-of-order impact', async () => {
    const { service, p, ticket } = setup();
    p.maintenanceTicket.findUnique.mockResolvedValue({ ...ticket, room: { ...ticket.room, status: RoomOperationalStatus.OCCUPIED } });
    await expect(service.takeRoomOutOfOrder('admin-1', 'ticket-1', { requiresOutOfOrder: true })).rejects.toBeInstanceOf(ConflictException);
  });

  it('resolves an out-of-order room through dirty and housekeeping handoff', async () => {
    const { service, p, ticket, housekeeping, audit } = setup();
    p.maintenanceTicket.findUnique.mockResolvedValue({ ...ticket, status: MaintenanceTicketStatus.IN_PROGRESS, requiresOutOfOrder: true, room: { ...ticket.room, status: RoomOperationalStatus.OUT_OF_ORDER } });
    await expect(service.resolveAsAdmin('admin-1', 'ticket-1', { resolutionNote: 'Leak repaired' })).resolves.toBeDefined();
    expect(p.room.update).toHaveBeenCalledWith({ where: { id: 'room-203' }, data: { status: RoomOperationalStatus.DIRTY } });
    expect(housekeeping.ensureTaskForDirtyRoom).toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });
});

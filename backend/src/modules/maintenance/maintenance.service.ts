import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceCategory, MaintenancePriority, MaintenanceTicketSource, MaintenanceTicketStatus, Prisma, RoomOperationalStatus, StaffDepartment, UserRole } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { serializable } from '../../common/transactions';
import { HousekeepingService } from '../housekeeping/housekeeping.service';
import { HotelsService } from '../hotels/hotels.service';
import { MaintenanceAssignDto, MaintenanceBoardQueryDto, MaintenanceCreateDto, MaintenanceImpactDto, MaintenanceResolveDto, MaintenanceStaffQueryDto, MaintenanceUpdateDto } from './maintenance.dto';

const ACTIVE_STATUSES: MaintenanceTicketStatus[] = [MaintenanceTicketStatus.OPEN, MaintenanceTicketStatus.ASSIGNED, MaintenanceTicketStatus.IN_PROGRESS];
const MANAGEMENT_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.CORPORATE_ADMIN, UserRole.SUPER_ADMIN];
const ticketInclude = {
  room: { select: { id: true, roomNumber: true, floor: true, wing: true, hotelId: true, status: true, roomType: { select: { name: true } } } },
  reportedBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

@Injectable()
export class MaintenanceService {
  constructor(private p: PrismaService, private audit: AuditService, private hotels: HotelsService, private housekeeping: HousekeepingService) {}

  private async managementUser(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { id: true, role: true, staffHotelId: true } });
    if (!user || !MANAGEMENT_ROLES.includes(user.role)) throw new ForbiddenException('Management permission is required.');
    return user;
  }

  private async maintenanceUser(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, active: true, staffDepartment: true, staffHotelId: true, staffHotel: { select: { id: true, name: true, active: true } } } });
    if (!user || user.role !== UserRole.SERVICE_STAFF || !user.active || user.staffDepartment !== StaffDepartment.MAINTENANCE || !user.staffHotelId || !user.staffHotel?.active) throw new ForbiddenException('Maintenance access requires an active maintenance staff account.');
    return user;
  }

  private assertScope(admin: { staffHotelId: string | null }, hotelId: string) {
    if (admin.staffHotelId && admin.staffHotelId !== hotelId) throw new NotFoundException('Maintenance ticket not found.');
  }

  private view(ticket: any) {
    return { id: ticket.id, hotelId: ticket.hotelId, room: ticket.room ?? null, source: ticket.source, category: ticket.category, priority: ticket.priority, status: ticket.status, title: ticket.title, description: ticket.description, reportedBy: ticket.reportedBy ?? null, reportedAt: ticket.reportedAt, assignedTo: ticket.assignedTo ?? null, assignedAt: ticket.assignedAt, startedAt: ticket.startedAt, completedAt: ticket.completedAt, resolutionNote: ticket.resolutionNote, requiresOutOfOrder: ticket.requiresOutOfOrder, outOfOrderAppliedAt: ticket.outOfOrderAppliedAt, outOfOrderClearedAt: ticket.outOfOrderClearedAt, housekeepingTaskId: ticket.housekeepingTaskId ?? null, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt };
  }

  private async adminTicket(adminUserId: string, ticketId: string) {
    const admin = await this.managementUser(adminUserId);
    const ticket = await this.p.maintenanceTicket.findUnique({ where: { id: ticketId }, include: ticketInclude });
    if (!ticket) throw new NotFoundException('Maintenance ticket not found.');
    this.assertScope(admin, ticket.hotelId);
    return { admin, ticket };
  }

  async board(adminUserId: string, query: MaintenanceBoardQueryDto) {
    const admin = await this.managementUser(adminUserId);
    if (admin.staffHotelId && query.hotelId && query.hotelId !== admin.staffHotelId) throw new NotFoundException('Maintenance ticket not found.');
    const hotelId = admin.staffHotelId ?? query.hotelId;
    const where = { hotelId: hotelId || undefined, status: query.status, priority: query.priority, category: query.category, source: query.source, assignedToId: query.assignedToId, roomId: query.roomId };
    const [tickets, groups, urgent, outOfOrderRooms] = await Promise.all([
      this.p.maintenanceTicket.findMany({ where, orderBy: [{ priority: 'desc' }, { reportedAt: 'asc' }], include: ticketInclude }),
      this.p.maintenanceTicket.groupBy({ by: ['status'], where: { ...where, status: undefined }, _count: { status: true } }),
      this.p.maintenanceTicket.count({ where: { ...where, priority: MaintenancePriority.URGENT, status: { in: ACTIVE_STATUSES } } }),
      this.p.room.count({ where: { hotelId: hotelId || undefined, status: RoomOperationalStatus.OUT_OF_ORDER } }),
    ]);
    const metrics = Object.fromEntries(Object.values(MaintenanceTicketStatus).map((status) => [status, groups.find((row) => row.status === status)?._count.status ?? 0]));
    return { metrics: { ...metrics, URGENT: urgent, OUT_OF_ORDER_ROOMS: outOfOrderRooms }, tickets: tickets.map((ticket) => this.view(ticket)) };
  }

  async detail(adminUserId: string, ticketId: string) {
    const { ticket } = await this.adminTicket(adminUserId, ticketId);
    return this.view(ticket);
  }

  async staffList(adminUserId: string) {
    const admin = await this.managementUser(adminUserId);
    return this.p.user.findMany({ where: { role: UserRole.SERVICE_STAFF, staffDepartment: StaffDepartment.MAINTENANCE, active: true, staffHotelId: admin.staffHotelId ?? undefined }, select: { id: true, name: true, email: true, jobTitle: true, staffHotelId: true }, orderBy: { name: 'asc' } });
  }

  async hotelList(adminUserId: string) {
    const admin = await this.managementUser(adminUserId);
    return this.p.hotel.findMany({ where: { id: admin.staffHotelId ?? undefined, active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async roomList(adminUserId: string) {
    const admin = await this.managementUser(adminUserId);
    return this.p.room.findMany({ where: { hotelId: admin.staffHotelId ?? undefined, active: true }, select: { id: true, hotelId: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { name: true } } }, orderBy: [{ hotel: { name: 'asc' } }, { roomNumber: 'asc' }] });
  }

  async create(adminUserId: string, body: MaintenanceCreateDto) {
    const admin = await this.managementUser(adminUserId);
    let hotelId = body.hotelId;
    let room: { id: string; hotelId: string; hotel: { active: boolean } } | null = null;
    if (body.roomId) {
      room = await this.p.room.findUnique({ where: { id: body.roomId }, select: { id: true, hotelId: true, hotel: { select: { active: true } } } });
      if (!room) throw new NotFoundException('Physical room not found.');
      if (body.hotelId && body.hotelId !== room.hotelId) throw new BadRequestException('Room does not belong to the selected hotel.');
      hotelId = room.hotelId;
    }
    if (!hotelId) throw new BadRequestException('A hotel or room is required to create a maintenance ticket.');
    this.assertScope(admin, hotelId);
    if (room && !room.hotel.active) throw new BadRequestException('The selected hotel is inactive.');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, active: true } });
    if (!hotel || !hotel.active) throw new BadRequestException('The selected hotel is inactive.');
    const ticket = await this.p.maintenanceTicket.create({ data: { hotelId, roomId: body.roomId ?? null, source: body.source ?? MaintenanceTicketSource.ADMIN, category: body.category, priority: body.priority ?? MaintenancePriority.NORMAL, title: body.title.trim(), description: body.description.trim(), createdById: adminUserId }, include: ticketInclude });
    await this.audit.log({ actorUserId: adminUserId, action: 'MAINTENANCE_TICKET_CREATED', entityType: 'MaintenanceTicket', entityId: ticket.id, after: { ticketId: ticket.id, hotelId, roomId: body.roomId ?? null, source: ticket.source, category: ticket.category, priority: ticket.priority } });
    return this.view(ticket);
  }

  async update(adminUserId: string, ticketId: string, body: MaintenanceUpdateDto) {
    const { ticket } = await this.adminTicket(adminUserId, ticketId);
    if (!ACTIVE_STATUSES.includes(ticket.status)) throw new ConflictException('Only active maintenance tickets can be edited.');
    const updated = await this.p.maintenanceTicket.update({ where: { id: ticketId }, data: { category: body.category, priority: body.priority, title: body.title?.trim(), description: body.description?.trim() }, include: ticketInclude });
    return this.view(updated);
  }

  async assign(adminUserId: string, ticketId: string, body: MaintenanceAssignDto) {
    const { ticket } = await this.adminTicket(adminUserId, ticketId);
    if (ticket.status !== MaintenanceTicketStatus.OPEN && ticket.status !== MaintenanceTicketStatus.ASSIGNED) throw new ConflictException('Only open or assigned maintenance tickets can be assigned.');
    const staff = await this.p.user.findUnique({ where: { id: body.staffUserId }, select: { id: true, name: true, role: true, active: true, staffDepartment: true, staffHotelId: true, staffHotel: { select: { active: true } } } });
    if (!staff || !staff.active || staff.role !== UserRole.SERVICE_STAFF || staff.staffDepartment !== StaffDepartment.MAINTENANCE || staff.staffHotelId !== ticket.hotelId || !staff.staffHotel?.active) throw new BadRequestException('Selected maintenance staff member is not assigned to this hotel.');
    const updated = await this.p.maintenanceTicket.update({ where: { id: ticketId }, data: { assignedToId: staff.id, assignedAt: new Date(), status: MaintenanceTicketStatus.ASSIGNED }, include: ticketInclude });
    await this.audit.log({ actorUserId: adminUserId, action: 'MAINTENANCE_TICKET_ASSIGNED', entityType: 'MaintenanceTicket', entityId: ticketId, after: { ticketId, hotelId: ticket.hotelId, roomId: ticket.roomId, assignedToId: staff.id, assignedToName: staff.name } });
    return this.view(updated);
  }

  async accept(staffUserId: string, ticketId: string) {
    const staff = await this.maintenanceUser(staffUserId);
    const current = await this.p.maintenanceTicket.findUnique({ where: { id: ticketId }, select: { id: true, hotelId: true, roomId: true } });
    if (!current || current.hotelId !== staff.staffHotelId) throw new NotFoundException('Maintenance ticket not found.');
    const result = await this.p.maintenanceTicket.updateMany({ where: { id: ticketId, hotelId: staff.staffHotelId, status: MaintenanceTicketStatus.OPEN, assignedToId: null }, data: { status: MaintenanceTicketStatus.ASSIGNED, assignedToId: staff.id, assignedAt: new Date() } });
    if (result.count !== 1) throw new ConflictException('This maintenance ticket has already been assigned.');
    const ticket = await this.p.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketId }, include: ticketInclude });
    await this.audit.log({ actorUserId: staff.id, action: 'MAINTENANCE_TICKET_ASSIGNED', entityType: 'MaintenanceTicket', entityId: ticketId, after: { ticketId, hotelId: ticket.hotelId, roomId: ticket.roomId, assignedToId: staff.id } });
    return this.view(ticket);
  }

  async startAsStaff(staffUserId: string, ticketId: string) {
    const staff = await this.maintenanceUser(staffUserId);
    const ticket = await this.p.maintenanceTicket.findUnique({ where: { id: ticketId }, include: ticketInclude });
    if (!ticket || ticket.hotelId !== staff.staffHotelId) throw new NotFoundException('Maintenance ticket not found.');
    if (ticket.assignedToId !== staff.id || ticket.status !== MaintenanceTicketStatus.ASSIGNED) throw new ConflictException('Only the assigned technician can start this ticket.');
    return this.startTicket(ticketId, staff.id);
  }

  async startAsAdmin(adminUserId: string, ticketId: string) {
    const { ticket } = await this.adminTicket(adminUserId, ticketId);
    if (!ticket.assignedToId || ticket.status !== MaintenanceTicketStatus.ASSIGNED) throw new ConflictException('Only an assigned maintenance ticket can start.');
    return this.startTicket(ticketId, adminUserId);
  }

  private async startTicket(ticketId: string, actorUserId: string) {
    const result = await this.p.maintenanceTicket.updateMany({ where: { id: ticketId, status: MaintenanceTicketStatus.ASSIGNED }, data: { status: MaintenanceTicketStatus.IN_PROGRESS, startedAt: new Date() } });
    if (result.count !== 1) throw new ConflictException('Only an assigned maintenance ticket can start.');
    const updated = await this.p.maintenanceTicket.findUniqueOrThrow({ where: { id: ticketId }, include: ticketInclude });
    await this.audit.log({ actorUserId, action: 'MAINTENANCE_STARTED', entityType: 'MaintenanceTicket', entityId: ticketId, after: { ticketId, hotelId: updated.hotelId, roomId: updated.roomId, assignedToId: updated.assignedToId } });
    return this.view(updated);
  }

  async resolveAsStaff(staffUserId: string, ticketId: string, body: MaintenanceResolveDto) {
    const staff = await this.maintenanceUser(staffUserId);
    const ticket = await this.p.maintenanceTicket.findUnique({ where: { id: ticketId }, select: { hotelId: true, assignedToId: true, status: true } });
    if (!ticket || ticket.hotelId !== staff.staffHotelId) throw new NotFoundException('Maintenance ticket not found.');
    if (ticket.assignedToId !== staff.id) throw new ForbiddenException('Only the assigned technician can resolve this ticket.');
    return this.resolveTicket(ticketId, staff.id, body.resolutionNote);
  }

  async resolveAsAdmin(adminUserId: string, ticketId: string, body: MaintenanceResolveDto) {
    await this.adminTicket(adminUserId, ticketId);
    return this.resolveTicket(ticketId, adminUserId, body.resolutionNote);
  }

  private async resolveTicket(ticketId: string, actorUserId: string, resolutionNote: string) {
    return serializable(this.p, async (tx) => {
      const ticket = await tx.maintenanceTicket.findUnique({ where: { id: ticketId }, include: { room: { select: { id: true, hotelId: true, roomNumber: true, status: true } } } });
      if (!ticket || ticket.status !== MaintenanceTicketStatus.IN_PROGRESS) throw new ConflictException('Only an in-progress maintenance ticket can be resolved.');
      let released = false;
      if (ticket.requiresOutOfOrder && ticket.room?.status === RoomOperationalStatus.OUT_OF_ORDER) {
        const otherBlocking = await tx.maintenanceTicket.count({ where: { roomId: ticket.room.id, id: { not: ticket.id }, requiresOutOfOrder: true, status: { in: ACTIVE_STATUSES } } });
        if (!otherBlocking) {
          await tx.room.update({ where: { id: ticket.room.id }, data: { status: RoomOperationalStatus.DIRTY } });
          await this.housekeeping.ensureTaskForDirtyRoom(tx, ticket.room.id, actorUserId);
          released = true;
        }
      }
      const updated = await tx.maintenanceTicket.update({ where: { id: ticket.id }, data: { status: MaintenanceTicketStatus.RESOLVED, completedAt: new Date(), resolutionNote: resolutionNote.trim(), outOfOrderClearedAt: released ? new Date() : undefined }, include: ticketInclude });
      await tx.auditLog.create({ data: { actorUserId, action: 'MAINTENANCE_RESOLVED', entityType: 'MaintenanceTicket', entityId: ticket.id, after: { ticketId: ticket.id, hotelId: ticket.hotelId, roomId: ticket.roomId, requiresOutOfOrder: ticket.requiresOutOfOrder, roomReleased: released } } });
      if (released && ticket.room) await tx.auditLog.create({ data: { actorUserId, action: 'ROOM_RELEASED_FROM_MAINTENANCE', entityType: 'Room', entityId: ticket.room.id, after: { ticketId: ticket.id, hotelId: ticket.hotelId, roomId: ticket.room.id, status: RoomOperationalStatus.DIRTY } } });
      return this.view(updated);
    });
  }

  async cancel(adminUserId: string, ticketId: string) {
    const admin = await this.managementUser(adminUserId);
    return serializable(this.p, async (tx) => {
      const ticket = await tx.maintenanceTicket.findUnique({ where: { id: ticketId }, include: ticketInclude });
      if (!ticket) throw new NotFoundException('Maintenance ticket not found.');
      this.assertScope(admin, ticket.hotelId);
      if (ticket.status !== MaintenanceTicketStatus.OPEN && ticket.status !== MaintenanceTicketStatus.ASSIGNED) throw new ConflictException('Only open or assigned maintenance tickets can be cancelled.');

      const now = new Date();
      let released = false;
      if (ticket.requiresOutOfOrder && ticket.room?.status === RoomOperationalStatus.OUT_OF_ORDER) {
        const otherBlocking = await tx.maintenanceTicket.count({ where: { roomId: ticket.room.id, id: { not: ticket.id }, requiresOutOfOrder: true, status: { in: ACTIVE_STATUSES } } });
        if (!otherBlocking) {
          await tx.room.update({ where: { id: ticket.room.id }, data: { status: RoomOperationalStatus.DIRTY } });
          await this.housekeeping.ensureTaskForDirtyRoom(tx, ticket.room.id, adminUserId);
          released = true;
        }
      }

      const updated = await tx.maintenanceTicket.update({ where: { id: ticket.id }, data: { status: MaintenanceTicketStatus.CANCELLED, outOfOrderClearedAt: released ? now : undefined }, include: ticketInclude });
      await tx.auditLog.create({ data: { actorUserId: adminUserId, action: 'MAINTENANCE_TICKET_CANCELLED', entityType: 'MaintenanceTicket', entityId: ticket.id, before: { ticketId: ticket.id, hotelId: ticket.hotelId, roomId: ticket.roomId, priorStatus: ticket.status }, after: { ticketId: ticket.id, hotelId: ticket.hotelId, roomId: ticket.roomId, status: MaintenanceTicketStatus.CANCELLED, roomReleased: released } } });
      if (released && ticket.room) await tx.auditLog.create({ data: { actorUserId: adminUserId, action: 'ROOM_RELEASED_FROM_MAINTENANCE', entityType: 'Room', entityId: ticket.room.id, after: { ticketId: ticket.id, hotelId: ticket.hotelId, roomId: ticket.room.id, status: RoomOperationalStatus.DIRTY, reason: 'cancellation' } } });
      return this.view(updated);
    });
  }

  async takeRoomOutOfOrder(adminUserId: string, ticketId: string, body: MaintenanceImpactDto) {
    const admin = await this.managementUser(adminUserId);
    if (!body.requiresOutOfOrder) throw new BadRequestException('This action must request an out-of-order room impact.');
    return serializable(this.p, async (tx) => {
      const ticket = await tx.maintenanceTicket.findUnique({ where: { id: ticketId }, include: ticketInclude });
      if (!ticket) throw new NotFoundException('Maintenance ticket not found.');
      this.assertScope(admin, ticket.hotelId);
      if (!ACTIVE_STATUSES.includes(ticket.status)) throw new ConflictException('Only active maintenance tickets can place a room out of order.');
      if (!ticket.room) throw new BadRequestException('A room is required before applying out-of-order impact.');
      if (ticket.room.status === RoomOperationalStatus.OCCUPIED) throw new ConflictException('Occupied rooms cannot be taken out of order before the guest is moved.');
      // OOO is idempotent for an active ticket. Preserve the first impact timestamp.
      if (ticket.room.status !== RoomOperationalStatus.OUT_OF_ORDER) await this.housekeeping.setManagementRoomStatusInTransaction(tx, adminUserId, ticket.room.id, RoomOperationalStatus.OUT_OF_ORDER);
      const now = new Date();
      const updated = await tx.maintenanceTicket.update({ where: { id: ticket.id }, data: { requiresOutOfOrder: true, outOfOrderAppliedAt: ticket.outOfOrderAppliedAt ?? now }, include: ticketInclude });
      await tx.auditLog.create({ data: { actorUserId: adminUserId, action: 'ROOM_MARKED_OUT_OF_ORDER', entityType: 'MaintenanceTicket', entityId: ticket.id, after: { ticketId: ticket.id, hotelId: ticket.hotelId, roomId: ticket.room.id, status: RoomOperationalStatus.OUT_OF_ORDER } } });
      return this.view(updated);
    });
  }

  async staffTasks(staffUserId: string, query: MaintenanceStaffQueryDto) {
    const staff = await this.maintenanceUser(staffUserId);
    const view = query.view ?? 'OPEN';
    const where = view === 'OPEN'
      ? { hotelId: staff.staffHotelId!, status: MaintenanceTicketStatus.OPEN, assignedToId: null }
      : view === 'IN_PROGRESS'
        ? { hotelId: staff.staffHotelId!, status: MaintenanceTicketStatus.IN_PROGRESS, assignedToId: staff.id }
        : { hotelId: staff.staffHotelId!, status: { in: [MaintenanceTicketStatus.ASSIGNED, MaintenanceTicketStatus.IN_PROGRESS] }, assignedToId: staff.id };
    const tickets = await this.p.maintenanceTicket.findMany({ where, orderBy: [{ priority: 'desc' }, { reportedAt: 'asc' }], include: ticketInclude });
    return tickets.map((ticket) => this.view(ticket));
  }

  async staffDetail(staffUserId: string, ticketId: string) {
    const staff = await this.maintenanceUser(staffUserId);
    const ticket = await this.p.maintenanceTicket.findUnique({ where: { id: ticketId }, include: ticketInclude });
    if (!ticket || ticket.hotelId !== staff.staffHotelId) throw new NotFoundException('Maintenance ticket not found.');
    return this.view(ticket);
  }
}

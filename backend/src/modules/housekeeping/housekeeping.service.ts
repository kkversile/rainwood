import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HousekeepingTaskStatus, MaintenanceTicketStatus, Prisma, RoomOperationalStatus, StaffDepartment, UserRole } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { serializable } from '../../common/transactions';
import { HotelsService } from '../hotels/hotels.service';
import { HousekeepingAssignDto, HousekeepingBoardQueryDto, HousekeepingCancelDto, HousekeepingIssueDto, HousekeepingRoomStatusDto } from './housekeeping.dto';

const ACTIVE_TASK_STATUSES: HousekeepingTaskStatus[] = [HousekeepingTaskStatus.PENDING, HousekeepingTaskStatus.ACCEPTED, HousekeepingTaskStatus.CLEANING];
const MANAGEMENT_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.CORPORATE_ADMIN, UserRole.SUPER_ADMIN];

const taskInclude = {
  assignedTo: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
} as const;

@Injectable()
export class HousekeepingService {
  constructor(private p: PrismaService, private audit: AuditService, private hotels: HotelsService) {}

  async ensureTaskForDirtyRoom(client: PrismaService | Prisma.TransactionClient, roomId: string, createdById?: string) {
    const room = await client.room.findUnique({ where: { id: roomId }, select: { id: true, hotelId: true, roomNumber: true, status: true } });
    if (!room || room.status !== RoomOperationalStatus.DIRTY) return null;
    const existing = await client.housekeepingTask.findFirst({ where: { roomId, status: { in: ACTIVE_TASK_STATUSES } }, orderBy: { createdAt: 'desc' } });
    if (existing) return existing;
    const inserted = await client.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO "HousekeepingTask" ("id", "hotelId", "roomId", "status", "createdById", "createdAt", "updatedAt")
      VALUES (${randomUUID()}, ${room.hotelId}, ${room.id}, 'PENDING'::"HousekeepingTaskStatus", ${createdById ?? null}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT ("roomId") WHERE "status" IN ('PENDING'::"HousekeepingTaskStatus", 'ACCEPTED'::"HousekeepingTaskStatus", 'CLEANING'::"HousekeepingTaskStatus") DO NOTHING
      RETURNING "id"
    `);
    if (!inserted.length) {
      return client.housekeepingTask.findFirst({ where: { roomId, status: { in: ACTIVE_TASK_STATUSES } }, orderBy: { createdAt: 'desc' } });
    }
    const task = await client.housekeepingTask.findUniqueOrThrow({ where: { id: inserted[0].id } });
    await client.auditLog.create({ data: { actorUserId: createdById, action: 'HOUSEKEEPING_TASK_CREATED', entityType: 'HousekeepingTask', entityId: task.id, after: { hotelId: room.hotelId, roomId: room.id, roomNumber: room.roomNumber, status: task.status } } });
    return task;
  }

  private async housekeepingUser(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, active: true, staffDepartment: true, staffHotelId: true, staffHotel: { select: { id: true, name: true, active: true, timezoneName: true } } } });
    if (!user || user.role !== UserRole.SERVICE_STAFF || !user.active || user.staffDepartment !== StaffDepartment.HOUSEKEEPING || !user.staffHotelId || !user.staffHotel?.active) throw new ForbiddenException('Housekeeping access requires an active housekeeping staff account.');
    return user;
  }

  private async managementUser(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { id: true, role: true, staffHotelId: true } });
    if (!user || !MANAGEMENT_ROLES.includes(user.role)) throw new ForbiddenException('Management permission is required.');
    return user;
  }

  private assertAdminHotelScope(admin: { staffHotelId: string | null }, hotelId: string) {
    if (admin.staffHotelId && admin.staffHotelId !== hotelId) throw new NotFoundException('Housekeeping resource not found.');
  }

  private taskView(task: any) {
    return { id: task.id, status: task.status, assignedTo: task.assignedTo ?? null, createdAt: task.createdAt, acceptedAt: task.acceptedAt, cleaningStartedAt: task.cleaningStartedAt, completedAt: task.completedAt, issueNote: task.issueNote ?? null, issueReportedAt: task.issueReportedAt ?? null };
  }

  private roomView(room: any) {
    return { hotelId: room.hotelId, roomId: room.id, roomNumber: room.roomNumber, floor: room.floor, wing: room.wing, roomType: room.roomType, roomStatus: room.status, task: room.housekeepingTasks?.[0] ? this.taskView(room.housekeepingTasks[0]) : null };
  }

  private roomWhere(query: HousekeepingBoardQueryDto, defaultStatuses?: RoomOperationalStatus[]) {
    return {
      hotelId: query.hotelId || undefined,
      status: query.status ?? (defaultStatuses ? { in: defaultStatuses } : undefined),
      floor: query.floor?.trim() || undefined,
      roomTypeId: query.roomTypeId || undefined,
      ...(query.assignedToId ? { housekeepingTasks: { some: { assignedToId: query.assignedToId, status: { in: ACTIVE_TASK_STATUSES } } } } : {}),
    };
  }

  async staffRooms(userId: string, query: HousekeepingBoardQueryDto) {
    const user = await this.housekeepingUser(userId);
    const requestedStatus = query.status === RoomOperationalStatus.DIRTY || query.status === RoomOperationalStatus.CLEANING ? query.status : undefined;
    const rooms = await this.p.room.findMany({
      where: { ...this.roomWhere({ ...query, status: requestedStatus, hotelId: user.staffHotelId! }, [RoomOperationalStatus.DIRTY, RoomOperationalStatus.CLEANING]), hotelId: user.staffHotelId! },
      orderBy: [{ status: 'asc' }, { floor: 'asc' }, { roomNumber: 'asc' }],
      include: { roomType: { select: { id: true, name: true } }, housekeepingTasks: { where: { status: { in: ACTIVE_TASK_STATUSES } }, orderBy: { createdAt: 'desc' }, take: 1, include: taskInclude } },
    });
    return rooms.map((room) => this.roomView(room));
  }

  async staffTasks(userId: string) {
    const user = await this.housekeepingUser(userId);
    const tasks = await this.p.housekeepingTask.findMany({ where: { hotelId: user.staffHotelId!, status: { in: ACTIVE_TASK_STATUSES } }, orderBy: [{ status: 'asc' }, { createdAt: 'asc' }], include: { ...taskInclude, room: { select: { id: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } } } } });
    return tasks.map((task) => ({ ...this.taskView(task), room: task.room }));
  }

  async board(adminUserId: string, query: HousekeepingBoardQueryDto) {
    const admin = await this.managementUser(adminUserId);
    if (admin.staffHotelId && query.hotelId && query.hotelId !== admin.staffHotelId) throw new NotFoundException('Housekeeping resource not found.');
    const effectiveHotelId = admin.staffHotelId ?? query.hotelId;
    const scopedQuery = { ...query, hotelId: effectiveHotelId };
    const rooms = await this.p.room.findMany({ where: this.roomWhere(scopedQuery), orderBy: [{ status: 'asc' }, { floor: 'asc' }, { roomNumber: 'asc' }], include: { roomType: { select: { id: true, name: true } }, housekeepingTasks: { orderBy: { createdAt: 'desc' }, take: 1, include: taskInclude } } });
    const all = effectiveHotelId ? await this.p.room.groupBy({ by: ['status'], where: { hotelId: effectiveHotelId }, _count: { status: true } }) : await this.p.room.groupBy({ by: ['status'], _count: { status: true } });
    const summary = Object.fromEntries(Object.values(RoomOperationalStatus).map((status) => [status, all.find((row) => row.status === status)?._count.status ?? 0]));
    return { summary, rooms: rooms.map((room) => this.roomView(room)) };
  }

  async staffList(userId: string) {
    const user = await this.managementUser(userId);
    return this.p.user.findMany({ where: { role: UserRole.SERVICE_STAFF, staffDepartment: StaffDepartment.HOUSEKEEPING, active: true, staffHotelId: user.staffHotelId ?? undefined }, select: { id: true, name: true, email: true, jobTitle: true, staffHotelId: true }, orderBy: { name: 'asc' } });
  }

  async accept(userId: string, taskId: string) {
    const user = await this.housekeepingUser(userId);
    return serializable(this.p, async (tx) => {
      const task = await tx.housekeepingTask.findUnique({ where: { id: taskId }, select: { id: true, hotelId: true, roomId: true } });
      if (!task || task.hotelId !== user.staffHotelId) throw new NotFoundException('Housekeeping task not found.');
      const result = await tx.housekeepingTask.updateMany({ where: { id: taskId, hotelId: user.staffHotelId, status: HousekeepingTaskStatus.PENDING, assignedToId: null, room: { status: RoomOperationalStatus.DIRTY } }, data: { assignedToId: user.id, status: HousekeepingTaskStatus.ACCEPTED, acceptedAt: new Date() } });
      if (result.count !== 1) throw new ConflictException('Room has already been assigned or is no longer dirty.');
      const updated = await tx.housekeepingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'HOUSEKEEPING_TASK_ACCEPTED', entityType: 'HousekeepingTask', entityId: taskId, after: { hotelId: task.hotelId, roomId: task.roomId, assignedToId: user.id } } });
      return this.taskView(updated);
    });
  }

  async start(userId: string, taskId: string) {
    const user = await this.housekeepingUser(userId);
    return serializable(this.p, async (tx) => {
      const task = await tx.housekeepingTask.findUnique({ where: { id: taskId }, include: { room: { select: { id: true, roomNumber: true, status: true } } } });
      if (!task || task.hotelId !== user.staffHotelId) throw new NotFoundException('Housekeeping task not found.');
      if (task.assignedToId !== user.id || task.status !== HousekeepingTaskStatus.ACCEPTED || task.room.status !== RoomOperationalStatus.DIRTY) throw new ConflictException('Only the assigned housekeeper can start an accepted dirty-room task.');
      const now = new Date();
      await tx.housekeepingTask.update({ where: { id: taskId }, data: { status: HousekeepingTaskStatus.CLEANING, cleaningStartedAt: now } });
      await tx.room.update({ where: { id: task.roomId }, data: { status: RoomOperationalStatus.CLEANING } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'HOUSEKEEPING_STARTED', entityType: 'HousekeepingTask', entityId: taskId, after: { hotelId: task.hotelId, roomId: task.roomId, roomNumber: task.room.roomNumber } } });
      return this.taskView(await tx.housekeepingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }));
    });
  }

  async complete(userId: string, taskId: string) {
    const user = await this.housekeepingUser(userId);
    return serializable(this.p, async (tx) => {
      const task = await tx.housekeepingTask.findUnique({ where: { id: taskId }, include: { room: { select: { id: true, roomNumber: true, status: true } } } });
      if (!task || task.hotelId !== user.staffHotelId) throw new NotFoundException('Housekeeping task not found.');
      if (task.assignedToId !== user.id || task.status !== HousekeepingTaskStatus.CLEANING || task.room.status !== RoomOperationalStatus.CLEANING) throw new ConflictException('Only the assigned housekeeper can complete a room that is being cleaned.');
      const now = new Date();
      await tx.housekeepingTask.update({ where: { id: taskId }, data: { status: HousekeepingTaskStatus.COMPLETED, completedAt: now, completedById: user.id } });
      await tx.room.update({ where: { id: task.roomId }, data: { status: RoomOperationalStatus.AVAILABLE } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'HOUSEKEEPING_COMPLETED', entityType: 'HousekeepingTask', entityId: taskId, after: { hotelId: task.hotelId, roomId: task.roomId, roomNumber: task.room.roomNumber } } });
      return this.taskView(await tx.housekeepingTask.findUniqueOrThrow({ where: { id: taskId }, include: taskInclude }));
    });
  }

  async reportIssue(userId: string, taskId: string, body: HousekeepingIssueDto) {
    const user = await this.housekeepingUser(userId);
    return serializable(this.p, async (tx) => {
      const task = await tx.housekeepingTask.findUnique({ where: { id: taskId }, include: { room: { select: { id: true, roomNumber: true } } } });
      if (!task || task.hotelId !== user.staffHotelId) throw new NotFoundException('Housekeeping task not found.');
      if (task.assignedToId !== user.id || (task.status !== HousekeepingTaskStatus.ACCEPTED && task.status !== HousekeepingTaskStatus.CLEANING)) throw new ConflictException('Only the assigned housekeeper can report an issue for an active task.');
      const note = body.note.trim();
      // V1 keeps one maintenance ticket per housekeeping task: active repeats update it,
      // while closed tickets reject new reports so the maintenance history is preserved.
      const existing = await tx.maintenanceTicket.findUnique({ where: { housekeepingTaskId: task.id }, select: { id: true, status: true } });
      if (existing && (existing.status === MaintenanceTicketStatus.RESOLVED || existing.status === MaintenanceTicketStatus.CANCELLED)) {
        throw new ConflictException('This housekeeping task already has a closed maintenance ticket. Create a new housekeeping task before reporting another issue.');
      }
      const ticket = existing
        ? await tx.maintenanceTicket.update({ where: { id: existing.id }, data: { description: note, updatedAt: new Date() }, select: { id: true } })
        : await tx.maintenanceTicket.create({ data: { hotelId: task.hotelId, roomId: task.roomId, housekeepingTaskId: task.id, source: 'HOUSEKEEPING', category: 'GENERAL', priority: 'NORMAL', status: 'OPEN', title: `Housekeeping issue · Room ${task.room.roomNumber}`, description: note, reportedById: user.id }, select: { id: true } });
      const updated = await tx.housekeepingTask.update({ where: { id: taskId }, data: { issueNote: note, issueReportedAt: new Date(), issueReportedById: user.id }, include: taskInclude });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'HOUSEKEEPING_ISSUE_REPORTED', entityType: 'HousekeepingTask', entityId: taskId, after: { hotelId: task.hotelId, roomId: task.roomId, roomNumber: task.room.roomNumber, note, maintenanceTicketId: ticket.id } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: existing ? 'MAINTENANCE_TICKET_UPDATED_FROM_HOUSEKEEPING' : 'MAINTENANCE_TICKET_CREATED', entityType: 'MaintenanceTicket', entityId: ticket.id, after: { ticketId: ticket.id, hotelId: task.hotelId, roomId: task.roomId, source: 'HOUSEKEEPING', housekeepingTaskId: task.id } } });
      return { ...this.taskView(updated), maintenanceTicketId: ticket.id };
    });
  }

  async assign(adminUserId: string, taskId: string, body: HousekeepingAssignDto) {
    const admin = await this.p.user.findUnique({ where: { id: adminUserId }, select: { id: true, role: true, staffHotelId: true } });
    if (!admin || !MANAGEMENT_ROLES.includes(admin.role)) throw new ForbiddenException('Management permission is required.');
    const task = await this.p.housekeepingTask.findUnique({ where: { id: taskId }, select: { id: true, hotelId: true, roomId: true, status: true } });
    if (!task || (admin.staffHotelId && task.hotelId !== admin.staffHotelId)) throw new NotFoundException('Housekeeping task not found.');
    if (task.status !== HousekeepingTaskStatus.PENDING && task.status !== HousekeepingTaskStatus.ACCEPTED) throw new ConflictException('Only pending or accepted tasks can be assigned.');
    const staff = await this.p.user.findUnique({ where: { id: body.staffUserId }, select: { id: true, name: true, role: true, active: true, staffDepartment: true, staffHotelId: true, staffHotel: { select: { active: true } } } });
    if (!staff || !staff.active || staff.role !== UserRole.SERVICE_STAFF || staff.staffDepartment !== StaffDepartment.HOUSEKEEPING || staff.staffHotelId !== task.hotelId || !staff.staffHotel?.active) throw new BadRequestException('Selected housekeeping staff member is not assigned to this hotel.');
    const updated = await this.p.housekeepingTask.update({ where: { id: taskId }, data: { assignedToId: staff.id, status: HousekeepingTaskStatus.ACCEPTED, acceptedAt: new Date() }, include: taskInclude });
    await this.audit.log({ actorUserId: adminUserId, action: 'HOUSEKEEPING_TASK_ASSIGNED', entityType: 'HousekeepingTask', entityId: taskId, after: { taskId, hotelId: task.hotelId, roomId: task.roomId, assignedToId: staff.id, assignedToName: staff.name } });
    return this.taskView(updated);
  }

  async cancel(adminUserId: string, taskId: string, body: HousekeepingCancelDto) {
    const task = await this.p.housekeepingTask.findUnique({ where: { id: taskId }, select: { id: true, hotelId: true, roomId: true, status: true, room: { select: { status: true, roomNumber: true } } } });
    if (!task) throw new NotFoundException('Housekeeping task not found.');
    const admin = await this.p.user.findUnique({ where: { id: adminUserId }, select: { role: true, staffHotelId: true } });
    if (!admin || !MANAGEMENT_ROLES.includes(admin.role) || (admin.staffHotelId && admin.staffHotelId !== task.hotelId)) throw new ForbiddenException('Management permission is required.');
    if (task.status === HousekeepingTaskStatus.CLEANING) throw new ConflictException('Cleaning has already started. Complete the task or use an authorized room-status exception workflow.');
    if (task.status !== HousekeepingTaskStatus.PENDING && task.status !== HousekeepingTaskStatus.ACCEPTED) throw new ConflictException('Only pending or accepted housekeeping tasks can be cancelled.');
    if (task.room.status !== RoomOperationalStatus.DIRTY) throw new ConflictException(`Room ${task.room.roomNumber} is not dirty and cannot be cancelled safely.`);
    const updated = await this.p.housekeepingTask.update({ where: { id: taskId }, data: { status: HousekeepingTaskStatus.CANCELLED, note: body.note?.trim() || null }, include: taskInclude });
    await this.audit.log({ actorUserId: adminUserId, action: 'HOUSEKEEPING_TASK_CANCELLED', entityType: 'HousekeepingTask', entityId: taskId, before: { taskId, hotelId: task.hotelId, roomId: task.roomId, status: task.status }, after: { taskId, hotelId: task.hotelId, roomId: task.roomId, status: HousekeepingTaskStatus.CANCELLED, note: body.note?.trim() || null } });
    return this.taskView(updated);
  }

  async setManagementRoomStatus(adminUserId: string, roomId: string, body: HousekeepingRoomStatusDto) {
    return serializable(this.p, (tx) => this.setManagementRoomStatusInTransaction(tx, adminUserId, roomId, body.status));
  }

  async setManagementRoomStatusInTransaction(client: PrismaService | Prisma.TransactionClient, adminUserId: string, roomId: string, status: RoomOperationalStatus) {
    const admin = await client.user.findUnique({ where: { id: adminUserId }, select: { id: true, role: true, staffHotelId: true } });
    if (!admin || !MANAGEMENT_ROLES.includes(admin.role)) throw new ForbiddenException('Management permission is required.');
    const room = await client.room.findUnique({ where: { id: roomId }, select: { id: true, hotelId: true, roomNumber: true, status: true } });
    if (!room) throw new NotFoundException('Physical room not found.');
    this.assertAdminHotelScope(admin, room.hotelId);
    const updated = await this.hotels.updatePhysicalRoomWithClient(client, roomId, { status });
    if (status === RoomOperationalStatus.OUT_OF_ORDER || status === RoomOperationalStatus.AVAILABLE) await client.housekeepingTask.updateMany({ where: { roomId, status: { in: ACTIVE_TASK_STATUSES } }, data: { status: HousekeepingTaskStatus.CANCELLED, note: 'Cancelled by management room status change.' } });
    if (status === RoomOperationalStatus.DIRTY) await this.ensureTaskForDirtyRoom(client, roomId, adminUserId);
    await client.auditLog.create({ data: { actorUserId: adminUserId, action: 'HOUSEKEEPING_ROOM_STATUS_CHANGED', entityType: 'Room', entityId: roomId, after: { roomId, status } } });
    return updated;
  }

  async history(adminUserId: string, roomId: string) {
    const task = await this.p.room.findUnique({ where: { id: roomId }, select: { hotelId: true } });
    if (!task) throw new NotFoundException('Physical room not found.');
    const admin = await this.managementUser(adminUserId);
    this.assertAdminHotelScope(admin, task.hotelId);
    return this.p.housekeepingTask.findMany({ where: { roomId }, orderBy: { createdAt: 'desc' }, include: taskInclude });
  }
}

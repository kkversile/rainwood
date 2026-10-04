import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { OperationsLogCategory, OperationsLogPriority, OperationsLogStatus, Prisma, StaffDepartment, UserRole } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { hotelLocalDateTimeToUtc } from '../../common/hotel-dates';
import { getCurrentHotelBusinessDate } from '../../common/hotel-business-day';
import { parseDateOnly, toDateOnly } from '../../common/dates';
import { PrismaService } from '../../common/prisma.service';
import { getActorScope, resolveRequestedHotel, type ActorScope } from '../../common/role-scope';
import { OperationsLogCreateDto, OperationsLogListQueryDto, OperationsLogResolveDto, OperationsLogUpdateDto, OperationsLogUpdateNoteDto } from './operations-logbook.dto';

const MANAGEMENT_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.RESERVATION];
const READ_ROLES: UserRole[] = [...MANAGEMENT_ROLES, UserRole.ACCOUNTS, UserRole.VIEWER, UserRole.SERVICE_STAFF];

@Injectable()
export class OperationsLogbookService {
  constructor(private readonly p: PrismaService, private readonly audit: AuditService) {}

  private async scope(userId: string) {
    const scope = await getActorScope(this.p, userId);
    if (!READ_ROLES.includes(scope.role)) throw new ForbiddenException('Operations logbook access is not available to this account.');
    // Accounts and Viewer are organization-wide roles by contract, but the
    // shared role scope intentionally leaves them without a staff hotel.
    // Adapt that scope only for this feature so hotel selection remains
    // available without broadening their application-wide permissions.
    if (scope.role === UserRole.ACCOUNTS || scope.role === UserRole.VIEWER) return { ...scope, isGlobal: true };
    return scope;
  }

  private async hotelFor(scope: ActorScope, requestedHotelId?: string | null) {
    const hotelId = resolveRequestedHotel(scope, requestedHotelId);
    if (!hotelId) throw new BadRequestException('hotelId is required for global operations users.');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, active: true, timezoneName: true } });
    if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private async businessDate(hotel: { id: string; timezoneName: string }, requested?: string) {
    const current = await getCurrentHotelBusinessDate(this.p, hotel.id, hotel.timezoneName);
    const date = requested ? parseDateOnly(requested, 'businessDate') : current;
    if (date.getTime() > current.getTime()) throw new BadRequestException('Future business dates are not available in the operations logbook.');
    return { date, current };
  }

  private include = {
    hotel: { select: { id: true, name: true, timezoneName: true } },
    createdBy: { select: { id: true, name: true, role: true } },
    assignedUser: { select: { id: true, name: true, role: true, staffDepartment: true } },
    acknowledgedBy: { select: { id: true, name: true } },
    resolvedBy: { select: { id: true, name: true } },
    reservation: { select: { id: true, reference: true, guestName: true, checkIn: true, checkOut: true } },
    guestProfile: { select: { id: true, displayName: true, vipLevel: true } },
    room: { select: { id: true, roomNumber: true, floor: true, wing: true } },
    maintenanceTicket: { select: { id: true, title: true, status: true } },
    housekeepingTask: { select: { id: true, status: true, room: { select: { roomNumber: true } } } },
    updates: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { id: true, name: true } } } },
  } as const;

  private async visibleEntry(scope: ActorScope, id: string) {
    const row = await this.p.operationsLogEntry.findUnique({ where: { id }, include: this.include });
    if (!row || (scope.hotelId && row.hotelId !== scope.hotelId)) throw new NotFoundException('Operations log entry not found.');
    if (scope.role === UserRole.ACCOUNTS && row.category !== OperationsLogCategory.PAYMENT_FOLLOWUP) throw new NotFoundException('Operations log entry not found.');
    if (scope.role === UserRole.SERVICE_STAFF && row.assignedUserId !== scope.userId && row.assignedDepartment !== scope.staffDepartment) throw new ForbiddenException('This entry is outside your assigned operational scope.');
    return row;
  }

  private assertMutation(scope: ActorScope, row?: { category: OperationsLogCategory; assignedUserId?: string | null; assignedDepartment?: StaffDepartment | null }) {
    if (scope.role === UserRole.VIEWER) throw new ForbiddenException('Viewer accounts have read-only logbook access.');
    if (scope.role === UserRole.SERVICE_STAFF && row && row.assignedUserId !== scope.userId && row.assignedDepartment !== scope.staffDepartment) throw new ForbiddenException('This entry is outside your assigned operational scope.');
    if (scope.role === UserRole.ACCOUNTS && row && row.category !== OperationsLogCategory.PAYMENT_FOLLOWUP) throw new ForbiddenException('Accounts users may only manage payment follow-ups.');
  }

  private view(row: any, today: Date, timezoneName: string) {
    const businessDate = new Date(row.businessDate);
    const active = row.status !== OperationsLogStatus.RESOLVED;
    const carriedForward = active && businessDate.getTime() < today.getTime();
    const dueAt = row.dueAt ? new Date(row.dueAt) : null;
    const now = Date.now();
    const dueState = !dueAt ? null : dueAt.getTime() < now ? 'OVERDUE' : dueAt.getTime() <= now + 2 * 60 * 60 * 1000 ? 'DUE_SOON' : 'SCHEDULED';
    return { ...row, carriedForward, ageLabel: carriedForward ? 'Carried forward' : active ? 'Current business day' : 'Resolved history', dueState, dueLabel: dueAt ? dueAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezoneName }) : null, updates: row.updates ?? [] };
  }

  private serviceCategories(department?: string | null): OperationsLogCategory[] {
    const common = [OperationsLogCategory.GENERAL, OperationsLogCategory.GUEST_REQUEST, OperationsLogCategory.VIP, OperationsLogCategory.COMPLAINT];
    if (department === StaffDepartment.HOUSEKEEPING) return [...common, OperationsLogCategory.HOUSEKEEPING, OperationsLogCategory.ROOM];
    if (department === StaffDepartment.MAINTENANCE) return [...common, OperationsLogCategory.MAINTENANCE, OperationsLogCategory.ROOM];
    if (department === StaffDepartment.FRONT_OFFICE) return [...common, OperationsLogCategory.ARRIVAL, OperationsLogCategory.DEPARTURE, OperationsLogCategory.ROOM];
    return common;
  }

  private async baseWhere(scope: ActorScope, query: OperationsLogListQueryDto, hotel: { id: string; timezoneName: string }, handover = false) {
    const { date, current } = await this.businessDate(hotel, query.businessDate);
    const search = query.search?.trim();
    const where: Prisma.OperationsLogEntryWhereInput = {
      hotelId: hotel.id,
      ...(handover ? { businessDate: { lte: current }, status: query.status && query.status !== OperationsLogStatus.RESOLVED ? query.status : { in: [OperationsLogStatus.OPEN, OperationsLogStatus.ACKNOWLEDGED] } } : { businessDate: date, status: query.status }),
      priority: query.priority,
      category: query.category,
      assignedDepartment: query.assignedDepartment,
      assignedUserId: query.assignedUserId,
      roomId: query.roomId,
      reservationId: query.reservationId,
      ...(search ? { OR: [{ title: { contains: search, mode: 'insensitive' } }, { details: { contains: search, mode: 'insensitive' } }, { reservation: { reference: { contains: search, mode: 'insensitive' } } }, { reservation: { guestName: { contains: search, mode: 'insensitive' } } }, { guestProfile: { displayName: { contains: search, mode: 'insensitive' } } }, { room: { roomNumber: { contains: search, mode: 'insensitive' } } }] } : {}),
    };
    if (scope.role === UserRole.SERVICE_STAFF) where.AND = [{ OR: [{ assignedUserId: scope.userId }, ...(scope.staffDepartment ? [{ assignedDepartment: scope.staffDepartment as StaffDepartment }] : [])] }];
    if (scope.role === UserRole.ACCOUNTS) {
      if (query.category && query.category !== OperationsLogCategory.PAYMENT_FOLLOWUP) throw new ForbiddenException('Accounts users may only view payment follow-ups.');
      where.category = OperationsLogCategory.PAYMENT_FOLLOWUP;
    }
    if (scope.role === UserRole.SERVICE_STAFF) where.category = { in: this.serviceCategories(scope.staffDepartment) };
    return { where, date, current };
  }

  async list(userId: string, query: OperationsLogListQueryDto) {
    const scope = await this.scope(userId);
    const hotel = await this.hotelFor(scope, query.hotelId);
    const { where, date, current } = await this.baseWhere(scope, query, hotel);
    const page = Math.max(1, Number(query.page || 1)); const limit = Math.min(100, Math.max(1, Number(query.limit || 25)));
    const allStatuses: Prisma.OperationsLogEntryWhereInput = { ...where, status: undefined };
    const [items, total, open, acknowledged, resolved, urgent, overdue, dueSoon, scheduled] = await Promise.all([
      this.p.operationsLogEntry.findMany({ where, include: this.include, orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.p.operationsLogEntry.count({ where }),
      this.p.operationsLogEntry.count({ where: { ...allStatuses, status: OperationsLogStatus.OPEN } }),
      this.p.operationsLogEntry.count({ where: { ...allStatuses, status: OperationsLogStatus.ACKNOWLEDGED } }),
      this.p.operationsLogEntry.count({ where: { ...allStatuses, status: OperationsLogStatus.RESOLVED } }),
      this.p.operationsLogEntry.count({ where: { ...allStatuses, priority: OperationsLogPriority.URGENT, status: { not: OperationsLogStatus.RESOLVED } } }),
      this.p.operationsLogEntry.count({ where: { ...allStatuses, dueAt: { lt: new Date() }, status: { not: OperationsLogStatus.RESOLVED } } }),
      this.p.operationsLogEntry.count({ where: { ...allStatuses, dueAt: { gte: new Date(), lte: new Date(Date.now() + 2 * 60 * 60 * 1000) }, status: { not: OperationsLogStatus.RESOLVED } } }),
      this.p.operationsLogEntry.count({ where: { ...allStatuses, dueAt: { gt: new Date(Date.now() + 2 * 60 * 60 * 1000) }, status: { not: OperationsLogStatus.RESOLVED } } }),
    ]);
    return { hotel, businessDate: toDateOnly(date), currentBusinessDate: toDateOnly(current), items: items.map((item) => this.view(item, current, hotel.timezoneName)), pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) }, summary: { open, acknowledged, resolved, urgent, overdue, dueSoon, scheduled, due: overdue + dueSoon + scheduled } };
  }

  async handover(userId: string, query: OperationsLogListQueryDto) {
    const scope = await this.scope(userId); const hotel = await this.hotelFor(scope, query.hotelId); const { where, current } = await this.baseWhere(scope, query, hotel, true);
    const page = Math.max(1, Number(query.page || 1)); const limit = Math.min(100, Math.max(1, Number(query.limit || 100))); const now = new Date(); const dueSoonAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const [rows, totalActive, open, acknowledged, urgent, overdue, dueSoon, scheduled] = await Promise.all([
      this.p.operationsLogEntry.findMany({ where, include: this.include, orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }, { createdAt: 'asc' }], skip: Math.max(0, Number(query.page || 1) - 1) * limit, take: limit }),
      this.p.operationsLogEntry.count({ where }),
      this.p.operationsLogEntry.count({ where: { ...where, status: OperationsLogStatus.OPEN } }),
      this.p.operationsLogEntry.count({ where: { ...where, status: OperationsLogStatus.ACKNOWLEDGED } }),
      this.p.operationsLogEntry.count({ where: { ...where, priority: OperationsLogPriority.URGENT } }),
      this.p.operationsLogEntry.count({ where: { ...where, dueAt: { lt: now } } }),
      this.p.operationsLogEntry.count({ where: { ...where, dueAt: { gte: now, lte: dueSoonAt } } }),
      this.p.operationsLogEntry.count({ where: { ...where, dueAt: { gt: dueSoonAt } } }),
    ]);
    const items = rows.map((item) => this.view(item, current, hotel.timezoneName));
    const summary = {
      open,
      acknowledged,
      resolved: 0,
      urgent,
      overdue,
      dueSoon,
      scheduled,
      due: overdue + dueSoon + scheduled,
    };
    const result = { hotel, businessDate: toDateOnly(current), currentBusinessDate: toDateOnly(current), items, pagination: { page, limit, total: totalActive, pages: Math.max(1, Math.ceil(totalActive / limit)) }, summary, handoverPagination: { totalActive, returnedActive: items.length, hasMore: page * limit < totalActive, hasPrevious: page > 1, limit } };
    const active = items.filter((item: any) => item.status !== OperationsLogStatus.RESOLVED);
    const groups: Record<string, any[]> = { urgent: [], important: [], arrivals: [], departures: [], guestFollowUps: [], rooms: [], housekeeping: [], maintenance: [], finance: [], general: [] };
    for (const item of active) {
      if (item.priority === OperationsLogPriority.URGENT) groups.urgent.push(item);
      else if (item.priority === OperationsLogPriority.IMPORTANT) groups.important.push(item);
      else {
        const key = item.category === OperationsLogCategory.ARRIVAL ? 'arrivals' : item.category === OperationsLogCategory.DEPARTURE ? 'departures' : [OperationsLogCategory.GUEST_REQUEST, OperationsLogCategory.VIP, OperationsLogCategory.COMPLAINT].includes(item.category) ? 'guestFollowUps' : item.category === OperationsLogCategory.ROOM ? 'rooms' : item.category === OperationsLogCategory.HOUSEKEEPING ? 'housekeeping' : item.category === OperationsLogCategory.MAINTENANCE ? 'maintenance' : item.category === OperationsLogCategory.PAYMENT_FOLLOWUP ? 'finance' : 'general';
        groups[key].push(item);
      }
    }
    return { ...result, groups };
  }

  async detail(userId: string, id: string) { const scope = await this.scope(userId); const row = await this.visibleEntry(scope, id); const hotel = await this.hotelFor(scope, row.hotelId); const current = await getCurrentHotelBusinessDate(this.p, hotel.id, hotel.timezoneName); return this.view(row, current, hotel.timezoneName); }

  private async validateLinks(scope: ActorScope, hotelId: string, body: OperationsLogCreateDto) {
    const checks = [
      body.reservationId ? this.p.reservation.findFirst({ where: { id: body.reservationId, hotelId }, select: { id: true } }) : null,
      body.guestProfileId ? this.p.guestProfile.findFirst({ where: { id: body.guestProfileId, OR: [{ preferredHotelId: hotelId }, { reservations: { some: { hotelId } } }] }, select: { id: true } }) : null,
      body.roomId ? this.p.room.findFirst({ where: { id: body.roomId, hotelId }, select: { id: true } }) : null,
      body.maintenanceTicketId ? this.p.maintenanceTicket.findFirst({ where: { id: body.maintenanceTicketId, hotelId }, select: { id: true } }) : null,
      body.housekeepingTaskId ? this.p.housekeepingTask.findFirst({ where: { id: body.housekeepingTaskId, hotelId }, select: { id: true } }) : null,
    ];
    const results = await Promise.all(checks);
    if (results.some((item) => item === null ? false : !item)) throw new BadRequestException('One or more linked operational records do not belong to this hotel.');
    if (body.assignedUserId) {
      const assigned = await this.p.user.findFirst({ where: { id: body.assignedUserId, active: true, staffHotelId: hotelId, role: { not: UserRole.AGENT } }, select: { id: true, role: true, staffDepartment: true } });
      if (!assigned) throw new BadRequestException('Assigned user is not available at this hotel.');
      if (scope.role === UserRole.SERVICE_STAFF && assigned.id !== scope.userId) throw new ForbiddenException('Service staff may only assign entries to themselves.');
      if (assigned.role === UserRole.SERVICE_STAFF && body.assignedDepartment && assigned.staffDepartment !== body.assignedDepartment) throw new BadRequestException('Assigned service staff department does not match the entry department.');
    }
  }

  async create(userId: string, body: OperationsLogCreateDto) {
    const scope = await this.scope(userId);
    if (scope.role === UserRole.SERVICE_STAFF && body.assignedDepartment && body.assignedDepartment !== scope.staffDepartment) throw new ForbiddenException('Service staff may only use their own department.');
    if (scope.role === UserRole.SERVICE_STAFF && body.assignedUserId && body.assignedUserId !== scope.userId) throw new ForbiddenException('Service staff may only assign entries to themselves.');
    const assignedDepartment = scope.role === UserRole.SERVICE_STAFF ? scope.staffDepartment as StaffDepartment : body.assignedDepartment;
    this.assertMutation(scope, { category: body.category, assignedUserId: body.assignedUserId, assignedDepartment });
    if (scope.role === UserRole.SERVICE_STAFF && !this.serviceCategories(scope.staffDepartment).includes(body.category)) throw new ForbiddenException('This category is outside your assigned operational scope.');
    if (scope.role === UserRole.ACCOUNTS && body.category !== OperationsLogCategory.PAYMENT_FOLLOWUP) throw new ForbiddenException('Accounts users may only create payment follow-ups.');
    const hotel = await this.hotelFor(scope, body.hotelId); const { date: businessDate, current } = await this.businessDate(hotel, body.businessDate); await this.validateLinks(scope, hotel.id, body);
    const row = await this.p.operationsLogEntry.create({ data: { hotelId: hotel.id, businessDate, category: body.category, priority: body.priority ?? OperationsLogPriority.NORMAL, title: body.title.trim(), details: body.details.trim(), createdByUserId: userId, assignedDepartment: assignedDepartment || undefined, assignedUserId: body.assignedUserId || null, dueAt: body.dueAt ? hotelLocalDateTimeToUtc(body.dueAt, hotel.timezoneName) : null, reservationId: body.reservationId || null, guestProfileId: body.guestProfileId || null, roomId: body.roomId || null, maintenanceTicketId: body.maintenanceTicketId || null, housekeepingTaskId: body.housekeepingTaskId || null }, include: this.include });
    await this.audit.log({ actorUserId: userId, action: 'OPERATIONS_LOG_CREATED', entityType: 'OperationsLogEntry', entityId: row.id, after: { hotelId: hotel.id, businessDate: businessDate.toISOString().slice(0, 10), category: row.category, priority: row.priority } });
    return this.view(row, current, hotel.timezoneName);
  }

  async update(userId: string, id: string, body: OperationsLogUpdateDto) {
    const scope = await this.scope(userId); const current = await this.visibleEntry(scope, id); this.assertMutation(scope, current); if (current.status === OperationsLogStatus.RESOLVED && !MANAGEMENT_ROLES.includes(scope.role)) throw new ConflictException('Resolved entries are read-only for this role.');
    if (scope.role === UserRole.ACCOUNTS && body.category && body.category !== OperationsLogCategory.PAYMENT_FOLLOWUP) throw new ForbiddenException('Accounts users may only manage payment follow-ups.');
    if (scope.role === UserRole.SERVICE_STAFF && (body.category !== undefined || body.assignedDepartment !== undefined || body.assignedUserId !== undefined)) throw new ForbiddenException('Service staff cannot reassign or recategorize logbook entries.');
    const hotel = await this.hotelFor(scope, current.hotelId);
    if (body.assignedUserId) {
      const assigned = await this.p.user.findFirst({ where: { id: body.assignedUserId, active: true, staffHotelId: current.hotelId, role: { not: UserRole.AGENT } }, select: { id: true, role: true, staffDepartment: true } });
      if (!assigned) throw new BadRequestException('Assigned user is not available at this hotel.');
      if (assigned.role === UserRole.SERVICE_STAFF && body.assignedDepartment && assigned.staffDepartment !== body.assignedDepartment) throw new BadRequestException('Assigned service staff department does not match the entry department.');
    }
    const row = await this.p.operationsLogEntry.update({ where: { id }, data: { category: body.category, priority: body.priority, title: body.title?.trim(), details: body.details?.trim(), assignedDepartment: body.assignedDepartment === null ? null : body.assignedDepartment, assignedUserId: body.assignedUserId === null ? null : body.assignedUserId, dueAt: body.dueAt === null ? null : body.dueAt ? hotelLocalDateTimeToUtc(body.dueAt, hotel.timezoneName) : undefined }, include: this.include });
    const currentBusinessDate = await getCurrentHotelBusinessDate(this.p, hotel.id, hotel.timezoneName);
    await this.audit.log({ actorUserId: userId, action: 'OPERATIONS_LOG_UPDATED', entityType: 'OperationsLogEntry', entityId: id, after: { fields: Object.keys(body) } }); return this.view(row, currentBusinessDate, hotel.timezoneName);
  }

  async acknowledge(userId: string, id: string) { const scope = await this.scope(userId); const current = await this.visibleEntry(scope, id); this.assertMutation(scope, current); if (current.status === OperationsLogStatus.RESOLVED) throw new ConflictException('Resolved entries cannot be acknowledged.'); if (current.status === OperationsLogStatus.ACKNOWLEDGED) return current; const row = await this.p.operationsLogEntry.update({ where: { id }, data: { status: OperationsLogStatus.ACKNOWLEDGED, acknowledgedAt: new Date(), acknowledgedByUserId: userId }, include: this.include }); await this.audit.log({ actorUserId: userId, action: 'OPERATIONS_LOG_ACKNOWLEDGED', entityType: 'OperationsLogEntry', entityId: id }); return row; }

  async resolve(userId: string, id: string, body: OperationsLogResolveDto) { const scope = await this.scope(userId); const current = await this.visibleEntry(scope, id); this.assertMutation(scope, current); if (current.status === OperationsLogStatus.RESOLVED) return current; const row = await this.p.operationsLogEntry.update({ where: { id }, data: { status: OperationsLogStatus.RESOLVED, resolvedAt: new Date(), resolvedByUserId: userId, resolutionNote: body.resolutionNote.trim() }, include: this.include }); await this.audit.log({ actorUserId: userId, action: 'OPERATIONS_LOG_RESOLVED', entityType: 'OperationsLogEntry', entityId: id, after: { resolutionNote: body.resolutionNote.trim() } }); return row; }

  async addUpdate(userId: string, id: string, body: OperationsLogUpdateNoteDto) { const scope = await this.scope(userId); const current = await this.visibleEntry(scope, id); this.assertMutation(scope, current); if (current.status === OperationsLogStatus.RESOLVED && !MANAGEMENT_ROLES.includes(scope.role)) throw new ConflictException('Resolved entries cannot receive updates for this role.'); const update = await this.p.operationsLogUpdate.create({ data: { logEntryId: id, authorUserId: userId, note: body.note.trim() }, include: { author: { select: { id: true, name: true } } } }); await this.audit.log({ actorUserId: userId, action: 'OPERATIONS_LOG_UPDATE_ADDED', entityType: 'OperationsLogEntry', entityId: id, after: { updateId: update.id } }); return update; }

  async options(userId: string, requestedHotelId?: string, reservationRef?: string) {
    const scope = await this.scope(userId);
    const hotel = await this.hotelFor(scope, requestedHotelId);
    if (scope.role === UserRole.VIEWER) return { hotel, users: [], reservations: [], rooms: [], maintenanceTickets: [], housekeepingTasks: [], guests: [] };

    const includeMaintenance = scope.role !== UserRole.ACCOUNTS && (scope.role !== UserRole.SERVICE_STAFF || scope.staffDepartment === StaffDepartment.MAINTENANCE);
    const includeHousekeeping = scope.role !== UserRole.ACCOUNTS && (scope.role !== UserRole.SERVICE_STAFF || scope.staffDepartment === StaffDepartment.HOUSEKEEPING);
    const includeUsers = MANAGEMENT_ROLES.includes(scope.role);
    const [users, reservations, rooms, maintenanceTickets, housekeepingTasks, guests, requestedReservation] = await Promise.all([
      includeUsers ? this.p.user.findMany({ where: { active: true, staffHotelId: hotel.id, role: { notIn: [UserRole.AGENT] } }, select: { id: true, name: true, role: true, staffDepartment: true }, orderBy: { name: 'asc' }, take: 100 }) : Promise.resolve([]),
      this.p.reservation.findMany({ where: { hotelId: hotel.id, status: { not: 'CANCELLED' } }, select: { id: true, reference: true, guestName: true }, orderBy: { createdAt: 'desc' }, take: 100 }),
      this.p.room.findMany({ where: { hotelId: hotel.id, active: true }, select: { id: true, roomNumber: true }, orderBy: { roomNumber: 'asc' }, take: 100 }),
      includeMaintenance ? this.p.maintenanceTicket.findMany({ where: { hotelId: hotel.id, status: { not: 'RESOLVED' } }, select: { id: true, title: true, room: { select: { roomNumber: true } } }, orderBy: { reportedAt: 'desc' }, take: 100 }) : Promise.resolve([]),
      includeHousekeeping ? this.p.housekeepingTask.findMany({ where: { hotelId: hotel.id, status: { in: ['PENDING', 'ACCEPTED', 'CLEANING'] } }, select: { id: true, status: true, room: { select: { roomNumber: true } } }, orderBy: { createdAt: 'desc' }, take: 100 }) : Promise.resolve([]),
      this.p.guestProfile.findMany({ where: { OR: [{ preferredHotelId: hotel.id }, { reservations: { some: { hotelId: hotel.id } } }] }, select: { id: true, displayName: true }, orderBy: { displayName: 'asc' }, take: 100 }),
      reservationRef ? this.p.reservation.findFirst({ where: { hotelId: hotel.id, reference: reservationRef.trim(), status: { not: 'CANCELLED' } }, select: { id: true, reference: true, guestName: true } }) : Promise.resolve(null),
    ]);
    const reservationOptions = requestedReservation && !reservations.some((item) => item.id === requestedReservation.id) ? [requestedReservation, ...reservations] : reservations;
    return { hotel, users, reservations: reservationOptions, rooms, maintenanceTickets, housekeepingTasks, guests };
  }
}

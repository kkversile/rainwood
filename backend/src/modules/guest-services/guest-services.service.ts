import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolioChargeCategory, GuestServiceOrderStatus, LostFoundStatus, LostFoundType, Prisma, ServiceItemType, StaffDepartment, UserRole } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { getHotelBusinessDayUtcRange, getHotelOperationalDate } from '../../common/hotel-dates';
import { parseDateOnly } from '../../common/dates';
import { assertActorCanManageHotel, getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { PrismaService } from '../../common/prisma.service';
import { nextDocumentNumber } from '../../common/document-sequences';
import { LostFoundCreateDto, LostFoundDisposeDto, LostFoundMatchDto, LostFoundQueryDto, LostFoundReturnDto, ServiceItemCreateDto, ServiceItemQueryDto, ServiceItemUpdateDto, ServiceOrderCreateDto, ServiceOrderQueryDto } from './guest-services.dto';

const money = (value: unknown) => Number(value ?? 0);
const round = (value: number) => Math.round(value * 100) / 100;
const MANAGEMENT = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN];
const STAFF = [UserRole.SERVICE_STAFF];

@Injectable()
export class GuestServicesService {
  constructor(private readonly p: PrismaService, private readonly audit: AuditService) {}

  private async scope(userId: string, roles: UserRole[] = MANAGEMENT) { const scope = await getActorScope(this.p, userId); if (!roles.includes(scope.role)) throw new ForbiddenException('This account cannot access guest service operations.'); return scope; }
  private itemView(item: any) { return { ...item, unitPrice: money(item.unitPrice), taxRate: money(item.taxRate), hotel: item.hotel ? { id: item.hotel.id, name: item.hotel.name } : undefined }; }
  private orderView(order: any) { return { ...order, subtotalAmount: money(order.subtotalAmount), taxAmount: money(order.taxAmount), totalAmount: money(order.totalAmount), lines: (order.lines ?? []).map((line: any) => ({ ...line, quantity: money(line.quantity), unitPriceSnapshot: money(line.unitPriceSnapshot), taxRateSnapshot: money(line.taxRateSnapshot), taxableAmount: money(line.taxableAmount), taxAmount: money(line.taxAmount), lineTotal: money(line.lineTotal), serviceItem: line.serviceItem ? { id: line.serviceItem.id, name: line.serviceItem.name, type: line.serviceItem.type } : undefined })), room: order.roomAssignment?.room ? { id: order.roomAssignment.room.id, roomNumber: order.roomAssignment.room.roomNumber } : null }; }

  async listItems(userId: string, query: ServiceItemQueryDto, allowStaff = false) {
    const scope = await this.scope(userId, allowStaff ? [...MANAGEMENT, ...STAFF] : MANAGEMENT);
    const hotelId = resolveRequestedHotel(scope, query.hotelId);
    const staffTypes = allowStaff && scope.role === UserRole.SERVICE_STAFF && scope.staffDepartment
      ? ([ServiceItemType.FOOD, ServiceItemType.BEVERAGE, ServiceItemType.ROOM_SERVICE, ServiceItemType.LAUNDRY]
        .filter((type) => this.allowedTypes(scope.staffDepartment as StaffDepartment, type)) as ServiceItemType[])
      : undefined;
    if (allowStaff && scope.role === UserRole.SERVICE_STAFF && !staffTypes?.length) return [];
    if (allowStaff && scope.role === UserRole.SERVICE_STAFF && query.type && !staffTypes?.includes(query.type)) return [];
    const rows = await this.p.serviceItem.findMany({ where: { hotelId: hotelId ?? undefined, type: query.type ? query.type : staffTypes ? { in: staffTypes } : undefined, active: query.active ?? undefined }, include: { hotel: { select: { id: true, name: true } } }, orderBy: [{ active: 'desc' }, { type: 'asc' }, { name: 'asc' }] });
    return rows.map((row) => this.itemView(row));
  }
  async createItem(userId: string, body: ServiceItemCreateDto) { await assertActorCanManageHotel(this.p, userId, body.hotelId); const name = body.name.trim(); if (name.length < 2) throw new BadRequestException('Service item name is required.'); const row = await this.p.serviceItem.create({ data: { hotelId: body.hotelId, type: body.type, code: body.code?.trim() || null, name, description: body.description?.trim() || null, unitPrice: round(body.unitPrice), taxRate: round(body.taxRate ?? 0), active: body.active ?? true }, include: { hotel: { select: { id: true, name: true } } } }); await this.audit.log({ actorUserId: userId, action: 'SERVICE_ITEM_CREATED', entityType: 'ServiceItem', entityId: row.id, after: { hotelId: row.hotelId, type: row.type, name: row.name } }); return this.itemView(row); }
  async updateItem(userId: string, id: string, body: ServiceItemUpdateDto) { const current = await this.p.serviceItem.findUnique({ where: { id } }); if (!current) throw new NotFoundException('Service item not found.'); await assertActorCanManageHotel(this.p, userId, current.hotelId); const row = await this.p.serviceItem.update({ where: { id }, data: { type: body.type, code: body.code === undefined ? undefined : body.code?.trim() || null, name: body.name?.trim(), description: body.description === undefined ? undefined : body.description?.trim() || null, unitPrice: body.unitPrice === undefined ? undefined : round(body.unitPrice), taxRate: body.taxRate === undefined ? undefined : round(body.taxRate), active: body.active }, include: { hotel: { select: { id: true, name: true } } } }); await this.audit.log({ actorUserId: userId, action: 'SERVICE_ITEM_UPDATED', entityType: 'ServiceItem', entityId: id, after: { fields: Object.keys(body) } }); return this.itemView(row); }

  private allowedTypes(department: StaffDepartment, type: ServiceItemType) { if (department === StaffDepartment.FOOD_BEVERAGE) return ([ServiceItemType.FOOD, ServiceItemType.BEVERAGE, ServiceItemType.ROOM_SERVICE] as ServiceItemType[]).includes(type); if (department === StaffDepartment.ROOM_SERVICE) return ([ServiceItemType.FOOD, ServiceItemType.BEVERAGE, ServiceItemType.ROOM_SERVICE] as ServiceItemType[]).includes(type); if (department === StaffDepartment.HOUSEKEEPING) return type === ServiceItemType.LAUNDRY; return false; }
  private category(department: StaffDepartment) { return department === StaffDepartment.HOUSEKEEPING ? FolioChargeCategory.LAUNDRY : department === StaffDepartment.ROOM_SERVICE ? FolioChargeCategory.ROOM_SERVICE : FolioChargeCategory.FOOD_AND_BEVERAGE; }
  private async assertStaff(userId: string) { const scope = await this.scope(userId, STAFF); if (!scope.hotelId || !scope.staffDepartment) throw new ForbiddenException('Service staff must have a department and hotel.'); return scope; }

  async createOrder(userId: string, reference: string, body: ServiceOrderCreateDto) {
    const scope = await this.assertStaff(userId); const department = scope.staffDepartment as StaffDepartment;
    if (body.department !== department || !([StaffDepartment.FOOD_BEVERAGE, StaffDepartment.ROOM_SERVICE, StaffDepartment.HOUSEKEEPING] as StaffDepartment[]).includes(department)) throw new ForbiddenException('Your department cannot post this service order.');
    return this.p.$transaction(async (tx) => {
      const existing = await tx.guestServiceOrder.findUnique({ where: { idempotencyKey: body.idempotencyKey }, include: { reservation: { select: { reference: true } }, lines: { include: { serviceItem: true } }, roomAssignment: { include: { room: true } } } });
      if (existing) { if (existing.reservationId !== reference && existing.reservation?.reference !== reference) throw new ConflictException('This idempotency key belongs to another order.'); return this.orderView(existing); }
      const reservation = await tx.reservation.findUnique({ where: { reference }, include: { roomAssignments: { where: { unassignedAt: null }, include: { room: true }, orderBy: { assignedAt: 'asc' } }, hotel: { select: { id: true, timezoneName: true } } } });
      if (!reservation || reservation.hotelId !== scope.hotelId) throw new NotFoundException('Checked-in guest not found.');
      if (reservation.stayStatus !== 'CHECKED_IN' || !reservation.roomAssignments.length) throw new BadRequestException('Service posting requires a checked-in guest with an active room assignment.');
      const assignment = body.roomAssignmentId ? reservation.roomAssignments.find((row) => row.id === body.roomAssignmentId) : reservation.roomAssignments[0];
      if (!assignment) throw new BadRequestException('The selected room is not an active room for this stay.');
      if (!body.lines.length) throw new BadRequestException('At least one service item is required.');
      const itemIds = [...new Set(body.lines.map((line) => line.serviceItemId))];
      const items = await tx.serviceItem.findMany({ where: { id: { in: itemIds }, hotelId: reservation.hotelId, active: true } });
      if (items.length !== itemIds.length) throw new BadRequestException('One or more service items are unavailable for this hotel.');
      const itemMap = new Map(items.map((item) => [item.id, item]));
      const lines = body.lines.map((input) => { const item = itemMap.get(input.serviceItemId)!; if (!this.allowedTypes(department, item.type)) throw new ForbiddenException('Your department cannot post one of the selected service items.'); const quantity = round(Number(input.quantity)); const unit = round(money(item.unitPrice)); const taxable = round(quantity * unit); const tax = round(taxable * money(item.taxRate) / 100); return { serviceItemId: item.id, descriptionSnapshot: item.name, quantity, unitPriceSnapshot: unit, taxRateSnapshot: money(item.taxRate), taxableAmount: taxable, taxAmount: tax, lineTotal: round(taxable + tax) }; });
      const subtotalAmount = round(lines.reduce((sum, line) => sum + line.taxableAmount, 0)); const taxAmount = round(lines.reduce((sum, line) => sum + line.taxAmount, 0)); const totalAmount = round(subtotalAmount + taxAmount); const year = Number(getHotelOperationalDate(reservation.hotel.timezoneName).toISOString().slice(0, 4)); const orderNo = await nextDocumentNumber(tx, reservation.hotelId, 'SERVICE_ORDER', year, department === StaffDepartment.HOUSEKEEPING ? 'LND' : 'FNB');
      const order = await tx.guestServiceOrder.create({ data: { hotelId: reservation.hotelId, reservationId: reservation.id, roomAssignmentId: assignment.id, department, orderNo, status: GuestServiceOrderStatus.POSTED, postedById: userId, postedAt: new Date(), subtotalAmount, taxAmount, totalAmount, idempotencyKey: body.idempotencyKey, lines: { create: lines } }, include: { lines: { include: { serviceItem: true } }, roomAssignment: { include: { room: true } } } });
      const charge = await tx.reservationFolioCharge.create({ data: { reservationId: reservation.id, category: this.category(department), description: `${department === StaffDepartment.HOUSEKEEPING ? 'Laundry' : 'F&B'} Order ${orderNo}`, quantity: 1, unitAmount: totalAmount, taxableAmount: subtotalAmount, taxAmount, totalAmount, postingDate: getHotelOperationalDate(reservation.hotel.timezoneName), note: `Structured service order ${orderNo}`, postedById: userId, idempotencyKey: `SERVICE_ORDER:${body.idempotencyKey}` } });
      const linked = await tx.guestServiceOrder.update({ where: { id: order.id }, data: { folioChargeId: charge.id }, include: { lines: { include: { serviceItem: true } }, roomAssignment: { include: { room: true } } } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'SERVICE_ORDER_POSTED', entityType: 'GuestServiceOrder', entityId: order.id, after: { orderNo, reservationId: reservation.id, hotelId: reservation.hotelId, folioChargeId: charge.id, totalAmount } } }); return this.orderView(linked);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async listOrders(userId: string, query: ServiceOrderQueryDto) { const scope = await this.scope(userId, [...MANAGEMENT, UserRole.RESERVATION, UserRole.ACCOUNTS]); const hotelId = resolveRequestedHotel(scope, query.hotelId); const where: any = { hotelId: hotelId ?? undefined, department: query.department, status: query.status, createdAt: { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(`${query.to}T23:59:59.999Z`) : undefined } }; const rows = await this.p.guestServiceOrder.findMany({ where, include: { hotel: { select: { id: true, name: true } }, reservation: { select: { reference: true, guestName: true } }, roomAssignment: { include: { room: { select: { id: true, roomNumber: true } } } }, lines: { include: { serviceItem: { select: { id: true, name: true, type: true } } } }, folioCharge: { select: { id: true, status: true } } }, orderBy: { createdAt: 'desc' } }); return rows.map((row) => this.orderView(row)); }
  async serviceRevenueReport(userId: string, query: ServiceOrderQueryDto) { const orders = await this.listOrders(userId, { ...query, status: GuestServiceOrderStatus.POSTED }); const byDepartment: Record<string, number> = {}; const byItem: Record<string, number> = {}; for (const order of orders) { byDepartment[order.department] = round((byDepartment[order.department] ?? 0) + order.totalAmount); for (const line of order.lines) byItem[line.serviceItem?.name ?? line.descriptionSnapshot] = round((byItem[line.serviceItem?.name ?? line.descriptionSnapshot] ?? 0) + line.lineTotal); } return { orders, totals: { total: round(orders.reduce((sum, order) => sum + order.totalAmount, 0)), byDepartment, byItem } }; }
  async getOrder(userId: string, id: string) { const scope = await this.scope(userId, [...MANAGEMENT, UserRole.RESERVATION, UserRole.ACCOUNTS]); const row = await this.p.guestServiceOrder.findUnique({ where: { id }, include: { hotel: true, reservation: { select: { reference: true, guestName: true } }, roomAssignment: { include: { room: true } }, lines: { include: { serviceItem: true } }, folioCharge: true } }); if (!row || (!scope.isGlobal && row.hotelId !== scope.hotelId)) throw new NotFoundException('Service order not found.'); return this.orderView(row); }
  async voidOrder(userId: string, id: string, reason: string) { const scope = await this.scope(userId, MANAGEMENT); if (!reason?.trim()) throw new BadRequestException('A void reason is required.'); return this.p.$transaction(async (tx) => { const row = await tx.guestServiceOrder.findUnique({ where: { id }, include: { folioCharge: true } }); if (!row || (!scope.isGlobal && row.hotelId !== scope.hotelId)) throw new NotFoundException('Service order not found.'); if (row.status !== GuestServiceOrderStatus.POSTED || !row.folioChargeId || !row.folioCharge) throw new ConflictException('Only a posted service order with a linked folio charge can be voided.'); await tx.reservationFolioCharge.update({ where: { id: row.folioChargeId }, data: { status: 'VOIDED', voidedAt: new Date(), voidedById: userId, voidReason: reason.trim() } }); const updated = await tx.guestServiceOrder.update({ where: { id }, data: { status: GuestServiceOrderStatus.VOIDED, voidedAt: new Date(), voidedById: userId, voidReason: reason.trim() }, include: { lines: { include: { serviceItem: true } }, roomAssignment: { include: { room: true } } } }); await tx.auditLog.create({ data: { actorUserId: userId, action: 'SERVICE_ORDER_VOIDED', entityType: 'GuestServiceOrder', entityId: id, after: { orderNo: row.orderNo, folioChargeId: row.folioChargeId, reason: reason.trim() } } }); return this.orderView(updated); }); }

  private lostView(row: any) { return { ...row, room: row.room ? { id: row.room.id, roomNumber: row.room.roomNumber } : null, reservation: row.reservation ? { id: row.reservation.id, reference: row.reservation.reference, guestName: row.reservation.guestName } : null, guestProfile: row.guestProfile ? { id: row.guestProfile.id, displayName: row.guestProfile.displayName, mobile: row.guestProfile.mobile } : null, reportedBy: row.reportedBy ? { id: row.reportedBy.id, name: row.reportedBy.name } : null, assignedTo: row.assignedTo ? { id: row.assignedTo.id, name: row.assignedTo.name } : null, returnedBy: row.returnedBy ? { id: row.returnedBy.id, name: row.returnedBy.name } : null, disposedBy: row.disposedBy ? { id: row.disposedBy.id, name: row.disposedBy.name } : null }; }
  private async lostScope(userId: string, roles: UserRole[]) { const scope = await this.scope(userId, roles); return scope; }
  private async assertLostHotel(scope: any, hotelId: string) {
    if (!scope.isGlobal && scope.hotelId !== hotelId) throw new ForbiddenException('You cannot access another hotel.');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, active: true, timezoneName: true } });
    if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private async validateLostReservation(hotelId: string, reservationId?: string, guestProfileId?: string) {
    if (!reservationId && !guestProfileId) return { reservation: null, guestProfile: null };
    const reservation = reservationId ? await this.p.reservation.findUnique({ where: { id: reservationId }, select: { id: true, hotelId: true, guestProfileId: true } }) : null;
    if (reservationId && (!reservation || reservation.hotelId !== hotelId)) throw new BadRequestException('The reservation does not belong to this hotel.');
    if (reservation && guestProfileId && reservation.guestProfileId !== guestProfileId) throw new BadRequestException('The reservation and guest profile do not refer to the same guest.');
    const guestProfile = guestProfileId ? await this.p.guestProfile.findUnique({ where: { id: guestProfileId }, select: { id: true } }) : null;
    if (guestProfileId && !guestProfile) throw new BadRequestException('Guest profile not found.');
    if (guestProfileId && !reservation) {
      const relationship = await this.p.reservation.findFirst({ where: { hotelId, guestProfileId }, select: { id: true } });
      if (!relationship) throw new BadRequestException('The guest has no reservation relationship with this hotel.');
    }
    return { reservation, guestProfile };
  }

  private async validateLostAssignee(hotelId: string, assignedToId?: string) {
    if (!assignedToId) return null;
    const assignee = await this.p.user.findUnique({ where: { id: assignedToId }, select: { id: true, active: true, role: true, staffHotelId: true } });
    const allowed: UserRole[] = [UserRole.ADMIN, UserRole.RESERVATION, UserRole.CORPORATE_ADMIN, UserRole.SUPER_ADMIN];
    const global: UserRole[] = [UserRole.CORPORATE_ADMIN, UserRole.SUPER_ADMIN];
    if (!assignee?.active || !allowed.includes(assignee.role) || (!global.includes(assignee.role) && assignee.staffHotelId !== hotelId)) throw new BadRequestException('The assignee is not an active authorized user for this hotel.');
    return assignee;
  }

  async listLost(userId: string, query: LostFoundQueryDto) {
    const scope = await this.lostScope(userId, [...MANAGEMENT, UserRole.RESERVATION]);
    if ((query.from || query.to) && !query.hotelId && scope.isGlobal) throw new BadRequestException('Select a hotel when filtering Lost & Found by operational date.');
    const hotelId = resolveRequestedHotel(scope, query.hotelId);
    let createdAt: any;
    if (query.from || query.to) {
      const hotel = await this.assertLostHotel({ ...scope, hotelId: hotelId ?? scope.hotelId }, hotelId!);
      const from = query.from ? getHotelBusinessDayUtcRange(parseDateOnly(query.from, 'from'), hotel.timezoneName).startUtc : undefined;
      const to = query.to ? getHotelBusinessDayUtcRange(parseDateOnly(query.to, 'to'), hotel.timezoneName).endUtc : undefined;
      createdAt = { gte: from, lt: to };
    }
    const rows = await this.p.lostFoundItem.findMany({ where: { hotelId: hotelId ?? undefined, type: query.type, status: query.status, roomId: query.roomId, createdAt, OR: query.search ? [{ reference: { contains: query.search, mode: 'insensitive' } }, { description: { contains: query.search, mode: 'insensitive' } }, { itemCategory: { contains: query.search, mode: 'insensitive' } }] : undefined }, include: { hotel: { select: { id: true, name: true } }, room: true, reservation: { select: { id: true, reference: true, guestName: true } }, guestProfile: { select: { id: true, displayName: true, mobile: true } }, reportedBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } }, returnedBy: { select: { id: true, name: true } }, disposedBy: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.lostView(row));
  }

  async reportLost(userId: string, body: LostFoundCreateDto) {
    const scope = await this.lostScope(userId, [...MANAGEMENT, UserRole.RESERVATION, UserRole.SERVICE_STAFF]);
    const hotel = await this.assertLostHotel(scope, body.hotelId);
    if (!scope.isGlobal && scope.hotelId !== body.hotelId) throw new ForbiddenException('You cannot report an item for another hotel.');
    if (scope.role === UserRole.SERVICE_STAFF && body.type !== LostFoundType.FOUND && body.type !== LostFoundType.LOST) throw new ForbiddenException('Invalid staff report type.');
    if (body.roomId) { const room = await this.p.room.findUnique({ where: { id: body.roomId }, select: { id: true, hotelId: true } }); if (!room || room.hotelId !== body.hotelId) throw new BadRequestException('The room does not belong to this hotel.'); }
    await this.validateLostReservation(body.hotelId, body.reservationId, body.guestProfileId);
    await this.validateLostAssignee(body.hotelId, body.assignedToId);
    const year = getHotelOperationalDate(hotel.timezoneName).getUTCFullYear();
    const reference = await nextDocumentNumber(this.p, body.hotelId, 'LOST_FOUND', year, body.type === LostFoundType.FOUND ? 'FND' : 'LST');
    const row = await this.p.lostFoundItem.create({ data: { hotelId: body.hotelId, reference, type: body.type, itemCategory: body.itemCategory.trim(), description: body.description.trim(), roomId: body.roomId, reservationId: body.reservationId, guestProfileId: body.guestProfileId, locationFound: body.locationFound?.trim(), foundAt: body.foundAt ? new Date(body.foundAt) : body.type === LostFoundType.FOUND ? new Date() : null, reportedById: userId, assignedToId: body.assignedToId, notes: body.notes?.trim() }, include: { hotel: { select: { id: true, name: true } }, room: true, reservation: { select: { id: true, reference: true, guestName: true } }, guestProfile: { select: { id: true, displayName: true, mobile: true } }, reportedBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } }, returnedBy: { select: { id: true, name: true } }, disposedBy: { select: { id: true, name: true } } } });
    await this.audit.log({ actorUserId: userId, action: 'LOST_FOUND_REPORTED', entityType: 'LostFoundItem', entityId: row.id, after: { reference, hotelId: row.hotelId, type: row.type, roomId: row.roomId } });
    return this.lostView(row);
  }

  async matchLost(userId: string, id: string, body: LostFoundMatchDto) {
    const scope = await this.lostScope(userId, [...MANAGEMENT, UserRole.RESERVATION]);
    const row = await this.p.lostFoundItem.findUnique({ where: { id } });
    if (!row || (!scope.isGlobal && row.hotelId !== scope.hotelId)) throw new NotFoundException('Lost & Found item not found.');
    if (row.status !== LostFoundStatus.OPEN) throw new ConflictException('Only open items can be matched.');
    if (!body.reservationId && !body.guestProfileId) throw new BadRequestException('Select a reservation or guest before matching.');
    await this.validateLostReservation(row.hotelId, body.reservationId, body.guestProfileId);
    await this.validateLostAssignee(row.hotelId, body.assignedToId ?? userId);
    const updated = await this.p.lostFoundItem.update({ where: { id }, data: { status: LostFoundStatus.MATCHED, reservationId: body.reservationId, guestProfileId: body.guestProfileId, assignedToId: body.assignedToId ?? userId, notes: body.notes?.trim() || undefined }, include: { hotel: { select: { id: true, name: true } }, room: true, reservation: { select: { id: true, reference: true, guestName: true } }, guestProfile: { select: { id: true, displayName: true, mobile: true } }, reportedBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } }, returnedBy: { select: { id: true, name: true } }, disposedBy: { select: { id: true, name: true } } } });
    await this.audit.log({ actorUserId: userId, action: 'LOST_FOUND_MATCHED', entityType: 'LostFoundItem', entityId: id, after: { reservationId: updated.reservationId, guestProfileId: updated.guestProfileId, assignedToId: updated.assignedToId } });
    return this.lostView(updated);
  }
  async returnLost(userId: string, id: string, body: LostFoundReturnDto) { const scope = await this.lostScope(userId, [...MANAGEMENT, UserRole.RESERVATION]); const row = await this.p.lostFoundItem.findUnique({ where: { id } }); if (!row || (!scope.isGlobal && row.hotelId !== scope.hotelId)) throw new NotFoundException('Lost & Found item not found.'); if (row.status !== LostFoundStatus.MATCHED) throw new ConflictException('Only matched items can be returned.'); const updated = await this.p.lostFoundItem.update({ where: { id }, data: { status: LostFoundStatus.RETURNED, claimantName: body.claimantName.trim(), claimantMobile: body.claimantMobile.trim(), returnedAt: new Date(), returnedById: userId, notes: body.notes?.trim() || undefined }, include: { hotel: { select: { id: true, name: true } }, room: true, reservation: { select: { id: true, reference: true, guestName: true } }, guestProfile: { select: { id: true, displayName: true, mobile: true } }, reportedBy: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } }, returnedBy: { select: { id: true, name: true } }, disposedBy: { select: { id: true, name: true } } } }); await this.audit.log({ actorUserId: userId, action: 'LOST_FOUND_RETURNED', entityType: 'LostFoundItem', entityId: id, after: { claimantName: updated.claimantName, returnedAt: updated.returnedAt } }); return this.lostView(updated); }
  async disposeLost(userId: string, id: string, body: LostFoundDisposeDto) { const scope = await this.lostScope(userId, MANAGEMENT); const row = await this.p.lostFoundItem.findUnique({ where: { id } }); if (!row || (!scope.isGlobal && row.hotelId !== scope.hotelId)) throw new NotFoundException('Lost & Found item not found.'); if (row.status === LostFoundStatus.RETURNED || row.status === LostFoundStatus.DISPOSED) throw new ConflictException('This item cannot be disposed in its current state.'); const now = new Date(); const updated = await this.p.lostFoundItem.update({ where: { id }, data: { status: LostFoundStatus.DISPOSED, disposalReason: body.disposalReason.trim(), disposedAt: now, disposedById: userId }, include: { disposedBy: { select: { id: true, name: true } } } }); await this.audit.log({ actorUserId: userId, action: 'LOST_FOUND_DISPOSED', entityType: 'LostFoundItem', entityId: id, after: { disposalReason: updated.disposalReason, disposedAt: updated.disposedAt, disposedById: updated.disposedById } }); return updated; }
}

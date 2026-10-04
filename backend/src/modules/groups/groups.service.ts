import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GroupReservationStatus, Prisma, UserRole } from '@prisma/client';
import { randomUUID } from 'crypto';
import ExcelJS from 'exceljs';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../../common/prisma.service';
import { eachNight, parseDateOnly, parseExcelDateOnly, toDateOnly } from '../../common/dates';
import { normalizeGuestEmail, normalizeGuestMobile } from '../guests/guest-normalization';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { serializable } from '../../common/transactions';
import { BulkPickupDto, GroupBlockCreateDto, GroupCreateDto, GroupListQueryDto, GroupUpdateDto, PickupDto, RoomingListBulkDto, RoomingListEntryDto } from './groups.dto';

const WRITE_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.RESERVATION];
const READ_ROLES: UserRole[] = [...WRITE_ROLES, UserRole.ACCOUNTS, UserRole.VIEWER];

@Injectable()
export class GroupsService {
  constructor(private readonly p: PrismaService, private readonly availability: AvailabilityService) {}

  private async scope(userId: string, write = false) {
    const scope = await getActorScope(this.p, userId);
    const allowed = write ? WRITE_ROLES : READ_ROLES;
    if (!allowed.includes(scope.role)) throw new ForbiddenException('Group reservation access is not available to this account.');
    // Accounts and Viewer remain globally unassigned in the shared actor model.
    // Groups read access is the only feature-local exception: they may select a
    // hotel for read-only work without changing global RBAC semantics.
    if (!write && (scope.role === UserRole.ACCOUNTS || scope.role === UserRole.VIEWER)) return { ...scope, isGlobal: true };
    return scope;
  }

  private date(value: string, field: string) { return parseDateOnly(value, field); }
  private validateDates(arrival: Date, departure: Date) { if (arrival >= departure) throw new BadRequestException('departureDate must be after arrivalDate'); }

  private async validateCommercialLinks(db: PrismaService | Prisma.TransactionClient, hotelId: string, corporateId?: string | null, agentId?: string | null) {
    if (corporateId && !(await db.corporateAccount.findFirst({ where: { id: corporateId, active: true, hotels: { some: { hotelId, active: true } } }, select: { id: true } }))) throw new BadRequestException('Corporate account is not active or linked to this hotel.');
    if (agentId && !(await db.user.findFirst({ where: { id: agentId, role: 'AGENT', active: true, assignedRatePlans: { some: { active: true, ratePlan: { active: true, roomType: { hotelId } } } } }, select: { id: true } }))) throw new BadRequestException('Agent account is not active or commercially linked to this hotel.');
  }

  private async findScoped(userId: string, id: string, write = false, requestedHotelId?: string | null) {
    const scope = await this.scope(userId, write);
    const requestedScopeHotelId = resolveRequestedHotel(scope, requestedHotelId);
    const row = await this.p.groupReservation.findUnique({ where: { id }, include: this.include() });
    if (!row || (requestedScopeHotelId && row.hotelId !== requestedScopeHotelId)) throw new NotFoundException('Group reservation not found.');
    return { scope, row };
  }

  private include() {
    return {
      hotel: { select: { id: true, name: true, city: true } },
      corporate: { select: { id: true, name: true } },
      agent: { select: { id: true, name: true, email: true } },
      roomBlocks: { include: { roomType: { select: { id: true, name: true, code: true } }, ratePlan: { select: { id: true, name: true } }, nights: { orderBy: { date: 'asc' as const } } }, orderBy: { createdAt: 'asc' as const } },
      roomingList: { include: { roomType: { select: { id: true, name: true } }, reservation: { select: { reference: true, status: true } } }, orderBy: { createdAt: 'asc' as const } },
      reservations: { select: { id: true, reference: true, guestName: true, status: true, stayStatus: true, checkIn: true, checkOut: true }, orderBy: { createdAt: 'asc' as const } },
      banquetEvents: { select: { id: true, eventCode: true, eventName: true, startDate: true, endDate: true, status: true }, orderBy: { startDate: 'asc' as const } },
    } as const;
  }

  private view(row: any) {
    const nights = row.roomBlocks?.flatMap((block: any) => block.nights ?? []) ?? [];
    const blocked = nights.reduce((sum: number, night: any) => sum + night.roomsBlocked, 0);
    const pickup = nights.reduce((sum: number, night: any) => sum + night.roomsPickedUp, 0);
    const released = nights.reduce((sum: number, night: any) => sum + night.roomsReleased, 0);
    const rooming = row.roomingList ?? [];
    const checkedIn = (row.reservations ?? []).filter((item: any) => item.stayStatus === 'CHECKED_IN').length;
    const checkedOut = (row.reservations ?? []).filter((item: any) => item.stayStatus === 'CHECKED_OUT').length;
    return { ...row, summary: { roomsBlocked: blocked, pickup, released, remaining: Math.max(0, blocked - pickup - released), roomingListTotal: rooming.length, roomingListCreated: rooming.filter((item: any) => item.status === 'RESERVATION_CREATED').length, expectedGuests: row.reservations?.length ?? 0, checkedIn, checkedOut, notArrived: Math.max(0, (row.reservations?.length ?? 0) - checkedIn - checkedOut) } };
  }

  async list(userId: string, query: GroupListQueryDto) {
    const scope = await this.scope(userId);
    const hotelId = resolveRequestedHotel(scope, query.hotelId);
    const page = Math.max(1, Number(query.page) || 1); const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
    const search = query.search?.trim();
    const where: Prisma.GroupReservationWhereInput = { hotelId: hotelId ?? undefined, status: query.status, corporateId: query.corporateId, agentId: query.agentId, ...(search ? { OR: [{ groupCode: { contains: search, mode: 'insensitive' } }, { groupName: { contains: search, mode: 'insensitive' } }, { primaryContactName: { contains: search, mode: 'insensitive' } }, { corporate: { name: { contains: search, mode: 'insensitive' } } }, { agent: { name: { contains: search, mode: 'insensitive' } } }] } : {}), arrivalDate: { gte: query.arrivalFrom ? this.date(query.arrivalFrom, 'arrivalFrom') : undefined, lte: query.arrivalTo ? this.date(query.arrivalTo, 'arrivalTo') : undefined } };
    const [items, total] = await Promise.all([
      this.p.groupReservation.findMany({ where, include: { hotel: { select: { id: true, name: true } }, roomBlocks: { include: { nights: true } }, roomingList: { select: { status: true } } }, orderBy: [{ arrivalDate: 'asc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit }),
      this.p.groupReservation.count({ where }),
    ]);
    return { items: items.map((item) => this.view(item)), pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  private async syncLifecycle(row: any, userId: string) {
    const reservations = row.reservations ?? [];
    let nextStatus = row.status;
    if (row.status === GroupReservationStatus.CONFIRMED && reservations.some((item: any) => item.stayStatus === 'CHECKED_IN')) nextStatus = GroupReservationStatus.IN_HOUSE;
    if ([GroupReservationStatus.CONFIRMED, GroupReservationStatus.IN_HOUSE].includes(row.status) && reservations.length > 0 && reservations.every((item: any) => ['CHECKED_OUT', 'NO_SHOW'].includes(item.stayStatus) || ['CANCELLED', 'NO_SHOW', 'EXPIRED', 'COMPLETED'].includes(item.status))) nextStatus = GroupReservationStatus.COMPLETED;
    if (nextStatus !== row.status) {
      await this.p.groupReservation.update({ where: { id: row.id }, data: { status: nextStatus } });
      await this.p.auditLog.create({ data: { actorUserId: userId, action: `GROUP_${nextStatus}`, entityType: 'GroupReservation', entityId: row.id, after: { status: nextStatus, linkedReservations: reservations.length } } });
      row.status = nextStatus;
    }
    return row;
  }

  async detail(userId: string, id: string, requestedHotelId?: string | null) { const { row } = await this.findScoped(userId, id, false, requestedHotelId); return this.view(row); }

  async syncLifecycleStatus(userId: string, id: string) { const { row } = await this.findScoped(userId, id, true); await this.syncLifecycle(row, userId); return this.view(row); }

  async syncLifecycleForReservation(userId: string, reference: string) {
    const reservation = await this.p.reservation.findUnique({ where: { reference }, select: { groupReservationId: true } });
    if (reservation?.groupReservationId) return this.syncLifecycleStatus(userId, reservation.groupReservationId);
    return null;
  }

  async create(userId: string, body: GroupCreateDto) {
    const scope = await this.scope(userId, true); const hotelId = resolveRequestedHotel(scope, body.hotelId); if (!hotelId) throw new BadRequestException('Hotel is required.');
    const arrival = this.date(body.arrivalDate, 'arrivalDate'); const departure = this.date(body.departureDate, 'departureDate'); this.validateDates(arrival, departure);
    if (body.cutoffDate && this.date(body.cutoffDate, 'cutoffDate') > arrival) throw new BadRequestException('cutoffDate cannot be after arrivalDate');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, active: true } }); if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    await this.validateCommercialLinks(this.p, hotelId, body.corporateId, body.agentId);
    const source = body.corporateId ? 'COMPANY' : body.source ?? 'DIRECT';
    const code = `GRP-${arrival.getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;
    const row = await this.p.groupReservation.create({ data: { hotelId, groupCode: code, groupName: body.groupName.trim(), groupType: body.groupType, status: GroupReservationStatus.INQUIRY, arrivalDate: arrival, departureDate: departure, primaryContactName: body.primaryContactName.trim(), primaryContactMobile: body.primaryContactMobile.trim(), primaryContactEmail: body.primaryContactEmail?.trim().toLowerCase(), corporateId: body.corporateId, agentId: body.agentId, source, billingInstruction: body.billingInstruction ?? 'INDIVIDUAL', notes: body.notes?.trim(), cutoffDate: body.cutoffDate ? this.date(body.cutoffDate, 'cutoffDate') : undefined, roomingListDueDate: body.roomingListDueDate ? this.date(body.roomingListDueDate, 'roomingListDueDate') : undefined, createdByUserId: userId } });
    await this.p.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_RESERVATION_CREATED', entityType: 'GroupReservation', entityId: row.id, after: { groupCode: row.groupCode, hotelId, status: row.status } } });
    return this.detail(userId, row.id);
  }

  async update(userId: string, id: string, body: GroupUpdateDto) {
    const { row } = await this.findScoped(userId, id, true); if (row.status === 'CANCELLED' || row.status === 'COMPLETED') throw new BadRequestException('This group cannot be edited in its current status.');
    const arrival = body.arrivalDate ? this.date(body.arrivalDate, 'arrivalDate') : row.arrivalDate; const departure = body.departureDate ? this.date(body.departureDate, 'departureDate') : row.departureDate; this.validateDates(arrival, departure);
    const existingNights = row.roomBlocks.flatMap((block: any) => block.nights).map((night: any) => new Date(night.date).getTime());
    const existingRooming = row.roomingList.map((entry: any) => [new Date(entry.checkIn).getTime(), new Date(entry.checkOut).getTime()]);
    const existingReservations = row.reservations.map((reservation: any) => [new Date(reservation.checkIn).getTime(), new Date(reservation.checkOut).getTime()]);
    const hasOutOfRangeBlock = existingNights.some((value: number) => value < arrival.getTime() || value >= departure.getTime());
    const hasOutOfRangeStay = [...existingRooming, ...existingReservations].some(([checkIn, checkOut]: number[]) => checkIn < arrival.getTime() || checkOut > departure.getTime());
    if ((body.arrivalDate || body.departureDate) && (hasOutOfRangeBlock || hasOutOfRangeStay)) throw new BadRequestException('Group dates must contain every existing block, rooming-list stay, and linked reservation.');
    const corporateId = body.corporateId === undefined ? row.corporateId : body.corporateId; const agentId = body.agentId === undefined ? row.agentId : body.agentId;
    await this.validateCommercialLinks(this.p, row.hotelId, corporateId, agentId);
    const source = corporateId ? 'COMPANY' : body.source ?? row.source;
    const next = await this.p.groupReservation.update({ where: { id }, data: { groupName: body.groupName?.trim(), groupType: body.groupType, arrivalDate: arrival, departureDate: departure, primaryContactName: body.primaryContactName?.trim(), primaryContactMobile: body.primaryContactMobile?.trim(), primaryContactEmail: body.primaryContactEmail?.trim().toLowerCase(), corporateId, agentId, source, billingInstruction: body.billingInstruction, notes: body.notes?.trim(), cutoffDate: body.cutoffDate === null ? null : body.cutoffDate ? this.date(body.cutoffDate, 'cutoffDate') : undefined, roomingListDueDate: body.roomingListDueDate === null ? null : body.roomingListDueDate ? this.date(body.roomingListDueDate, 'roomingListDueDate') : undefined } });
    await this.p.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_RESERVATION_UPDATED', entityType: 'GroupReservation', entityId: id, after: { fields: Object.keys(body) } } }); return this.detail(userId, next.id);
  }

  async tentative(userId: string, id: string) {
    await this.findScoped(userId, id, true);
    await serializable(this.p, async (tx) => {
      const group = await tx.groupReservation.findUnique({ where: { id }, select: { status: true } });
      if (!group || group.status !== GroupReservationStatus.INQUIRY) throw new BadRequestException('Only inquiry groups can be marked tentative.');
      await tx.groupReservation.update({ where: { id }, data: { status: GroupReservationStatus.TENTATIVE } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_TENTATIVE', entityType: 'GroupReservation', entityId: id, after: { status: 'TENTATIVE' } } });
    });
    return this.detail(userId, id);
  }

  async cancel(userId: string, id: string) {
    await this.findScoped(userId, id, true);
    return serializable(this.p, async (tx) => {
      const group = await tx.groupReservation.findUnique({ where: { id }, include: { roomBlocks: { include: { nights: true } }, reservations: { select: { id: true } } } });
      if (!group) throw new NotFoundException('Group reservation not found.');
      if (group.status === GroupReservationStatus.CANCELLED || group.status === GroupReservationStatus.COMPLETED) throw new BadRequestException('This group cannot be cancelled in its current status.');
      const rowsById = new Map<string, { row: any; amount: number }>(); let releasedRoomNights = 0;
      for (const block of group.roomBlocks.filter((item: any) => item.inventoryCommitted)) {
        const rows = await this.lockInventory(tx, block.roomTypeId, block.nights.map((night: any) => night.date));
        for (const night of block.nights) {
          const remaining = Math.max(0, night.roomsBlocked - night.roomsPickedUp - night.roomsReleased); if (!remaining) continue;
          const row = rows.find((candidate: any) => toDateOnly(candidate.date) === toDateOnly(night.date)); if (!row) continue;
          rowsById.set(row.id, { row, amount: (rowsById.get(row.id)?.amount ?? 0) + remaining }); releasedRoomNights += remaining;
          await tx.groupRoomBlockNight.update({ where: { id: night.id }, data: { roomsReleased: { increment: remaining } } });
        }
      }
      for (const value of rowsById.values()) await tx.inventoryDay.update({ where: { id: value.row.id }, data: { groupBlocked: { decrement: value.amount }, version: { increment: 1 } } });
      await tx.groupReservation.update({ where: { id }, data: { status: GroupReservationStatus.CANCELLED } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_CANCELLED', entityType: 'GroupReservation', entityId: id, after: { existingReservations: group.reservations.length, releasedRoomNights } } });
      return { existingReservations: group.reservations.length, releasedRoomNights };
    }).then((result) => this.detail(userId, id).then((detail) => ({ ...detail, cancellation: result })));
  }

  async addBlock(userId: string, id: string, body: GroupBlockCreateDto) {
    await this.findScoped(userId, id, true); return serializable(this.p, async (tx) => {
      const group = await tx.groupReservation.findUnique({ where: { id }, include: { roomBlocks: { include: { nights: true } } } }); if (!group) throw new NotFoundException('Group reservation not found.');
      if (group.status === 'CANCELLED' || group.status === 'COMPLETED') throw new BadRequestException('Room blocks cannot be added to this group.');
      const room = await tx.roomType.findFirst({ where: { id: body.roomTypeId, hotelId: group.hotelId, active: true }, select: { id: true } }); if (!room) throw new BadRequestException('Room type is not active for this hotel.');
      const nights = [...new Map(body.nights.map((night) => [night.date, night])).values()]; if (!nights.length) throw new BadRequestException('At least one block night is required.');
      const dates = nights.map((night) => this.date(night.date, 'date')); if (dates.some((date) => date < group.arrivalDate || date >= group.departureDate)) throw new BadRequestException('Block dates must be inside the group stay.');
      if (body.ratePlanId && !(await tx.ratePlan.findFirst({ where: { id: body.ratePlanId, roomTypeId: body.roomTypeId, active: true }, select: { id: true } }))) throw new BadRequestException('Rate plan does not belong to the selected room type.');
      const committed = group.status === 'CONFIRMED' || group.status === 'IN_HOUSE';
      const rows = await this.lockInventory(tx, body.roomTypeId, dates);
      if (committed) for (const night of nights) { const row = rows.find((candidate: any) => toDateOnly(candidate.date) === night.date); if (!row) throw new BadRequestException(`Inventory is not configured for ${night.date}.`); if (row.available - row.held - row.sold - row.groupBlocked < night.roomsBlocked) throw new ConflictException(`Insufficient sellable inventory for ${night.date}.`); }
      const block = await tx.groupRoomBlock.create({ data: { groupReservationId: id, roomTypeId: body.roomTypeId, ratePlanId: body.ratePlanId, agreedRate: body.agreedRate, currency: body.currency ?? 'INR', inventoryCommitted: committed, notes: body.notes?.trim(), nights: { create: nights.map((night) => ({ date: this.date(night.date, 'date'), roomsBlocked: night.roomsBlocked })) } }, include: { nights: true, roomType: { select: { id: true, name: true } } } });
      if (committed) for (const night of nights) { const row = rows.find((candidate: any) => toDateOnly(candidate.date) === night.date)!; await tx.inventoryDay.update({ where: { id: row.id }, data: { groupBlocked: { increment: night.roomsBlocked }, version: { increment: 1 } } }); }
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_ROOM_BLOCK_ADDED', entityType: 'GroupRoomBlock', entityId: block.id, after: { groupId: id, committed, nights: nights as unknown as Prisma.InputJsonValue } } }); return block;
    }).then(() => this.detail(userId, id));
  }

  async updateBlock(userId: string, id: string, blockId: string, body: import('./groups.dto').GroupBlockUpdateDto) {
    await this.findScoped(userId, id, true);
    return serializable(this.p, async (tx) => {
      const group = await tx.groupReservation.findUnique({ where: { id }, include: { roomBlocks: { include: { nights: true } } } });
      const block = group?.roomBlocks.find((item: any) => item.id === blockId);
      if (!group || !block) throw new NotFoundException('Room block not found.');
      if (group.status === GroupReservationStatus.CANCELLED || group.status === GroupReservationStatus.COMPLETED) throw new BadRequestException('This group cannot be edited in its current status.');
      const nights = [...new Map(body.nights.map((night) => [night.date, night])).values()];
      const dates = nights.map((night) => this.date(night.date, 'date'));
      if (!nights.length || dates.some((date) => date < group.arrivalDate || date >= group.departureDate)) throw new BadRequestException('Block dates must be inside the group stay.');
      if (body.ratePlanId && !(await tx.ratePlan.findFirst({ where: { id: body.ratePlanId, roomTypeId: block.roomTypeId, active: true }, select: { id: true } }))) throw new BadRequestException('Rate plan does not belong to the selected room type.');
      const oldByDate = new Map(block.nights.map((night: any) => [toDateOnly(night.date), night]));
      const submittedDates = new Set(nights.map((night) => night.date));
      for (const old of block.nights) if (!submittedDates.has(toDateOnly(old.date)) && (old.roomsPickedUp > 0 || old.roomsReleased > 0)) throw new ConflictException(`Block night ${toDateOnly(old.date)} has pickup/release history and cannot be removed.`);
      for (const night of nights) { const old = oldByDate.get(night.date) as any; const minimum = old ? old.roomsPickedUp + old.roomsReleased : 0; if (night.roomsBlocked < minimum) throw new ConflictException(`Block for ${night.date} cannot be below ${minimum} picked-up/released rooms.`); }
      const allDates = [...new Set([...block.nights.map((night: any) => toDateOnly(night.date)), ...nights.map((night) => night.date)])].map((date) => this.date(date, 'date'));
      if (block.inventoryCommitted) {
        const rows = await this.lockInventory(tx, block.roomTypeId, allDates);
        const oldRemaining = new Map(block.nights.map((night: any) => [toDateOnly(night.date), Math.max(0, night.roomsBlocked - night.roomsPickedUp - night.roomsReleased)]));
        const nextRemaining = new Map(nights.map((night) => [night.date, night.roomsBlocked - ((oldByDate.get(night.date) as any)?.roomsPickedUp ?? 0) - ((oldByDate.get(night.date) as any)?.roomsReleased ?? 0)]));
        for (const row of rows) { const delta = (nextRemaining.get(toDateOnly(row.date)) ?? 0) - (oldRemaining.get(toDateOnly(row.date)) ?? 0); if (delta > 0 && row.available - row.held - row.sold - row.groupBlocked < delta) throw new ConflictException(`Insufficient sellable inventory for ${toDateOnly(row.date)}.`); if (delta) await tx.inventoryDay.update({ where: { id: row.id }, data: { groupBlocked: delta > 0 ? { increment: delta } : { decrement: Math.abs(delta) }, version: { increment: 1 } } }); }
      }
      await tx.groupRoomBlock.update({ where: { id: blockId }, data: { ratePlanId: body.ratePlanId === null ? null : body.ratePlanId, agreedRate: body.agreedRate === null ? null : body.agreedRate, currency: body.currency, notes: body.notes === null ? null : body.notes?.trim() } });
      for (const night of nights) {
        const old = oldByDate.get(night.date) as any;
        if (old) await tx.groupRoomBlockNight.update({ where: { id: old.id }, data: { roomsBlocked: night.roomsBlocked } });
        else await tx.groupRoomBlockNight.create({ data: { groupRoomBlockId: blockId, date: this.date(night.date, 'date'), roomsBlocked: night.roomsBlocked } });
      }
      await tx.groupRoomBlockNight.deleteMany({ where: { groupRoomBlockId: blockId, date: { notIn: dates } } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_BLOCK_UPDATED', entityType: 'GroupRoomBlock', entityId: blockId, after: { groupId: id, nights: nights as unknown as Prisma.InputJsonValue } } });
    });
    return this.detail(userId, id);
  }

  async confirm(userId: string, id: string) {
    await this.findScoped(userId, id, true); await serializable(this.p, async (tx) => {
      const group = await tx.groupReservation.findUnique({ where: { id }, include: { roomBlocks: { include: { nights: true } } } }); if (!group) throw new NotFoundException('Group reservation not found.');
      if (group.status === 'CONFIRMED' || group.status === 'IN_HOUSE') return; if (group.status === 'CANCELLED' || group.status === 'COMPLETED') throw new BadRequestException('This group cannot be confirmed.');
      const allRows = new Map<string, any>();
      for (const block of group.roomBlocks.filter((item: any) => !item.inventoryCommitted)) { const rows = await this.lockInventory(tx, block.roomTypeId, block.nights.map((night: any) => night.date)); for (const night of block.nights) { const row = rows.find((candidate: any) => toDateOnly(candidate.date) === toDateOnly(night.date)); if (!row) throw new BadRequestException(`Inventory is not configured for ${toDateOnly(night.date)}.`); const remaining = night.roomsBlocked - night.roomsPickedUp - night.roomsReleased; const current = allRows.get(row.id); allRows.set(row.id, { row, amount: (current?.amount ?? 0) + remaining }); } }
      for (const value of allRows.values()) if (value.row.available - value.row.held - value.row.sold - value.row.groupBlocked < value.amount) throw new ConflictException(`Combined tentative group blocks exceed sellable inventory for ${toDateOnly(value.row.date)}.`);
      for (const value of allRows.values()) await tx.inventoryDay.update({ where: { id: value.row.id }, data: { groupBlocked: { increment: value.amount }, version: { increment: 1 } } });
      await tx.groupRoomBlock.updateMany({ where: { groupReservationId: id, inventoryCommitted: false }, data: { inventoryCommitted: true } });
      await tx.groupReservation.update({ where: { id }, data: { status: 'CONFIRMED' } }); await tx.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_CONFIRMED', entityType: 'GroupReservation', entityId: id, after: { status: 'CONFIRMED' } } });
    }); return this.detail(userId, id);
  }

  async release(userId: string, id: string) {
    await this.findScoped(userId, id, true); await serializable(this.p, async (tx) => {
      const group = await tx.groupReservation.findUnique({ where: { id }, include: { roomBlocks: { include: { nights: true } } } }); if (!group) throw new NotFoundException('Group reservation not found.');
      const blocks = group.roomBlocks.filter((block: any) => block.inventoryCommitted); const byRow = new Map<string, any>();
      for (const block of blocks) { const rows = await this.lockInventory(tx, block.roomTypeId, block.nights.map((night: any) => night.date)); for (const night of block.nights) { const remaining = Math.max(0, night.roomsBlocked - night.roomsPickedUp - night.roomsReleased); if (!remaining) continue; const row = rows.find((candidate: any) => toDateOnly(candidate.date) === toDateOnly(night.date)); if (!row) continue; byRow.set(row.id, { row, amount: (byRow.get(row.id)?.amount ?? 0) + remaining }); await tx.groupRoomBlockNight.update({ where: { id: night.id }, data: { roomsReleased: { increment: remaining } } }); } }
      for (const value of byRow.values()) await tx.inventoryDay.update({ where: { id: value.row.id }, data: { groupBlocked: { decrement: value.amount }, version: { increment: 1 } } }); await tx.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_UNUSED_BLOCK_RELEASED', entityType: 'GroupReservation', entityId: id, after: { released: [...byRow.values()].reduce((sum, value) => sum + value.amount, 0) } } });
    }); return this.detail(userId, id);
  }

  private async validateEntry(group: any, body: RoomingListEntryDto) {
    const checkIn = this.date(body.checkIn, 'checkIn'); const checkOut = this.date(body.checkOut, 'checkOut'); this.validateDates(checkIn, checkOut); if (checkIn < group.arrivalDate || checkOut > group.departureDate) throw new BadRequestException('Rooming-list dates must be inside the group stay.');
    const room = await this.p.roomType.findFirst({ where: { id: body.roomTypeId, hotelId: group.hotelId, active: true }, select: { id: true, name: true } }); if (!room) throw new BadRequestException('Room type is not active for this hotel.'); return { checkIn, checkOut, room };
  }

  private existingRoomingDuplicate(group: any, entry: RoomingListEntryDto) {
    return (group.roomingList ?? []).find((item: any) => item.status !== 'ERROR' && (entry.externalReference?.trim() ? item.externalReference?.toLowerCase() === entry.externalReference.trim().toLowerCase() : item.guestName.trim().toLowerCase() === entry.guestName.trim().toLowerCase() && item.roomTypeId === entry.roomTypeId && toDateOnly(item.checkIn) === entry.checkIn && toDateOnly(item.checkOut) === entry.checkOut));
  }

  private validateRoomingCapacity(group: any, validated: { entry: RoomingListEntryDto; valid: { checkIn: Date; checkOut: Date } }[]) {
    const capacity = new Map<string, number>();
    for (const item of (group.roomingList ?? []).filter((row: any) => ['DRAFT', 'READY'].includes(row.status))) for (const date of eachNight(item.checkIn, item.checkOut)) { const key = `${item.roomTypeId}:${toDateOnly(date)}`; capacity.set(key, (capacity.get(key) ?? 0) + 1); }
    for (const item of validated) for (const date of eachNight(item.valid.checkIn, item.valid.checkOut)) { const key = `${item.entry.roomTypeId}:${toDateOnly(date)}`; capacity.set(key, (capacity.get(key) ?? 0) + 1); }
    const blocks = new Map<string, number>();
    for (const block of group.roomBlocks) for (const night of block.nights) { const key = `${block.roomTypeId}:${toDateOnly(night.date)}`; blocks.set(key, (blocks.get(key) ?? 0) + Math.max(0, night.roomsBlocked - night.roomsPickedUp - night.roomsReleased)); }
    for (const [key, requested] of capacity) if ((blocks.get(key) ?? 0) < requested) { const date = key.slice(key.indexOf(':') + 1); throw new ConflictException(`Rooming list exceeds the remaining block for ${date}; existing READY rows are included.`); }
  }

  private async lockAndAllocateGroupPickup(tx: Prisma.TransactionClient, groupId: string, roomTypeId: string, dates: Date[]) {
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const blockNights = await tx.$queryRaw<any[]>(Prisma.sql`
      SELECT n.id, n."groupRoomBlockId", n.date, n."roomsBlocked", n."roomsPickedUp", n."roomsReleased", b."createdAt", b."ratePlanId"
      FROM public."GroupRoomBlockNight" n
      JOIN public."GroupRoomBlock" b ON b.id = n."groupRoomBlockId"
      WHERE b."groupReservationId" = ${groupId}
        AND b."roomTypeId" = ${roomTypeId}
        AND b."inventoryCommitted" = true
        AND n.date >= ${sorted[0]}::date
        AND n.date <= ${sorted[sorted.length - 1]}::date
      ORDER BY n.date ASC, b."createdAt" ASC, n.id ASC
      FOR UPDATE
    `);
    const allocations: { id: string; date: Date; ratePlanId: string | null }[] = [];
    for (const date of dates) {
      const matching = blockNights.filter((night: any) => toDateOnly(night.date) === toDateOnly(date));
      const remaining = matching.reduce((sum: number, night: any) => sum + Math.max(0, night.roomsBlocked - night.roomsPickedUp - night.roomsReleased), 0);
      if (remaining < 1) throw new ConflictException(`The remaining group block is exhausted for ${toDateOnly(date)}.`);
      const candidate = matching.find((night: any) => night.roomsBlocked - night.roomsPickedUp - night.roomsReleased > 0);
      if (!candidate) throw new ConflictException(`The remaining group block is exhausted for ${toDateOnly(date)}.`);
      await tx.groupRoomBlockNight.update({ where: { id: candidate.id }, data: { roomsPickedUp: { increment: 1 } } });
      allocations.push({ id: candidate.id, date: candidate.date, ratePlanId: candidate.ratePlanId });
    }
    const ratePlanIds = [...new Set(allocations.map((item) => item.ratePlanId).filter((value): value is string => Boolean(value)))];
    if (ratePlanIds.length > 1) throw new ConflictException('This stay spans group block nights with different rate plans. Align the group rate plan before creating the reservation.');
    return { allocations, ratePlanId: ratePlanIds[0] ?? null };
  }

  async addRoomingEntry(userId: string, id: string, body: RoomingListEntryDto) { const { row: group } = await this.findScoped(userId, id, true); const valid = await this.validateEntry(group, body); const duplicate = this.existingRoomingDuplicate(group, body); if (duplicate) throw new ConflictException('Duplicate of existing rooming-list entry.'); this.validateRoomingCapacity(group, [{ entry: body, valid }]); const entry = await this.p.groupRoomingListEntry.create({ data: { groupReservationId: id, roomTypeId: body.roomTypeId, guestName: body.guestName.trim(), mobile: body.mobile?.trim(), email: body.email?.trim().toLowerCase(), checkIn: valid.checkIn, checkOut: valid.checkOut, adults: body.adults, children: body.children, specialRequest: body.specialRequest?.trim(), externalReference: body.externalReference?.trim(), status: 'READY' }, include: { roomType: true } }); return entry; }

  async bulkRooming(userId: string, id: string, body: RoomingListBulkDto) {
    const { row: group } = await this.findScoped(userId, id, true); if (!body.entries.length) throw new BadRequestException('At least one rooming-list row is required.');
    const validated = []; for (const entry of body.entries) validated.push({ entry, valid: await this.validateEntry(group, entry) });
    const duplicates = validated.filter(({ entry }) => this.existingRoomingDuplicate(group, entry)); if (duplicates.length) throw new ConflictException('Duplicate of existing rooming-list entry.');
    const seen = new Set<string>(); for (const { entry } of validated) { const key = entry.externalReference?.trim().toLowerCase() || `${entry.guestName.trim().toLowerCase()}|${entry.roomTypeId}|${entry.checkIn}|${entry.checkOut}`; if (seen.has(key)) throw new ConflictException('Duplicate rooming-list entry in submitted rows.'); seen.add(key); }
    this.validateRoomingCapacity(group, validated);
    await this.p.groupRoomingListEntry.createMany({ data: validated.map(({ entry, valid }) => ({ groupReservationId: id, roomTypeId: entry.roomTypeId, guestName: entry.guestName.trim(), mobile: entry.mobile?.trim(), email: entry.email?.trim().toLowerCase(), checkIn: valid.checkIn, checkOut: valid.checkOut, adults: entry.adults, children: entry.children, specialRequest: entry.specialRequest?.trim(), externalReference: entry.externalReference?.trim(), status: 'READY' })) }); return this.detail(userId, id);
  }


  async roomingListTemplate(userId: string, id: string) {
    await this.findScoped(userId, id, true);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RainWood Hotels';
    workbook.created = new Date();
    const sheet = workbook.addWorksheet('Rooming List');
    sheet.addRow(['Guest Name', 'Room Type', 'Check In', 'Check Out', 'Adults', 'Children', 'Mobile', 'Email', 'Special Request', 'External Reference']);
    sheet.addRow(['Sample Guest', 'Use room type name or code', '2026-12-10', '2026-12-12', 1, 0, '9000000000', 'guest@example.com', 'Late arrival', 'GROUP-001']);
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF087F8C' } };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: 'J2' };
    sheet.columns = [18, 24, 14, 14, 10, 10, 16, 28, 30, 20].map((width) => ({ width }));
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importRoomingList(userId: string, id: string, file: Express.Multer.File, commit = false) {
    if (!file?.buffer || !/\.(xlsx|xlsm)$/i.test(file.originalname ?? '')) throw new BadRequestException('Upload an .xlsx workbook');
    const { row: group } = await this.findScoped(userId, id, true);
    const workbook = new ExcelJS.Workbook();
    try { await workbook.xlsx.load(file.buffer as any); } catch { throw new BadRequestException('The workbook could not be read. Upload a valid .xlsx file.'); }
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('Workbook must contain a rooming-list worksheet.');
    const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[\s_]+/g, ' ');
    const aliases: Record<string, string[]> = {
      guestName: ['guest name', 'guest', 'name'], roomType: ['room type', 'room type code', 'room code'], checkIn: ['check in', 'check-in', 'arrival', 'arrival date'], checkOut: ['check out', 'check-out', 'departure', 'departure date'], adults: ['adults', 'adult'], children: ['children', 'child'], mobile: ['mobile', 'phone', 'contact'], email: ['email', 'email address'], specialRequest: ['special request', 'special requests', 'remarks'], externalReference: ['external reference', 'reference', 'guest reference'],
    };
    const header = new Map<string, number>();
    let headerRowNumber = 0;
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
      const candidate = new Map<string, number>();
      sheet.getRow(rowNumber).eachCell((cell, index) => candidate.set(normalize(cell.value), index));
      const match = (field: string) => aliases[field].some((key) => candidate.has(key));
      if (match('guestName') && match('roomType') && match('checkIn') && match('checkOut')) {
        for (const [field, names] of Object.entries(aliases)) { const index = names.map((name) => candidate.get(name)).find((value): value is number => value !== undefined); if (index !== undefined) header.set(field, index); }
        headerRowNumber = rowNumber; break;
      }
    }
    if (!headerRowNumber) throw new BadRequestException('Missing required columns: Guest Name, Room Type, Check In, Check Out');
    const value = (row: ExcelJS.Row, field: string) => { const index = header.get(field); return index === undefined ? undefined : row.getCell(index).value; };
    const text = (row: ExcelJS.Row, field: string) => { const raw = value(row, field); return raw && typeof raw === 'object' && 'result' in raw ? String(raw.result ?? '').trim() : String(raw ?? '').trim(); };
    const roomTypes = await this.p.roomType.findMany({ where: { hotelId: group.hotelId, active: true }, select: { id: true, name: true, code: true } });
    const roomMap = new Map<string, string>(); for (const room of roomTypes) { roomMap.set(room.id.toLowerCase(), room.id); roomMap.set(room.name.toLowerCase(), room.id); roomMap.set(room.code.toLowerCase(), room.id); }
    const errors: { row: number; field: string; message: string }[] = [];
    const entries: RoomingListEntryDto[] = [];
    const seen = new Set<string>();
    let rowsRead = 0;
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber); if (!row.actualCellCount) continue;
      const hasData = ['guestName', 'roomType', 'checkIn', 'checkOut'].some((field) => text(row, field)); if (!hasData) continue;
      rowsRead += 1;
      const guestName = text(row, 'guestName'); const roomLabel = text(row, 'roomType'); const roomTypeId = roomMap.get(roomLabel.toLowerCase());
      if (!guestName) errors.push({ row: rowNumber, field: 'Guest Name', message: 'Guest Name is required' });
      if (!roomTypeId) errors.push({ row: rowNumber, field: 'Room Type', message: roomLabel ? `Unknown room type "${roomLabel}"` : 'Room Type is required' });
      let checkIn: Date | undefined; let checkOut: Date | undefined;
      try { checkIn = parseExcelDateOnly(value(row, 'checkIn'), `Check In row ${rowNumber}`); } catch { errors.push({ row: rowNumber, field: 'Check In', message: 'Invalid date' }); }
      try { checkOut = parseExcelDateOnly(value(row, 'checkOut'), `Check Out row ${rowNumber}`); } catch { errors.push({ row: rowNumber, field: 'Check Out', message: 'Invalid date' }); }
      const number = (field: string, fallback: number, minimum: number) => { const raw = text(row, field); if (!raw) return fallback; const parsed = Number(raw); if (!Number.isInteger(parsed) || parsed < minimum) { errors.push({ row: rowNumber, field, message: `Must be an integer of at least ${minimum}` }); return fallback; } return parsed; };
      const adults = number('adults', 1, 1); const children = number('children', 0, 0); const externalReference = text(row, 'externalReference');
      const signature = externalReference ? `ref:${externalReference.toLowerCase()}` : `${guestName.toLowerCase()}|${roomTypeId ?? roomLabel.toLowerCase()}|${checkIn?.toISOString() ?? ''}|${checkOut?.toISOString() ?? ''}`;
      if (seen.has(signature)) errors.push({ row: rowNumber, field: 'Guest', message: 'Duplicate rooming-list row' }); else seen.add(signature);
      if (!roomTypeId || !checkIn || !checkOut || !guestName) continue;
      const entry = { guestName, roomTypeId, checkIn: toDateOnly(checkIn), checkOut: toDateOnly(checkOut), adults, children, mobile: text(row, 'mobile') || undefined, email: text(row, 'email') || undefined, specialRequest: text(row, 'specialRequest') || undefined, externalReference: externalReference || undefined } as RoomingListEntryDto;
      try { await this.validateEntry(group, entry); if (this.existingRoomingDuplicate(group, entry)) errors.push({ row: rowNumber, field: 'Guest', message: 'Duplicate of existing rooming-list entry' }); entries.push(entry); } catch (reason) { errors.push({ row: rowNumber, field: 'Stay', message: reason instanceof Error ? reason.message : 'Invalid stay dates' }); }
    }
    if (!errors.length) { try { const validated = []; for (const entry of entries) validated.push({ entry, valid: await this.validateEntry(group, entry) }); this.validateRoomingCapacity(group, validated); } catch (reason) { errors.push({ row: 0, field: 'Capacity', message: reason instanceof Error ? reason.message : 'Rooming list exceeds the remaining block' }); } }
    const invalidRows = new Set(errors.map((item) => item.row));
    if (invalidRows.has(0)) for (let row = 1; row <= rowsRead; row += 1) invalidRows.add(row);
    const preview = { rowsRead, rowsValid: Math.max(0, rowsRead - invalidRows.size), rowsInvalid: invalidRows.size, rowsImported: 0, committed: false, errors };
    if (errors.length || !commit) return preview;
    await this.p.groupRoomingListEntry.createMany({ data: entries.map((entry) => ({ groupReservationId: id, roomTypeId: entry.roomTypeId, guestName: entry.guestName.trim(), mobile: entry.mobile?.trim(), email: entry.email?.trim().toLowerCase(), checkIn: this.date(entry.checkIn, 'checkIn'), checkOut: this.date(entry.checkOut, 'checkOut'), adults: entry.adults, children: entry.children, specialRequest: entry.specialRequest?.trim(), externalReference: entry.externalReference?.trim(), status: 'READY' })) });
    return { ...preview, rowsImported: entries.length, committed: true, group: await this.detail(userId, id) };
  }

  async pickup(userId: string, groupId: string, entryId: string, body: PickupDto) {
    const { scope } = await this.findScoped(userId, groupId, true); return serializable(this.p, async (tx) => {
      const locked = await tx.$queryRaw<{ id: string; reservationId: string | null }[]>(Prisma.sql`SELECT id, "reservationId" FROM public."GroupRoomingListEntry" WHERE id = ${entryId} AND "groupReservationId" = ${groupId} FOR UPDATE`);
      if (!locked.length) throw new NotFoundException('Rooming-list entry not found.');
      const entry = await tx.groupRoomingListEntry.findUnique({ where: { id: entryId }, include: { groupReservation: true, roomType: true } }); if (!entry) throw new NotFoundException('Rooming-list entry not found.'); if (entry.reservationId) return tx.reservation.findUniqueOrThrow({ where: { id: entry.reservationId }, include: { lines: true } }); if (entry.status !== 'READY') throw new BadRequestException('Only READY rooming-list entries can create reservations.');
      const group = entry.groupReservation; if (scope.hotelId && group.hotelId !== scope.hotelId) throw new ForbiddenException('You cannot access another hotel.'); if (!['CONFIRMED', 'IN_HOUSE'].includes(group.status)) throw new BadRequestException('Confirm the group before creating pickup reservations.');
      const nights = eachNight(entry.checkIn, entry.checkOut); const allocation = await this.lockAndAllocateGroupPickup(tx, groupId, entry.roomTypeId, nights); const rows = await this.lockInventory(tx, entry.roomTypeId, nights); for (const night of nights) { const row = rows.find((candidate: any) => toDateOnly(candidate.date) === toDateOnly(night)); if (!row) throw new ConflictException(`Inventory is not configured for ${toDateOnly(night)}.`); }
      const email = entry.email?.trim().toLowerCase() || group.primaryContactEmail?.trim().toLowerCase() || `${group.groupCode.toLowerCase()}@group.invalid`;
      const mobile = entry.mobile?.trim() || group.primaryContactMobile.trim();
      const normalizedEmail = normalizeGuestEmail(email); const normalizedMobile = normalizeGuestMobile(mobile);
      const existingProfiles = await tx.guestProfile.findMany({ where: { OR: [...(normalizedMobile ? [{ normalizedMobile }] : []), ...(normalizedEmail ? [{ normalizedEmail }] : [])] }, select: { id: true, normalizedMobile: true, normalizedEmail: true } });
      const mobileProfile = normalizedMobile ? existingProfiles.find((profile) => profile.normalizedMobile === normalizedMobile) : undefined; const emailProfile = normalizedEmail ? existingProfiles.find((profile) => profile.normalizedEmail === normalizedEmail) : undefined;
      if (mobileProfile && emailProfile && mobileProfile.id !== emailProfile.id) throw new ConflictException('Guest contact matches multiple guest profiles.');
      const guestProfileId = (mobileProfile ?? emailProfile)?.id ?? (normalizedMobile || normalizedEmail ? (await tx.guestProfile.create({ data: { displayName: entry.guestName.trim(), mobile, email, normalizedMobile, normalizedEmail, preferredHotelId: group.hotelId } })).id : null);
      const corporateAccount = group.corporateId ? await tx.corporateAccount.findFirst({ where: { id: group.corporateId, active: true, hotels: { some: { hotelId: group.hotelId, active: true } } }, select: { id: true, name: true, legalName: true, gstin: true, creditDays: true, creditLimit: true } }) : null;
      if (group.corporateId && !corporateAccount) throw new BadRequestException('Corporate account is no longer active for this hotel.');
      const quoteRatePlanId = allocation.ratePlanId ?? (await tx.ratePlan.findFirst({ where: { roomTypeId: entry.roomTypeId, active: true }, orderBy: { code: 'asc' }, select: { id: true } }))?.id ?? '';
      const quote = await this.availability.quoteSelection(tx, { hotelId: group.hotelId, roomTypeId: entry.roomTypeId, ratePlanId: quoteRatePlanId, checkIn: toDateOnly(entry.checkIn), checkOut: toDateOnly(entry.checkOut), rooms: 1, adults: entry.adults, children: entry.children, source: group.source, corporateAccountId: group.corporateId ?? undefined }, { checkInventory: false, agentId: group.agentId ?? undefined, channel: group.source, corporateAccountId: group.corporateId ?? undefined, actor: { id: userId, role: scope.role } });
      const bookingCreatedAt = new Date(); const reference = `RW-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`; const reservation = await tx.reservation.create({ data: { reference, hotelId: group.hotelId, source: group.source, sourceName: `Group ${group.groupCode}`, status: 'CONFIRMED', paymentStatus: 'UNPAID', syncStatus: 'PENDING', guestName: entry.guestName, guestProfileId: guestProfileId ?? undefined, email, mobile, checkIn: entry.checkIn, checkOut: entry.checkOut, totalAmount: quote.total, taxAmount: quote.taxTotal, balanceAmount: quote.total, priceSnapshot: [{ roomTypeId: quote.roomTypeId, ratePlanId: quote.ratePlanId, priceSource: quote.priceSource, total: quote.total, tax: quote.taxTotal, breakdown: quote.priceBreakdown }], policySnapshot: { policySource: 'group-rooming-list', groupCode: group.groupCode, capturedAt: bookingCreatedAt.toISOString() }, corporateSnapshot: corporateAccount ? { account: { id: corporateAccount.id, name: corporateAccount.name, legalName: corporateAccount.legalName, gstin: corporateAccount.gstin, creditDays: corporateAccount.creditDays, creditLimit: corporateAccount.creditLimit ? Number(corporateAccount.creditLimit) : null }, agreements: (quote.priceBreakdown as any[]).map((night: any) => night.corporateRateAgreement).filter(Boolean), capturedAt: bookingCreatedAt.toISOString() } : undefined, specialRequest: entry.specialRequest, billingInstruction: group.billingInstruction, corporateAccountId: group.corporateId, groupReservationId: groupId, createdById: userId, lines: { create: { roomTypeId: entry.roomTypeId, ratePlanId: quote.ratePlanId, checkIn: entry.checkIn, checkOut: entry.checkOut, rooms: 1, adults: entry.adults, children: entry.children, nightlyRate: Number(quote.total) / Math.max(1, quote.nights), taxAmount: quote.taxTotal, lineTotal: quote.total, priceSnapshot: quote.priceBreakdown as Prisma.InputJsonValue, nights: { create: quote.priceBreakdown.map((night: any) => ({ date: this.date(night.date, 'date'), rooms: 1, amount: Number(night.baseAmount ?? night.totalAmount ?? 0), taxAmount: Number(night.taxAmount ?? 0), totalAmount: Number(night.totalAmount ?? 0) })) } } } }, include: { lines: { include: { nights: true, roomType: true, ratePlan: true } }, hotel: true } });
      for (const night of nights) { const row = rows.find((candidate: any) => toDateOnly(candidate.date) === toDateOnly(night))!; await tx.inventoryDay.update({ where: { id: row.id }, data: { groupBlocked: { decrement: 1 }, sold: { increment: 1 }, version: { increment: 1 } } }); }
      await tx.groupRoomingListEntry.update({ where: { id: entry.id }, data: { reservationId: reservation.id, status: 'RESERVATION_CREATED', errorMessage: null } }); await tx.auditLog.create({ data: { actorUserId: userId, action: 'GROUP_PICKUP_RESERVATION_CREATED', entityType: 'Reservation', entityId: reservation.id, after: { reference, groupId, roomingListEntryId: entry.id } } }); await tx.outboxJob.create({ data: { type: 'AXIS_BOOKING_PUSH', aggregateType: 'Reservation', aggregateId: reservation.id, idempotencyKey: `axis:booking:${reservation.id}:v${reservation.version}`, payload: { reservationId: reservation.id, version: reservation.version } } }); return reservation;
    });
  }

  async bulkPickup(userId: string, id: string, entryIds: BulkPickupDto['entryIds']) {
    await this.findScoped(userId, id, true);
    const uniqueIds = [...new Set(entryIds)].slice(0, 100);
    const results: { entryId: string; status: 'created' | 'already_created' | 'failed'; reservationId?: string; reference?: string; message?: string }[] = [];
    for (const entryId of uniqueIds) {
      try {
        const before = await this.p.groupRoomingListEntry.findFirst({ where: { id: entryId, groupReservationId: id }, select: { reservationId: true } });
        const reservation: any = await this.pickup(userId, id, entryId, {});
        results.push({ entryId, status: before?.reservationId ? 'already_created' : 'created', reservationId: reservation.id, reference: reservation.reference });
      } catch (reason) {
        results.push({ entryId, status: 'failed', message: reason instanceof Error ? reason.message : 'Pickup failed' });
      }
    }
    return { results, summary: { requested: uniqueIds.length, created: results.filter((item) => item.status === 'created').length, alreadyCreated: results.filter((item) => item.status === 'already_created').length, failed: results.filter((item) => item.status === 'failed').length } };
  }

  private async lockInventory(tx: Prisma.TransactionClient, roomTypeId: string, dates: Date[]) {
    if (!dates.length) return [];
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    return tx.$queryRaw<any[]>(Prisma.sql`SELECT id, "roomTypeId", date, available, held, sold, "groupBlocked", "stopSell" FROM public."InventoryDay" WHERE "roomTypeId" = ${roomTypeId} AND date >= ${sorted[0]}::date AND date <= ${sorted[sorted.length - 1]}::date ORDER BY date FOR UPDATE`);
  }
}

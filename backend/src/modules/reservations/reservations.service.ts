import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolioChargeCategory, Prisma, ReservationStatus, RoomOperationalStatus, StayStatus, SyncStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { HoldsService } from '../holds/holds.service';
import { CancellationDto, CheckInDto, CheckOutDto, CreateReservationDto, FolioChargeDto, ModificationDto, ReservationListQueryDto, RoomChangeDto, VoidFolioChargeDto } from './reservations.dto';
import { parseDateOnly, todayUtc, toDateOnly } from '../../common/dates';
import { sha256 } from '../../common/security';
import { serializable } from '../../common/transactions';
import { assertReservationTransition } from './reservation-state';
import { RateResolverService } from '../availability/rate-resolver';
import { calculateAgentBookingPaymentTerms, calculateReservationPaymentSchedule } from '../../common/agent-payment-terms';

@Injectable()
export class ReservationsService {
  constructor(private p: PrismaService, private holds: HoldsService, private audit: AuditService, private readonly rateResolver: RateResolverService) {}

  private operationalRoles = ['SUPER_ADMIN', 'ADMIN', 'RESERVATION'];

  private assertOperationalRole(role?: string) {
    if (!this.operationalRoles.includes(role ?? '')) throw new ForbiddenException('Front-office permission is required for this action.');
  }

  async availableRooms(reference: string) {
    const reservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true, reference: true, hotelId: true, checkIn: true, checkOut: true, hotel: { select: { id: true, name: true } }, lines: { select: { id: true, rooms: true, roomType: { select: { id: true, name: true } } } } } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    const requirements = await Promise.all(reservation.lines.map(async (line) => {
      const rooms = await this.p.room.findMany({
        where: { hotelId: reservation.hotelId, roomTypeId: line.roomType.id, active: true, status: RoomOperationalStatus.AVAILABLE, assignments: { none: { unassignedAt: null, reservationId: { not: reservation.id }, reservation: { checkIn: { lt: reservation.checkOut }, checkOut: { gt: reservation.checkIn } } } } },
        select: { id: true, roomNumber: true, floor: true, wing: true, status: true }, orderBy: { roomNumber: 'asc' },
      });
      return { reservationLineId: line.id, roomType: line.roomType, requiredRooms: line.rooms, availableRooms: rooms };
    }));
    return { reservation: { id: reservation.id, reference: reservation.reference, hotel: reservation.hotel, checkIn: reservation.checkIn, checkOut: reservation.checkOut }, requirements };
  }

  async checkIn(reference: string, body: CheckInDto, user: { id: string; role?: string }) {
    this.assertOperationalRole(user.role);
    return serializable(this.p, async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { reference }, include: { hotel: { select: { id: true, name: true } }, lines: { include: { roomType: { select: { id: true, name: true } } } }, roomAssignments: { where: { unassignedAt: null }, include: { room: true } } } });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (!([ReservationStatus.CONFIRMED, ReservationStatus.MODIFIED] as ReservationStatus[]).includes(reservation.status)) throw new BadRequestException('Only confirmed or modified reservations can be checked in.');
      if (reservation.stayStatus !== StayStatus.EXPECTED) throw new ConflictException('This stay has already been checked in or completed.');
      if (toDateOnly(reservation.checkIn) !== toDateOnly(todayUtc())) throw new BadRequestException('Check-in is allowed on the scheduled arrival date only.');
      const expected = new Map(reservation.lines.map((line) => [line.id, line.rooms]));
      if (!Array.isArray(body.assignments) || body.assignments.length !== reservation.lines.reduce((sum, line) => sum + line.rooms, 0)) throw new BadRequestException('Assign exactly one physical room for each booked room.');
      const roomIds = body.assignments.map((item) => item.roomId);
      if (new Set(roomIds).size !== roomIds.length) throw new BadRequestException('A physical room cannot be assigned twice.');
      const counts = new Map<string, number>();
      for (const item of body.assignments) {
        if (!expected.has(item.reservationLineId)) throw new BadRequestException('Assignment contains an invalid reservation line.');
        counts.set(item.reservationLineId, (counts.get(item.reservationLineId) ?? 0) + 1);
      }
      for (const [lineId, required] of expected) if ((counts.get(lineId) ?? 0) !== required) throw new BadRequestException('Room assignments do not match the booked room quantities.');
      const rooms = await tx.room.findMany({ where: { id: { in: roomIds } }, include: { assignments: { where: { unassignedAt: null }, include: { reservation: { select: { id: true, checkIn: true, checkOut: true } } } } } });
      if (rooms.length !== roomIds.length) throw new BadRequestException('One or more selected rooms do not exist.');
      const roomMap = new Map(rooms.map((room) => [room.id, room]));
      for (const item of body.assignments) {
        const room = roomMap.get(item.roomId)!;
        const line = reservation.lines.find((candidate) => candidate.id === item.reservationLineId)!;
        if (room.hotelId !== reservation.hotelId || room.roomTypeId !== line.roomTypeId) throw new BadRequestException('Selected room does not belong to the reservation hotel and room type.');
        if (!room.active || room.status !== RoomOperationalStatus.AVAILABLE) throw new ConflictException(`Room ${room.roomNumber} is not available.`);
        if (room.assignments.some((assignment) => assignment.reservationId !== reservation.id && assignment.reservation.checkIn < reservation.checkOut && assignment.reservation.checkOut > reservation.checkIn)) throw new ConflictException(`Room ${room.roomNumber} is already assigned for overlapping dates.`);
      }
      const now = new Date();
      for (const item of body.assignments) {
        await tx.reservationRoomAssignment.create({ data: { reservationId: reservation.id, reservationLineId: item.reservationLineId, roomId: item.roomId, assignedById: user.id, assignedAt: now } });
        await tx.room.update({ where: { id: item.roomId }, data: { status: RoomOperationalStatus.OCCUPIED } });
      }
      const updated = await tx.reservation.update({ where: { id: reservation.id }, data: { stayStatus: StayStatus.CHECKED_IN, checkedInAt: now, checkedInById: user.id }, include: { roomAssignments: { where: { unassignedAt: null }, include: { room: { select: { id: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } } } } }, checkedInBy: { select: { id: true, name: true } } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'GUEST_CHECKED_IN', entityType: 'Reservation', entityId: reservation.id, after: { reference, hotelId: reservation.hotelId, rooms: updated.roomAssignments.map((assignment) => assignment.room.roomNumber), note: body.note?.trim() || null } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'ROOM_ASSIGNED', entityType: 'Reservation', entityId: reservation.id, after: { reference, roomIds } } });
      return this.stayLifecycleResult(updated);
    });
  }

  async roomChange(reference: string, body: RoomChangeDto, user: { id: string; role?: string }) {
    this.assertOperationalRole(user.role);
    const reason = body.reason.trim();
    return serializable(this.p, async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { reference }, include: { roomAssignments: { where: { unassignedAt: null }, include: { room: true } }, hotel: { select: { id: true, name: true } } } });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.stayStatus !== StayStatus.CHECKED_IN) throw new BadRequestException('Room changes are only available for checked-in stays.');
      const current = reservation.roomAssignments.find((item) => item.id === body.assignmentId);
      if (!current) throw new NotFoundException('Active room assignment not found.');
      if (current.roomId === body.newRoomId) throw new BadRequestException('Choose a different replacement room.');
      const target = await tx.room.findUnique({ where: { id: body.newRoomId }, include: { assignments: { where: { unassignedAt: null }, include: { reservation: { select: { id: true, checkIn: true, checkOut: true } } } }, roomType: { select: { id: true, name: true } } } });
      if (!target || target.hotelId !== reservation.hotelId || target.roomTypeId !== current.room.roomTypeId) throw new BadRequestException('Replacement room must belong to the same hotel and room type.');
      if (!target.active || target.status !== RoomOperationalStatus.AVAILABLE) throw new ConflictException(`Room ${target.roomNumber} is not available.`);
      if (target.assignments.some((assignment) => assignment.reservationId !== reservation.id && assignment.reservation.checkIn < reservation.checkOut && assignment.reservation.checkOut > reservation.checkIn)) throw new ConflictException(`Room ${target.roomNumber} is already assigned for overlapping dates.`);
      const now = new Date();
      await tx.reservationRoomAssignment.update({ where: { id: current.id }, data: { unassignedAt: now, unassignedById: user.id, reason } });
      await tx.room.update({ where: { id: current.roomId }, data: { status: RoomOperationalStatus.DIRTY } });
      const next = await tx.reservationRoomAssignment.create({ data: { reservationId: reservation.id, reservationLineId: current.reservationLineId, roomId: target.id, assignedById: user.id, assignedAt: now, reason } });
      await tx.room.update({ where: { id: target.id }, data: { status: RoomOperationalStatus.OCCUPIED } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'ROOM_CHANGED', entityType: 'ReservationRoomAssignment', entityId: next.id, after: { reference, oldRoom: current.room.roomNumber, newRoom: target.roomNumber, reason } } });
      return this.getLifecycle(reference, tx);
    });
  }

  async checkOut(reference: string, body: CheckOutDto, user: { id: string; role?: string }) {
    this.assertOperationalRole(user.role);
    return serializable(this.p, async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { reference }, include: { roomAssignments: { where: { unassignedAt: null }, include: { room: true } }, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } } } });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (reservation.stayStatus !== StayStatus.CHECKED_IN) throw new BadRequestException('Only checked-in stays can be checked out.');
      const totalOutstanding = Number(reservation.balanceAmount) + reservation.folioCharges.reduce((sum, charge) => sum + Number(charge.totalAmount), 0);
      if (totalOutstanding > 0.005 && !body.force) throw new ConflictException({ code: 'OUTSTANDING_BALANCE', message: `Outstanding balance is INR ${totalOutstanding.toFixed(2)}. Confirm checkout to continue.`, totalOutstanding });
      const now = new Date();
      for (const assignment of reservation.roomAssignments) await tx.room.update({ where: { id: assignment.roomId }, data: { status: RoomOperationalStatus.DIRTY } });
      await tx.reservationRoomAssignment.updateMany({ where: { reservationId: reservation.id, unassignedAt: null }, data: { unassignedAt: now, unassignedById: user.id, reason: body.note?.trim() || 'Guest checked out' } });
      const updated = await tx.reservation.update({ where: { id: reservation.id }, data: { stayStatus: StayStatus.CHECKED_OUT, checkedOutAt: now, checkedOutById: user.id }, include: { checkedOutBy: { select: { id: true, name: true } } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'GUEST_CHECKED_OUT', entityType: 'Reservation', entityId: reservation.id, after: { reference, rooms: reservation.roomAssignments.map((assignment) => assignment.room.roomNumber), totalOutstanding, note: body.note?.trim() || null } } });
      return { reference: updated.reference, stayStatus: updated.stayStatus, checkedOutAt: updated.checkedOutAt, checkedOutBy: updated.checkedOutBy, totalOutstanding };
    });
  }

  async inHouse(hotelId?: string) {
    const rows = await this.p.reservation.findMany({ where: { stayStatus: StayStatus.CHECKED_IN, hotelId: hotelId || undefined }, orderBy: [{ hotel: { name: 'asc' } }, { guestName: 'asc' }], include: { hotel: { select: { id: true, name: true } }, checkedInBy: { select: { id: true, name: true } }, lines: { include: { roomType: { select: { id: true, name: true } } } }, roomAssignments: { where: { unassignedAt: null }, include: { room: { select: { id: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } } } } }, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } } } });
    return rows.map((row) => ({ reference: row.reference, guestName: row.guestName, hotel: row.hotel, arrival: row.checkIn, departure: row.checkOut, stayStatus: row.stayStatus, checkedInAt: row.checkedInAt, checkedInBy: row.checkedInBy, rooms: row.roomAssignments.map((assignment) => assignment.room), roomTypes: [...new Map(row.lines.map((line) => [line.roomType.id, line.roomType.name])).values()], pax: row.lines.reduce((sum, line) => sum + line.adults + line.children, 0), balance: Number(row.balanceAmount), incidentals: row.folioCharges.reduce((sum, charge) => sum + Number(charge.totalAmount), 0), totalOutstanding: Number(row.balanceAmount) + row.folioCharges.reduce((sum, charge) => sum + Number(charge.totalAmount), 0) }));
  }

  private stayLifecycleResult(row: any) {
    return { reference: row.reference, stayStatus: row.stayStatus, checkedInAt: row.checkedInAt, checkedInBy: row.checkedInBy, rooms: (row.roomAssignments ?? []).map((assignment: any) => assignment.room) };
  }

  private async getLifecycle(reference: string, client: Prisma.TransactionClient | PrismaService = this.p) {
    const row = await client.reservation.findUnique({ where: { reference }, include: { checkedInBy: { select: { id: true, name: true } }, checkedOutBy: { select: { id: true, name: true } }, roomAssignments: { where: { unassignedAt: null }, include: { room: { select: { id: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } } } } } } });
    if (!row) throw new NotFoundException('Reservation not found');
    return { ...this.stayLifecycleResult(row), checkedOutAt: row.checkedOutAt, checkedOutBy: row.checkedOutBy };
  }

  private reference() { return `RW-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`; }

  async createFromHold(token: string, body: CreateReservationDto, user?: { id: string; role?: string }) {
    return serializable(this.p, async (tx) => {
      const hold = await tx.inventoryHold.findUnique({ where: { tokenHash: sha256(token) }, include: { lines: { include: { nights: true } } } });
      if (!hold) throw new BadRequestException('Hold expired or invalid');
      const authorizedAdmin = ['SUPER_ADMIN', 'ADMIN', 'RESERVATION'].includes(user?.role ?? '');
      if (hold.agentId && (!user || (user.id !== hold.agentId && !authorizedAdmin))) throw new ForbiddenException('This agent hold belongs to another agent.');
      const lockRows = await this.holds.lockInventoryForLines(tx, hold.lines.map((line) => ({ roomTypeId: line.roomTypeId, checkIn: toDateOnly(line.checkIn), checkOut: toDateOnly(line.checkOut) })));
      const liveHold = await tx.inventoryHold.updateMany({ where: { id: hold.id, status: 'ACTIVE', expiresAt: { gt: new Date() } }, data: { status: 'CONVERTED' } });
      if (liveHold.count !== 1) throw new BadRequestException('Hold expired or already converted');
      const hotelId = hold.hotelId;
      const reservationReference = this.reference();
      const bookingTotal = hold.lines.reduce((sum, line) => sum + Number(line.quotedTotal), 0);
      const bookingCreatedAt = new Date();
      const walletBooking = user?.role === 'AGENT';
      const agent = walletBooking ? await tx.user.findFirst({ where: { id: user.id, role: 'AGENT', active: true }, select: { id: true, agentPaymentPolicy: true, bookingPaymentPercent: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } } } }) : null;
      if (walletBooking && !agent) throw new ForbiddenException('The agent account is not available for booking');
      const paymentTerms = walletBooking ? calculateAgentBookingPaymentTerms(bookingTotal, agent!, hold.lines[0].checkIn, bookingCreatedAt) : null;
      const lineSnapshots = hold.lines.map((line) => ({
        breakdown: Array.isArray(line.quotedBreakdown) ? line.quotedBreakdown as any[] : [],
        agentRatePlanId: Array.isArray(line.quotedBreakdown) ? (line.quotedBreakdown as any[]).find((night) => night.agentRatePlanId)?.agentRatePlanId ?? null : null,
      }));
      let walletDebit: { walletId: string; balanceAfter: any } | undefined;
      if (walletBooking && paymentTerms && paymentTerms.requiredAtBooking > 0) {
        const wallet = await tx.agentWallet.findUnique({ where: { agentId: user.id } });
        if (!wallet || Number(wallet.balance) < paymentTerms.requiredAtBooking) throw new BadRequestException(`Insufficient wallet balance. Required INR ${paymentTerms.requiredAtBooking.toFixed(2)}.`);
        const updatedWallet = await tx.agentWallet.update({ where: { id: wallet.id }, data: { balance: { decrement: paymentTerms.requiredAtBooking } } });
        walletDebit = { walletId: wallet.id, balanceAfter: updatedWallet.balance };
      }
      const agentPaymentStatus = paymentTerms?.requiredAtBooking === 0 ? 'UNPAID' : paymentTerms?.balanceAtBooking === 0 ? 'PAID' : 'PARTIALLY_PAID';
      const reservation = await tx.reservation.create({
        data: {
          reference: reservationReference,
          hotelId,
          source: body.source ?? 'WEBSITE',
          sourceName: body.sourceName ?? (user ? 'Agent booking' : undefined),
          status: walletBooking ? 'CONFIRMED' : 'PENDING_PAYMENT',
          paymentStatus: walletBooking ? agentPaymentStatus : 'UNPAID',
          syncStatus: 'PENDING',
          guestName: body.guestName,
          email: body.email.toLowerCase(),
          mobile: body.mobile,
          address: body.address,
          gstin: body.gstin,
          checkIn: hold.lines[0].checkIn,
          checkOut: hold.lines[0].checkOut,
          totalAmount: hold.lines.reduce((sum, line) => sum + Number(line.quotedTotal), 0),
          taxAmount: hold.lines.reduce((sum, line) => sum + Number(line.quotedTax), 0),
          advanceAmount: walletBooking ? paymentTerms!.requiredAtBooking : 0,
          balanceAmount: walletBooking ? paymentTerms!.balanceAtBooking : bookingTotal,
          priceSnapshot: hold.lines.map((line, index) => ({ roomTypeId: line.roomTypeId, ratePlanId: line.ratePlanId, agentRatePlanId: lineSnapshots[index].agentRatePlanId, priceSource: 'RATE_PLAN', total: Number(line.quotedTotal), tax: Number(line.quotedTax), breakdown: line.quotedBreakdown })),
          policySnapshot: { policySource: 'hold', capturedAt: new Date().toISOString(), freeCancellationHours: 48, firstNightPenalty: true },
          paymentTermsSnapshot: paymentTerms ? { agentId: agent!.id, policy: paymentTerms.policy, percentage: paymentTerms.percentage, bookingTotal, requiredAtBooking: paymentTerms.requiredAtBooking, balanceAtBooking: paymentTerms.balanceAtBooking, milestones: paymentTerms.milestones, capturedAt: bookingCreatedAt.toISOString() } : undefined,
          specialRequest: body.specialRequest,
          billingInstruction: body.billingInstruction,
          internalRemark: body.internalRemark,
          createdById: user?.id,
          ...(walletDebit && paymentTerms && paymentTerms.requiredAtBooking > 0 ? { payments: { create: { amount: paymentTerms.requiredAtBooking, mode: 'WALLET', provider: 'MANUAL', verified: true, verifiedById: user!.id, paidAt: new Date(), reference: `WALLET:${reservationReference}` } } } : {}),
          lines: {
            create: hold.lines.map((line, index) => ({
              roomType: { connect: { id: line.roomTypeId } },
              ratePlan: { connect: { id: line.ratePlanId } },
              checkIn: line.checkIn,
              checkOut: line.checkOut,
              rooms: line.rooms,
              adults: line.adults,
              children: line.children,
              nightlyRate: (lineSnapshots[index].breakdown.length ? lineSnapshots[index].breakdown.reduce((sum, night) => sum + Number(night.baseAmount ?? 0), 0) : Number(line.quotedTotal)) / Math.max(1, line.nights.length),
              taxAmount: line.quotedTax,
              lineTotal: line.quotedTotal,
              priceSnapshot: line.quotedBreakdown as Prisma.InputJsonValue,
              nights: { create: lineSnapshots[index].breakdown.length ? lineSnapshots[index].breakdown.map((night: any) => ({ date: parseDateOnly(night.date, 'date'), rooms: line.rooms, amount: Number(night.baseAmount ?? 0), taxAmount: Number(night.taxAmount ?? 0), totalAmount: Number(night.totalAmount ?? 0) })) : line.nights.map((night: any) => ({ date: night.date, rooms: night.rooms, amount: Number(line.quotedTotal) / Math.max(1, line.nights.length), taxAmount: Number(line.quotedTax) / Math.max(1, line.nights.length), totalAmount: Number(line.quotedTotal) / Math.max(1, line.nights.length) })) },
            })),
          },
        },
        include: { lines: { include: { nights: true, roomType: true, ratePlan: true } }, hotel: true },
      });
      if (walletDebit && paymentTerms) await tx.walletTransaction.create({ data: { walletId: walletDebit.walletId, type: 'BOOKING_DEBIT', amount: -paymentTerms.requiredAtBooking, balanceAfter: walletDebit.balanceAfter, reference: reservation.reference, description: `Booking debit for ${reservation.reference}` } });
      if (walletBooking) await tx.outboxJob.upsert({ where: { idempotencyKey: `voucher:${reservation.id}:v1` }, create: { type: 'GENERATE_VOUCHER', aggregateType: 'Reservation', aggregateId: reservation.id, idempotencyKey: `voucher:${reservation.id}:v1`, payload: { reservationId: reservation.id } }, update: {} });
      for (const line of hold.lines) {
        for (const night of line.nights) {
          const row = lockRows.find((candidate) => candidate.roomTypeId === line.roomTypeId && toDateOnly(candidate.date) === toDateOnly(night.date));
          if (!row || row.held < night.rooms) throw new ConflictException('Held inventory is no longer available');
          await tx.inventoryDay.update({ where: { id: row.id }, data: { held: { decrement: night.rooms }, sold: { increment: night.rooms }, version: { increment: 1 } } });
        }
      }
      await tx.inventoryHold.update({ where: { id: hold.id }, data: { convertedReservationId: reservation.id } });
      await tx.outboxJob.create({ data: { type: 'AXIS_BOOKING_PUSH', aggregateType: 'Reservation', aggregateId: reservation.id, idempotencyKey: `axis:booking:${reservation.id}:v${reservation.version}`, payload: { reservationId: reservation.id, version: reservation.version } } });
      await tx.auditLog.create({ data: { actorUserId: user?.id, action: 'RESERVATION_CREATED', entityType: 'Reservation', entityId: reservation.id, after: { reference: reservation.reference, source: reservation.source } } });
      return reservation;
    });
  }

  async list(query: ReservationListQueryDto) {
    const page = Math.max(1, Number(query.page));
    const limit = Math.min(100, Math.max(1, Number(query.limit)));
    const where: any = { status: query.status as ReservationStatus | undefined };
    if (query.from || query.to) where.checkIn = { gte: query.from ? parseDateOnly(query.from, 'from') : undefined, lt: query.to ? parseDateOnly(query.to, 'to') : undefined };
    const [items, total] = await Promise.all([
      this.p.reservation.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { hotel: true, payments: true, lines: { include: { roomType: true, ratePlan: true } } } }),
      this.p.reservation.count({ where }),
    ]);
    return { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async listForUser(userId: string) {
    const rows = await this.p.reservation.findMany({ where: { createdById: userId }, orderBy: { createdAt: 'desc' }, take: 100, include: { payments: { select: { amount: true, verified: true } }, hotel: { select: { name: true, city: true } }, lines: { select: { roomType: { select: { name: true } }, ratePlan: { select: { name: true } }, rooms: true } } } });
    return rows.map(({ payments, ...row }) => ({ ...row, paymentSchedule: this.paymentSchedule(row.paymentTermsSnapshot, payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + Number(payment.amount), 0)) }));
  }

  async listRatePlansForUser(userId: string, from?: string, to?: string) {
    const today = new Date(); today.setUTCHours(0, 0, 0, 0);
    const start = from ? parseDateOnly(from, 'from') : today;
    const end = to ? parseDateOnly(to, 'to') : undefined;
    if (end && end < start) throw new BadRequestException('to must be on or after from');
    if (end && end.getTime() - start.getTime() > 370 * 86_400_000) throw new BadRequestException('Rate plan date ranges cannot exceed 371 days');
    const dateFilter = { date: { gte: start, ...(end ? { lte: end } : {}) } };
    const take = end ? 371 : 31;
    const assignments = await this.p.agentRatePlan.findMany({ where: { agentId: userId, active: true, ratePlan: { active: true, master: { active: true } } }, orderBy: { ratePlan: { name: 'asc' } }, include: { ratePlan: { include: { roomType: { include: { hotel: { select: { name: true, city: true } } } }, rates: { where: dateFilter, orderBy: { date: 'asc' }, take } } } } });
    return assignments.map((assignment) => ({ id: assignment.ratePlan.id, code: assignment.ratePlan.code, name: assignment.ratePlan.name, mealPlan: assignment.ratePlan.mealPlan, description: assignment.ratePlan.description, hotel: assignment.ratePlan.roomType.hotel, room: { id: assignment.ratePlan.roomType.id, name: assignment.ratePlan.roomType.name, code: assignment.ratePlan.roomType.code }, rates: assignment.ratePlan.rates.map((rate) => ({ ...this.rateResolver.byDate({ assignedAgents: [assignment] }, userId).get(rate), date: rate.date })) }));
  }

  async get(reference: string, full = false, viewerRole?: string) {
    const reservation = await this.p.reservation.findUnique({
      where: { reference },
      include: {
        hotel: true,
        createdBy: { select: { id: true, name: true } },
        reconfirmedBy: { select: { id: true, name: true } },
        checkedInBy: { select: { id: true, name: true } },
        checkedOutBy: { select: { id: true, name: true } },
        roomAssignments: { include: { room: { select: { id: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } } }, assignedBy: { select: { id: true, name: true } }, unassignedBy: { select: { id: true, name: true } } }, orderBy: { assignedAt: 'asc' } },
        lines: { include: { roomType: true, ratePlan: true, nights: { orderBy: { date: 'asc' } } } },
        payments: { select: { id: true, amount: true, mode: true, verified: true, paidAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    const paymentSchedule = this.paymentSchedule(reservation.paymentTermsSnapshot, reservation.payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + Number(payment.amount), 0));
    if (full) {
      const canSeeInternalRemark = ['SUPER_ADMIN', 'ADMIN', 'RESERVATION'].includes(viewerRole ?? '');
      const businessType = reservation.source === 'AGENT' || reservation.source === 'COMPANY' ? 'B2B' : reservation.source === 'OTA' ? 'OTA' : 'B2C';
      return {
        id: reservation.id,
        reference: reservation.reference,
        status: reservation.status,
        stayStatus: reservation.stayStatus,
        paymentStatus: reservation.paymentStatus,
        syncStatus: reservation.syncStatus,
        guestName: reservation.guestName,
        email: reservation.email,
        mobile: reservation.mobile,
        address: reservation.address,
        gstin: reservation.gstin,
        source: reservation.source,
        sourceName: reservation.sourceName,
        businessType,
        checkIn: reservation.checkIn,
        checkOut: reservation.checkOut,
        currency: reservation.currency,
        totalAmount: reservation.totalAmount,
        taxAmount: reservation.taxAmount,
        advanceAmount: reservation.advanceAmount,
        balanceAmount: reservation.balanceAmount,
        specialRequest: reservation.specialRequest,
        billingInstruction: reservation.billingInstruction,
        ...(canSeeInternalRemark ? { internalRemark: reservation.internalRemark } : {}),
        createdAt: reservation.createdAt,
        createdBy: reservation.createdBy,
        reconfirmedAt: reservation.reconfirmedAt,
        reconfirmedBy: reservation.reconfirmedBy,
        checkedInAt: reservation.checkedInAt,
        checkedInBy: reservation.checkedInBy,
        checkedOutAt: reservation.checkedOutAt,
        checkedOutBy: reservation.checkedOutBy,
        roomAssignments: (reservation.roomAssignments ?? []).map((assignment) => ({ id: assignment.id, room: assignment.room, assignedAt: assignment.assignedAt, assignedBy: assignment.assignedBy, unassignedAt: assignment.unassignedAt, unassignedBy: assignment.unassignedBy, reason: assignment.reason })),
        hotel: { id: reservation.hotel.id, name: reservation.hotel.name, slug: reservation.hotel.slug, city: reservation.hotel.city },
        lines: reservation.lines.map((line) => ({
          roomType: { id: line.roomType.id, name: line.roomType.name },
          ratePlan: { id: line.ratePlan.id, name: line.ratePlan.name },
          checkIn: line.checkIn,
          checkOut: line.checkOut,
          rooms: line.rooms,
          adults: line.adults,
          children: line.children,
          nightlyRate: line.nightlyRate,
          taxAmount: line.taxAmount,
          lineTotal: line.lineTotal,
          nights: line.nights.map((night) => ({ date: night.date, rooms: night.rooms, amount: night.amount, taxAmount: night.taxAmount, totalAmount: night.totalAmount })),
        })),
        payments: reservation.payments.map((payment) => ({ id: payment.id, amount: payment.amount, mode: payment.mode, verified: payment.verified, paidAt: payment.paidAt, createdAt: payment.createdAt })),
        paymentSchedule,
      };
    }
    return { id: reservation.id, reference: reservation.reference, status: reservation.status, paymentStatus: reservation.paymentStatus, syncStatus: reservation.syncStatus, guestName: reservation.guestName, checkIn: reservation.checkIn, checkOut: reservation.checkOut, currency: reservation.currency, totalAmount: reservation.totalAmount, advanceAmount: reservation.advanceAmount, balanceAmount: reservation.balanceAmount, hotel: { name: reservation.hotel.name, slug: reservation.hotel.slug, city: reservation.hotel.city }, lines: reservation.lines.map((line) => ({ roomType: line.roomType.name, ratePlan: line.ratePlan.name, rooms: line.rooms, adults: line.adults, children: line.children, checkIn: line.checkIn, checkOut: line.checkOut })), paymentSchedule };
  }

  private paymentSchedule(snapshot: unknown, verifiedPaid: number) {
    return calculateReservationPaymentSchedule(snapshot, verifiedPaid);
  }

  private assertFolioEligible(status: ReservationStatus) {
    if (['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(status)) throw new BadRequestException('Guest folio charges cannot be posted for this reservation.');
  }

  private async assertStaffFolioEligible(reference: string) {
    const stay = await this.p.reservation.findUnique({ where: { reference }, select: { stayStatus: true } });
    if (stay?.stayStatus !== StayStatus.CHECKED_IN) throw new BadRequestException('This reservation is not eligible for service-staff folio charges.');
  }

  async getFolio(reference: string) {
    const reservation = await this.p.reservation.findUnique({
      where: { reference },
      select: {
        id: true,
        reference: true,
        status: true,
        currency: true,
        totalAmount: true,
        advanceAmount: true,
        balanceAmount: true,
        folioCharges: {
          orderBy: [{ postingDate: 'desc' }, { createdAt: 'desc' }],
          include: {
            postedBy: { select: { id: true, name: true } },
            voidedBy: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    const activeCharges = reservation.folioCharges.filter((charge) => charge.status === 'POSTED');
    const incidentalCharges = activeCharges.reduce((sum, charge) => sum + Number(charge.totalAmount), 0);
    const reservationBalance = Number(reservation.balanceAmount);
    return {
      reference: reservation.reference,
      currency: reservation.currency,
      status: reservation.status,
      reservationAmount: Number(reservation.totalAmount),
      reservationPaid: Number(reservation.advanceAmount),
      reservationBalance,
      incidentalPayments: 0,
      incidentalBalance: incidentalCharges,
      totalOutstanding: reservationBalance + incidentalCharges,
      charges: reservation.folioCharges.map((charge) => ({
        id: charge.id,
        category: charge.category,
        description: charge.description,
        quantity: Number(charge.quantity),
        unitAmount: Number(charge.unitAmount),
        taxableAmount: Number(charge.taxableAmount),
        taxAmount: Number(charge.taxAmount),
        totalAmount: Number(charge.totalAmount),
        postingDate: charge.postingDate,
        note: charge.note,
        status: charge.status,
        postedBy: charge.postedBy,
        voidedAt: charge.voidedAt,
        voidedBy: charge.voidedBy,
        voidReason: charge.voidReason,
        createdAt: charge.createdAt,
      })),
      totals: {
        reservationAmount: Number(reservation.totalAmount),
        reservationPaid: Number(reservation.advanceAmount),
        reservationBalance,
        incidentalCharges,
        incidentalPayments: 0,
        incidentalBalance: incidentalCharges,
        totalOutstanding: reservationBalance + incidentalCharges,
      },
    };
  }

  async postFolioCharge(reference: string, body: FolioChargeDto, user: { id: string }, options?: { postingDate?: Date; allowedCategories?: readonly FolioChargeCategory[]; staffOnly?: boolean; idempotencyKey?: string }) {
    const reservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true, reference: true, status: true, hotelId: true, hotel: { select: { id: true, name: true } } } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (options?.staffOnly) await this.assertStaffFolioEligible(reference);
    else this.assertFolioEligible(reservation.status);
    if (!Object.values(FolioChargeCategory).includes(body.category)) throw new BadRequestException('Invalid folio charge category');
    if (options?.allowedCategories && !options.allowedCategories.includes(body.category)) throw new ForbiddenException('Your department cannot post this folio category.');
    const description = String(body.description ?? '').trim();
    const quantity = Number(body.quantity);
    const unitAmount = Number(body.unitAmount);
    if (description.length < 2) throw new BadRequestException('description must contain at least 2 characters');
    if (!Number.isFinite(quantity) || quantity <= 0) throw new BadRequestException('quantity must be greater than zero');
    if (!Number.isFinite(unitAmount) || unitAmount < 0) throw new BadRequestException('unitAmount must be zero or greater');
    const postingDate = options?.postingDate ?? parseDateOnly(String(body.postingDate ?? ''), 'postingDate');
    const quantityDecimal = new Prisma.Decimal(quantity.toFixed(2));
    const unitAmountDecimal = new Prisma.Decimal(unitAmount.toFixed(2));
    const totalAmount = quantityDecimal.mul(unitAmountDecimal);
    if (options?.idempotencyKey) {
      const existing = await this.p.reservationFolioCharge.findUnique({ where: { idempotencyKey: options.idempotencyKey }, select: { id: true, reservationId: true } });
      if (existing) {
        if (existing.reservationId !== reservation.id) throw new BadRequestException('This idempotency key was already used for another reservation.');
        return this.getFolio(reference);
      }
    }
    let charge;
    try {
      charge = await this.p.reservationFolioCharge.create({
        data: {
          reservation: { connect: { id: reservation.id } },
          category: body.category,
          description,
          quantity: quantityDecimal,
          unitAmount: unitAmountDecimal,
          taxableAmount: totalAmount,
          taxAmount: new Prisma.Decimal(0),
          totalAmount,
          postingDate,
          note: body.note?.trim() || null,
          idempotencyKey: options?.idempotencyKey,
          postedBy: { connect: { id: user.id } },
        },
        select: { id: true, totalAmount: true },
      });
    } catch (error: any) {
      if (options?.idempotencyKey && error?.code === 'P2002') return this.getFolio(reference);
      throw error;
    }
    await this.audit.log({ actorUserId: user.id, action: 'FOLIO_CHARGE_POSTED', entityType: 'ReservationFolioCharge', entityId: charge.id, after: { reference, reservationId: reservation.id, hotelId: reservation.hotelId, hotel: reservation.hotel?.name, category: body.category, description, quantity, unitAmount, totalAmount: Number(charge.totalAmount) } });
    return this.getFolio(reference);
  }

  async voidFolioCharge(reference: string, chargeId: string, body: VoidFolioChargeDto, user: { id: string }) {
    const reason = String(body.reason ?? '').trim();
    if (reason.length < 2) throw new BadRequestException('A void reason is required');
    const charge = await this.p.reservationFolioCharge.findUnique({ where: { id: chargeId }, include: { reservation: { select: { id: true, reference: true } } } });
    if (!charge || charge.reservation.reference !== reference) throw new NotFoundException('Folio charge not found');
    if (charge.status === 'VOIDED') throw new BadRequestException('Folio charge is already voided');
    const updated = await this.p.reservationFolioCharge.update({ where: { id: charge.id }, data: { status: 'VOIDED', voidedAt: new Date(), voidedBy: { connect: { id: user.id } }, voidReason: reason }, select: { id: true, totalAmount: true } });
    await this.audit.log({ actorUserId: user.id, action: 'FOLIO_CHARGE_VOIDED', entityType: 'ReservationFolioCharge', entityId: updated.id, before: { status: 'POSTED', totalAmount: Number(updated.totalAmount) }, after: { reference, status: 'VOIDED', reason, totalAmount: Number(updated.totalAmount) } });
    return this.getFolio(reference);
  }

  async payDueMilestones(reference: string, idempotencyKey: string | undefined, user: { id: string; role: string }) {
    await serializable(this.p, async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { reference }, include: { payments: true, createdBy: { select: { id: true, role: true } } } });
      if (!reservation) throw new NotFoundException('Reservation not found');
      if (user.role !== 'AGENT' || reservation.createdById !== user.id) throw new ForbiddenException('You can only pay milestones for your own reservations.');
      if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reservation.status)) throw new BadRequestException('Reservation is not payable');
      const paid = reservation.payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + Number(payment.amount), 0);
      const existingReference = idempotencyKey ? `MILESTONE:${reservation.id}:${idempotencyKey}` : undefined;
      if (existingReference) {
        const existing = reservation.payments.find((payment) => payment.reference === existingReference && payment.verified);
        if (existing) return reservation.reference;
      }
      const schedule = calculateReservationPaymentSchedule(reservation.paymentTermsSnapshot, paid);
      const dueAmount = schedule.milestones.filter((item) => item.dueNow && item.outstandingAmount > 0.005).reduce((sum, item) => sum + item.outstandingAmount, 0);
      if (dueAmount <= 0.005) throw new BadRequestException('There are no unpaid milestones due right now.');
      const wallet = reservation.createdById ? await tx.agentWallet.findUnique({ where: { agentId: reservation.createdById } }) : null;
      if (!wallet) throw new BadRequestException('Agent wallet not found.');
      const walletUpdate = await tx.agentWallet.updateMany({ where: { id: wallet.id, balance: { gte: dueAmount } }, data: { balance: { decrement: dueAmount } } });
      if (walletUpdate.count !== 1) throw new BadRequestException(`Insufficient wallet balance. Required INR ${dueAmount.toFixed(2)}.`);
      const updatedWallet = await tx.agentWallet.findUniqueOrThrow({ where: { id: wallet.id } });
      const payment = await tx.payment.create({ data: { reservationId: reservation.id, amount: dueAmount, mode: 'WALLET', provider: 'MANUAL', verified: true, verifiedById: user.id, paidAt: new Date(), reference: existingReference ?? `MILESTONE:${reservation.id}:${Date.now()}` } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'BOOKING_DEBIT', amount: -dueAmount, balanceAfter: updatedWallet.balance, reference: reservation.reference, description: `Due milestone payment for ${reservation.reference}` } });
      const paidAfter = paid + dueAmount;
      const balance = Math.max(0, Number(reservation.totalAmount) - paidAfter);
      const paymentStatus = balance <= 0 ? 'PAID' : paidAfter > 0 ? 'PARTIALLY_PAID' : 'UNPAID';
      await tx.reservation.update({ where: { id: reservation.id }, data: { advanceAmount: paidAfter, balanceAmount: balance, paymentStatus, status: balance <= 0 && ['PENDING_PAYMENT', 'TENTATIVE', 'HELD'].includes(reservation.status) ? 'CONFIRMED' : reservation.status } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'RESERVATION_MILESTONE_PAYMENT', entityType: 'Reservation', entityId: reservation.id, after: { agentId: reservation.createdById, reservationId: reservation.id, amount: dueAmount, milestones: schedule.milestones.filter((item) => item.dueNow && item.outstandingAmount > 0.005).map((item) => ({ dueAt: item.dueAt, amount: item.outstandingAmount })) } } });
      return reservation.reference;
    });
    return this.get(reference);
  }

  async cancel(reference: string, body: CancellationDto, user: { id: string }) {
    const current = await this.p.reservation.findUnique({ where: { reference }, select: { id: true } });
    if (!current) throw new NotFoundException('Reservation not found');
    const idempotencyKey = body.idempotencyKey ?? `cancel:${current.id}`;
    return this.p.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id: current.id }, include: { lines: { include: { nights: true } }, payments: true, vouchers: true, createdBy: { select: { id: true, role: true } } } });
      if (!reservation) throw new NotFoundException('Reservation not found');
      const existing = await tx.cancellationRequest.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
      assertReservationTransition(reservation.status, 'CANCELLED');
      const lockRows = await this.holds.lockInventoryForLines(tx, reservation.lines.map((line) => ({ roomTypeId: line.roomTypeId, checkIn: toDateOnly(line.checkIn), checkOut: toDateOnly(line.checkOut) })));
      const hoursBeforeArrival = (reservation.checkIn.getTime() - Date.now()) / 3_600_000;
      const policy = reservation.policySnapshot as any;
      const penalty = hoursBeforeArrival >= Number(policy.freeCancellationHours ?? 48) ? 0 : (policy.firstNightPenalty ? Number(reservation.lines[0]?.nightlyRate ?? 0) : Number(reservation.totalAmount));
      const paid = reservation.payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + Number(payment.amount), 0);
      const refundAmount = Math.max(0, paid - penalty);
      const walletPaid = reservation.payments.filter((payment) => payment.verified && payment.mode === 'WALLET').reduce((sum, payment) => sum + Number(payment.amount), 0);
      const walletRefund = Math.min(walletPaid, refundAmount);
      for (const line of reservation.lines) for (const night of line.nights) {
        const row = lockRows.find((candidate) => candidate.roomTypeId === line.roomTypeId && toDateOnly(candidate.date) === toDateOnly(night.date));
        if (!row || row.sold < night.rooms) throw new ConflictException('Inventory state cannot be restored safely');
        await tx.inventoryDay.update({ where: { id: row.id }, data: { sold: { decrement: night.rooms }, version: { increment: 1 } } });
      }
      const cancellation = await tx.cancellationRequest.create({ data: { reservationId: reservation.id, status: 'COMPLETED', reason: body.reason, idempotencyKey, requestedById: user.id, approvedById: user.id, refundAmount, policyResult: { hoursBeforeArrival, penalty, refundAmount } } });
      let paymentStatus = reservation.paymentStatus;
      if (walletPaid > 0) {
        if (walletRefund > 0) {
          if (!reservation.createdById || reservation.createdBy?.role !== 'AGENT') throw new BadRequestException('Wallet refund owner could not be verified.');
          const wallet = await tx.agentWallet.findUnique({ where: { agentId: reservation.createdById } });
          if (!wallet) throw new BadRequestException('Agent wallet not found for wallet refund.');
          const updatedWallet = await tx.agentWallet.update({ where: { id: wallet.id }, data: { balance: { increment: walletRefund } } });
          await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'BOOKING_REFUND', amount: walletRefund, balanceAfter: updatedWallet.balance, reference: `REFUND:${reservation.id}:${cancellation.id}`, description: `Wallet refund for ${reservation.reference}` } });
          paymentStatus = walletRefund >= walletPaid && walletPaid >= paid ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        }
      } else if (refundAmount > 0) paymentStatus = 'REFUND_PENDING';
      await tx.reservation.update({ where: { id: reservation.id }, data: { status: 'CANCELLED', paymentStatus, syncStatus: 'PENDING', version: { increment: 1 } } });
      await tx.voucher.updateMany({ where: { reservationId: reservation.id, supersededAt: null }, data: { supersededAt: new Date() } });
      await tx.outboxJob.create({ data: { type: 'AXIS_BOOKING_CANCEL', aggregateType: 'Reservation', aggregateId: reservation.id, idempotencyKey: `axis:cancel:${reservation.id}:v${reservation.version + 1}`, payload: { reservationId: reservation.id, cancellationId: cancellation.id } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'RESERVATION_CANCELLED', entityType: 'Reservation', entityId: reservation.id, after: { refundAmount, penalty } } });
      return cancellation;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async modify(reference: string, body: ModificationDto, user: { id: string }) {
    const current = await this.p.reservation.findUnique({ where: { reference }, select: { id: true } });
    if (!current) throw new NotFoundException('Reservation not found');
    if (body.type === 'INVENTORY' || body.type === 'PRICE') throw new BadRequestException('Inventory or price changes require a replacement hold workflow');
    return this.p.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id: current.id } });
      if (!reservation || ['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reservation.status)) throw new BadRequestException('Reservation cannot be modified');
      const idempotencyKey = body.idempotencyKey ?? `modify:${reservation.id}:${reservation.version + 1}`;
      const existing = await tx.reservationModification.findUnique({ where: { idempotencyKey } });
      if (existing) return existing;
      const changes = { guestName: body.guestName ?? reservation.guestName, email: body.email?.toLowerCase() ?? reservation.email, mobile: body.mobile ?? reservation.mobile, address: body.address ?? reservation.address, gstin: body.gstin ?? reservation.gstin, source: body.source ?? reservation.source, sourceName: body.sourceName ?? reservation.sourceName, specialRequest: body.specialRequest ?? reservation.specialRequest, billingInstruction: body.billingInstruction ?? reservation.billingInstruction, internalRemark: body.internalRemark ?? reservation.internalRemark };
      const nextVersion = reservation.version + 1;
      const nextStatus = reservation.status === 'CONFIRMED' ? 'MODIFIED' : reservation.status;
      if (nextStatus !== reservation.status) assertReservationTransition(reservation.status, nextStatus);
      const updated = await tx.reservation.update({ where: { id: reservation.id, version: reservation.version }, data: { ...changes, status: nextStatus, version: nextVersion, syncStatus: 'PENDING' } });
      const modification = await tx.reservationModification.create({ data: { reservationId: reservation.id, fromVersion: reservation.version, toVersion: nextVersion, type: body.type ?? 'GUEST_DETAILS', status: 'APPLIED', changes: { before: { guestName: reservation.guestName, email: reservation.email, mobile: reservation.mobile, address: reservation.address, gstin: reservation.gstin, source: reservation.source, sourceName: reservation.sourceName, specialRequest: reservation.specialRequest, billingInstruction: reservation.billingInstruction, internalRemark: reservation.internalRemark }, after: changes }, priceDifference: 0, idempotencyKey, createdById: user.id } });
      await tx.outboxJob.create({ data: { type: 'AXIS_BOOKING_MODIFY', aggregateType: 'Reservation', aggregateId: reservation.id, idempotencyKey: `axis:modify:${reservation.id}:v${nextVersion}`, payload: { reservationId: reservation.id, version: nextVersion } } });
      await tx.auditLog.create({ data: { actorUserId: user.id, action: 'RESERVATION_MODIFIED', entityType: 'Reservation', entityId: reservation.id, before: { version: reservation.version }, after: { version: nextVersion, changes } } });
      return { reservation: updated, modification };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async setReconfirmation(reference: string, reconfirmed: boolean, user: { id: string }) {
    const reservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true, reference: true, status: true, reconfirmedAt: true, reconfirmedById: true } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (['CANCELLED', 'EXPIRED', 'NO_SHOW'].includes(reservation.status)) throw new BadRequestException('This reservation cannot be reconfirmed');
    const updated = await this.p.reservation.update({
      where: { id: reservation.id },
      data: { reconfirmedAt: reconfirmed ? new Date() : null, reconfirmedById: reconfirmed ? user.id : null },
      select: { reference: true, reconfirmedAt: true, reconfirmedBy: { select: { id: true, name: true } } },
    });
    await this.audit.log({ actorUserId: user.id, action: reconfirmed ? 'RESERVATION_RECONFIRMED' : 'RESERVATION_RECONFIRMATION_CLEARED', entityType: 'Reservation', entityId: reservation.id, before: { reconfirmedAt: reservation.reconfirmedAt, reconfirmedById: reservation.reconfirmedById }, after: { reconfirmedAt: updated.reconfirmedAt, reconfirmedBy: updated.reconfirmedBy } });
    return { reference: updated.reference, reconfirmed: Boolean(updated.reconfirmedAt), reconfirmedAt: updated.reconfirmedAt, reconfirmedBy: updated.reconfirmedBy };
  }
}

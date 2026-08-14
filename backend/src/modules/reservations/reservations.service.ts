import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ReservationStatus, SyncStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { HoldsService } from '../holds/holds.service';
import { CancellationDto, CreateReservationDto, ModificationDto, ReservationListQueryDto } from './reservations.dto';
import { parseDateOnly, toDateOnly } from '../../common/dates';
import { sha256 } from '../../common/security';
import { serializable } from '../../common/transactions';
import { assertReservationTransition } from './reservation-state';

@Injectable()
export class ReservationsService {
  constructor(private p: PrismaService, private holds: HoldsService, private audit: AuditService) {}

  private reference() { return `RW-${new Date().getUTCFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`; }

  async createFromHold(token: string, body: CreateReservationDto, user?: { id: string }) {
    return serializable(this.p, async (tx) => {
      const hold = await tx.inventoryHold.findUnique({ where: { tokenHash: sha256(token) }, include: { lines: { include: { nights: true } } } });
      if (!hold) throw new BadRequestException('Hold expired or invalid');
      const lockRows = await this.holds.lockInventoryForLines(tx, hold.lines.map((line) => ({ roomTypeId: line.roomTypeId, checkIn: toDateOnly(line.checkIn), checkOut: toDateOnly(line.checkOut) })));
      const liveHold = await tx.inventoryHold.updateMany({ where: { id: hold.id, status: 'ACTIVE', expiresAt: { gt: new Date() } }, data: { status: 'CONVERTED' } });
      if (liveHold.count !== 1) throw new BadRequestException('Hold expired or already converted');
      const hotelId = hold.hotelId;
      const reservationReference = this.reference();
      const bookingTotal = hold.lines.reduce((sum, line) => sum + Number(line.quotedTotal), 0);
      let walletDebit: { walletId: string; balanceAfter: any } | undefined;
      if (user) {
        const wallet = await tx.agentWallet.findUnique({ where: { agentId: user.id } });
        if (!wallet || Number(wallet.balance) < bookingTotal) throw new BadRequestException(`Insufficient wallet balance. Required INR ${bookingTotal.toFixed(2)}.`);
        const updatedWallet = await tx.agentWallet.update({ where: { id: wallet.id }, data: { balance: { decrement: bookingTotal } } });
        walletDebit = { walletId: wallet.id, balanceAfter: updatedWallet.balance };
      }
      const reservation = await tx.reservation.create({
        data: {
          reference: reservationReference,
          hotelId,
          source: body.source ?? 'WEBSITE',
          sourceName: body.sourceName ?? (user ? 'Agent booking' : undefined),
          status: 'PENDING_PAYMENT',
          paymentStatus: 'UNPAID',
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
          balanceAmount: hold.lines.reduce((sum, line) => sum + Number(line.quotedTotal), 0),
          priceSnapshot: hold.lines.map((line) => ({ roomTypeId: line.roomTypeId, ratePlanId: line.ratePlanId, total: Number(line.quotedTotal), tax: Number(line.quotedTax), breakdown: line.quotedBreakdown })),
          policySnapshot: { policySource: 'hold', capturedAt: new Date().toISOString(), freeCancellationHours: 48, firstNightPenalty: true },
          specialRequest: body.specialRequest,
          billingInstruction: body.billingInstruction,
          internalRemark: body.internalRemark,
          createdById: user?.id,
          lines: {
            create: hold.lines.map((line) => ({
              roomType: { connect: { id: line.roomTypeId } },
              ratePlan: { connect: { id: line.ratePlanId } },
              checkIn: line.checkIn,
              checkOut: line.checkOut,
              rooms: line.rooms,
              adults: line.adults,
              children: line.children,
              nightlyRate: Number(line.quotedTotal) / Math.max(1, line.nights.length),
              taxAmount: line.quotedTax,
              lineTotal: line.quotedTotal,
              priceSnapshot: line.quotedBreakdown as Prisma.InputJsonValue,
              nights: { create: line.nights.map((night: any) => ({ date: night.date, rooms: night.rooms, amount: Number(line.quotedTotal) / Math.max(1, line.nights.length), taxAmount: Number(line.quotedTax) / Math.max(1, line.nights.length), totalAmount: Number(line.quotedTotal) / Math.max(1, line.nights.length) })) },
            })),
          },
        },
        include: { lines: { include: { nights: true, roomType: true, ratePlan: true } }, hotel: true },
      });
      if (walletDebit) await tx.walletTransaction.create({ data: { walletId: walletDebit.walletId, type: 'BOOKING_DEBIT', amount: -bookingTotal, balanceAfter: walletDebit.balanceAfter, reference: reservation.reference, description: `Booking debit for ${reservation.reference}` } });
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
    return this.p.reservation.findMany({ where: { createdById: userId }, orderBy: { createdAt: 'desc' }, take: 100, select: { reference: true, guestName: true, checkIn: true, checkOut: true, source: true, status: true, paymentStatus: true, totalAmount: true, balanceAmount: true, hotel: { select: { name: true } }, lines: { select: { roomType: { select: { name: true } }, ratePlan: { select: { name: true } }, rooms: true } } } });
  }

  async listRatePlansForUser(userId: string) {
    const assignments = await this.p.agentRatePlan.findMany({ where: { agentId: userId, ratePlan: { active: true } }, orderBy: { ratePlan: { name: 'asc' } }, include: { ratePlan: { include: { roomType: { include: { hotel: { select: { name: true, city: true } } } }, rates: { orderBy: { date: 'asc' }, take: 31 } } } } });
    return assignments.map(({ ratePlan }) => ({ id: ratePlan.id, code: ratePlan.code, name: ratePlan.name, mealPlan: ratePlan.mealPlan, description: ratePlan.description, hotel: ratePlan.roomType.hotel, room: { id: ratePlan.roomType.id, name: ratePlan.roomType.name, code: ratePlan.roomType.code }, rates: ratePlan.rates }));
  }

  async get(reference: string, full = false) {
    const reservation = await this.p.reservation.findUnique({ where: { reference }, include: { hotel: true, lines: { include: { roomType: true, ratePlan: true, nights: true } }, payments: true, paymentAttempts: true, syncLogs: true, vouchers: { include: { file: true } }, cancellations: true, modifications: true } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (full) return reservation;
    return { id: reservation.id, reference: reservation.reference, status: reservation.status, paymentStatus: reservation.paymentStatus, syncStatus: reservation.syncStatus, guestName: reservation.guestName, checkIn: reservation.checkIn, checkOut: reservation.checkOut, currency: reservation.currency, totalAmount: reservation.totalAmount, advanceAmount: reservation.advanceAmount, balanceAmount: reservation.balanceAmount, hotel: { name: reservation.hotel.name, slug: reservation.hotel.slug, city: reservation.hotel.city }, lines: reservation.lines.map((line) => ({ roomType: line.roomType.name, ratePlan: line.ratePlan.name, rooms: line.rooms, adults: line.adults, children: line.children, checkIn: line.checkIn, checkOut: line.checkOut })) };
  }

  async cancel(reference: string, body: CancellationDto, user: { id: string }) {
    const current = await this.p.reservation.findUnique({ where: { reference }, select: { id: true } });
    if (!current) throw new NotFoundException('Reservation not found');
    const idempotencyKey = body.idempotencyKey ?? `cancel:${current.id}`;
    return this.p.$transaction(async (tx) => {
      const reservation = await tx.reservation.findUnique({ where: { id: current.id }, include: { lines: { include: { nights: true } }, payments: true, vouchers: true } });
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
      for (const line of reservation.lines) for (const night of line.nights) {
        const row = lockRows.find((candidate) => candidate.roomTypeId === line.roomTypeId && toDateOnly(candidate.date) === toDateOnly(night.date));
        if (!row || row.sold < night.rooms) throw new ConflictException('Inventory state cannot be restored safely');
        await tx.inventoryDay.update({ where: { id: row.id }, data: { sold: { decrement: night.rooms }, version: { increment: 1 } } });
      }
      const cancellation = await tx.cancellationRequest.create({ data: { reservationId: reservation.id, status: 'COMPLETED', reason: body.reason, idempotencyKey, requestedById: user.id, approvedById: user.id, refundAmount, policyResult: { hoursBeforeArrival, penalty, refundAmount } } });
      await tx.reservation.update({ where: { id: reservation.id }, data: { status: 'CANCELLED', paymentStatus: refundAmount > 0 ? 'REFUND_PENDING' : reservation.paymentStatus, syncStatus: 'PENDING', version: { increment: 1 } } });
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
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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
import { RateResolverService } from '../availability/rate-resolver';
import { calculateAgentBookingPaymentTerms, calculateReservationPaymentSchedule } from '../../common/agent-payment-terms';

@Injectable()
export class ReservationsService {
  constructor(private p: PrismaService, private holds: HoldsService, private audit: AuditService, private readonly rateResolver: RateResolverService) {}

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

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMode, PaymentProvider, Prisma, UserRole } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { MockGateway, PaymentGateway, RazorpayGateway } from './payment-provider';
import { ManualPaymentDto, MockCompletionDto, RazorpayVerifyPaymentDto } from './payments.dto';
import { CashierShiftsService } from '../cashier-shifts/cashier-shifts.service';
import { getActorScope } from '../../common/role-scope';
import { MailService } from '../../common/mail.service';

@Injectable()
export class PaymentsService {
  constructor(private p: PrismaService, private c: ConfigService, private audit: AuditService, private cashierShifts?: CashierShiftsService, @Optional() private mail?: MailService) {}

  async getWalletRechargeAttempt(agentId: string, attemptId: string) {
    const attempt = await this.p.walletRechargeAttempt.findFirst({ where: { id: attemptId, wallet: { agentId } }, select: { id: true, status: true, amount: true, currency: true, provider: true } });
    if (!attempt) throw new NotFoundException('Recharge attempt not found');
    return attempt;
  }

  async submitOfflineWalletRecharge(agentId: string, body: { amount: number; mode: PaymentMode; reference?: string; proofFileId: string }) {
    if (!([PaymentMode.UPI, PaymentMode.BANK_TRANSFER, PaymentMode.CHEQUE] as PaymentMode[]).includes(body.mode)) throw new BadRequestException('Offline wallet recharge must use UPI, bank transfer, or cheque.');
    if (!body.proofFileId) throw new BadRequestException('A payment screenshot or proof document is required.');
    if (!Number.isFinite(body.amount) || body.amount <= 0) throw new BadRequestException('Recharge amount must be positive');
    const proof = await this.p.storedFile.findFirst({ where: { id: body.proofFileId, kind: 'PAYMENT_PROOF', createdById: agentId }, select: { id: true } });
    if (!proof) throw new BadRequestException('The payment proof is invalid or no longer available.');
    const wallet = await this.p.agentWallet.upsert({ where: { agentId }, update: {}, create: { agentId } });
    const existing = await this.p.walletRechargeAttempt.findFirst({ where: { walletId: wallet.id, provider: 'MANUAL', status: 'PENDING' }, select: { id: true } });
    if (existing) throw new BadRequestException('A wallet recharge proof is already awaiting admin approval.');
    const amount = Math.round(body.amount * 100) / 100;
    const attempt = await this.p.walletRechargeAttempt.create({ data: { walletId: wallet.id, provider: 'MANUAL', providerOrderId: `offline-wallet:${randomUUID()}`, idempotencyKey: `offline-wallet:${agentId}:${randomUUID()}`, amount, currency: wallet.currency, status: 'PENDING', providerPayload: { kind: 'OFFLINE_WALLET_RECHARGE', mode: body.mode, reference: body.reference?.trim() || null, proofFileId: proof.id } as Prisma.InputJsonValue } });
    await this.audit.log({ actorUserId: agentId, action: 'WALLET_RECHARGE_SUBMITTED_FOR_REVIEW', entityType: 'WalletRechargeAttempt', entityId: attempt.id, after: { amount, mode: body.mode, proofFileId: proof.id } });
    if (this.mail) {
      const agent = await this.p.user.findUnique({ where: { id: agentId }, select: { name: true, email: true } });
      const summary = `Agent ${agent?.name ?? agentId} submitted an offline wallet recharge of INR ${amount.toFixed(2)} via ${body.mode}. Reference: ${body.reference?.trim() || 'not provided'}.`;
      await Promise.all([
        this.mail.queue({ to: this.mail.adminRecipients(), subject: 'Offline wallet recharge awaiting approval', text: summary, attachmentFileIds: [proof.id] }, `wallet-recharge:${attempt.id}:admin-submitted`, 'WalletRechargeAttempt', attempt.id),
        agent?.email ? this.mail.queue({ to: agent.email, subject: 'RainWood wallet recharge submitted', text: `Your offline wallet recharge of INR ${amount.toFixed(2)} was submitted for admin approval.`, attachmentFileIds: [proof.id] }, `wallet-recharge:${attempt.id}:agent-submitted`, 'WalletRechargeAttempt', attempt.id) : Promise.resolve(null),
      ]);
    }
    return { id: attempt.id, status: attempt.status, amount: attempt.amount, currency: attempt.currency, mode: body.mode, reference: body.reference?.trim() || null };
  }

  async listOfflineWalletRecharges() {
    const attempts = await this.p.walletRechargeAttempt.findMany({ where: { provider: 'MANUAL', status: 'PENDING' }, include: { wallet: { select: { agent: { select: { id: true, name: true, email: true } } } } }, orderBy: { createdAt: 'asc' }, take: 200 });
    return attempts.map((attempt) => {
      const payload = (attempt.providerPayload && typeof attempt.providerPayload === 'object' && !Array.isArray(attempt.providerPayload) ? attempt.providerPayload : {}) as Record<string, unknown>;
      return { id: attempt.id, amount: attempt.amount, currency: attempt.currency, createdAt: attempt.createdAt, mode: String(payload.mode ?? 'OTHER'), reference: payload.reference ? String(payload.reference) : null, proofFileId: payload.proofFileId ? String(payload.proofFileId) : null, agent: attempt.wallet.agent };
    });
  }

  async verifyOfflineWalletRecharge(attemptId: string, userId: string) {
    const actor = await getActorScope(this.p, userId);
    if (!([UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTS] as UserRole[]).includes(actor.role)) throw new ForbiddenException('This account cannot approve wallet recharges.');
    const result = await this.p.$transaction(async (tx) => {
      const attempt = await tx.walletRechargeAttempt.findUnique({ where: { id: attemptId }, include: { wallet: true } });
      if (!attempt || attempt.provider !== 'MANUAL') throw new NotFoundException('Offline wallet recharge not found');
      if (attempt.status === 'SUCCESS') return { attempt, wallet: await tx.agentWallet.findUniqueOrThrow({ where: { id: attempt.walletId } }), newlyVerified: false };
      if (attempt.status !== 'PENDING') throw new BadRequestException('This wallet recharge is no longer awaiting approval.');
      const updatedAttempt = await tx.walletRechargeAttempt.update({ where: { id: attempt.id, status: 'PENDING' }, data: { status: 'SUCCESS', providerPaymentId: `offline-verified:${attempt.id}` } });
      const wallet = await tx.agentWallet.update({ where: { id: attempt.walletId }, data: { balance: { increment: attempt.amount } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'RECHARGE', amount: attempt.amount, balanceAfter: wallet.balance, reference: `RECHARGE:${attempt.id}`, description: 'Verified offline agent wallet recharge' } });
      return { attempt: updatedAttempt, wallet, newlyVerified: true };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.log({ actorUserId: userId, action: 'WALLET_RECHARGE_VERIFIED', entityType: 'WalletRechargeAttempt', entityId: attemptId, after: { amount: Number(result.attempt.amount), walletId: result.attempt.walletId } });
    if (this.mail && result.newlyVerified) {
      const agent = await this.p.user.findUnique({ where: { id: result.wallet.agentId }, select: { name: true, email: true } });
      const providerPayload = result.attempt.providerPayload && typeof result.attempt.providerPayload === 'object' && !Array.isArray(result.attempt.providerPayload) ? result.attempt.providerPayload as Record<string, unknown> : {};
      const proofFileId = typeof providerPayload.proofFileId === 'string' ? providerPayload.proofFileId : undefined;
      if (agent?.email) await this.mail.queue({ to: agent.email, subject: 'RainWood wallet recharge approved', text: `Your offline wallet recharge of INR ${Number(result.attempt.amount).toFixed(2)} has been approved and credited. Your new wallet balance is INR ${Number(result.wallet.balance).toFixed(2)}.`, attachmentFileIds: proofFileId ? [proofFileId] : undefined }, `wallet-recharge:${attemptId}:agent-approved`, 'WalletRechargeAttempt', attemptId);
    }
    return { id: result.attempt.id, status: result.attempt.status, amount: result.attempt.amount, balance: result.wallet.balance };
  }

  private providerFromConfig(): PaymentProvider {
    const provider = this.c.get('PAYMENT_PROVIDER', 'mock').toLowerCase();
    if (provider === 'razorpay') return 'RAZORPAY';
    if (provider === 'cashfree') return 'CASHFREE';
    return 'MOCK';
  }

  private gateway(provider: PaymentProvider): PaymentGateway {
    if (provider === 'RAZORPAY') return new RazorpayGateway(this.c);
    if (provider === 'CASHFREE') throw new BadRequestException('Cashfree adapter requires the merchant API version and credentials');
    return new MockGateway(this.c);
  }

  async createWalletRechargeOrder(agentId: string, amount: number, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length < 8) throw new BadRequestException('A stable idempotency-key is required');
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Recharge amount must be positive');
    const wallet = await this.p.agentWallet.upsert({ where: { agentId }, update: {}, create: { agentId } });
    const existing = await this.p.walletRechargeAttempt.findUnique({ where: { idempotencyKey } });
    if (existing) { if (existing.walletId !== wallet.id) throw new BadRequestException('Idempotency key belongs to another wallet'); return existing; }
    const provider = this.providerFromConfig();
    const order = await this.gateway(provider).createOrder({ amount: Math.round(amount * 100) / 100, currency: wallet.currency, reference: `wallet:${agentId}:${idempotencyKey}` });
    const providerOrderId = String(order.id ?? order.orderId ?? ''); if (!providerOrderId) throw new BadRequestException('Payment provider did not return an order ID');
    return this.p.walletRechargeAttempt.create({ data: { walletId: wallet.id, provider, providerOrderId, idempotencyKey, amount: Math.round(amount * 100) / 100, currency: wallet.currency, status: 'PENDING', providerPayload: order as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 30 * 60_000) } });
  }

  async mockCompleteWalletRecharge(agentId: string, attemptId: string, status: 'SUCCESS' | 'FAILED') {
    if (this.providerFromConfig() !== 'MOCK') throw new BadRequestException('Mock wallet recharge is disabled for the active provider');
    const attempt = await this.p.walletRechargeAttempt.findFirst({ where: { id: attemptId, wallet: { agentId }, status: 'PENDING' } });
    if (!attempt) throw new BadRequestException('No pending wallet recharge attempt exists');
    const payload = { eventId: `mock:wallet:${attempt.id}:${status}`, orderId: attempt.providerOrderId, paymentId: `mock_wallet_payment_${attempt.id}`, status, amount: Number(attempt.amount), currency: attempt.currency };
    const raw = Buffer.from(JSON.stringify(payload)); const signature = new MockGateway(this.c).sign(raw);
    return this.webhook('MOCK', raw, { 'x-mock-signature': signature }, payload);
  }

  async createOrder(reference: string, idempotencyKey: string, requestedAmount?: number) {
    if (!idempotencyKey || idempotencyKey.length < 8) throw new BadRequestException('A stable idempotency-key is required');
    const reservation = await this.p.reservation.findUnique({ where: { reference } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reservation.status)) throw new BadRequestException('Reservation is not payable');
    const balanceAmount = Number(reservation.balanceAmount);
    const amount = requestedAmount === undefined ? balanceAmount : Number(requestedAmount);
    if (balanceAmount <= 0) throw new BadRequestException('Reservation has no balance due');
    if (!Number.isFinite(amount) || amount <= 0 || amount > balanceAmount + 0.005) throw new BadRequestException('Payment amount must be positive and cannot exceed the balance due');
    if (Math.round(amount * 100) < 100) throw new BadRequestException('Payment amount must be at least 100 paise');
    const existing = await this.p.paymentAttempt.findUnique({ where: { idempotencyKey } });
    if (existing) return this.checkoutOrderResponse(existing);
    const provider = this.providerFromConfig();
    const order = await this.gateway(provider).createOrder({ amount, currency: reservation.currency, reference });
    const providerOrderId = String(order.id ?? order.orderId ?? '');
    if (!providerOrderId) throw new BadRequestException('Payment provider did not return an order ID');
    const attempt = await this.p.paymentAttempt.create({ data: { reservationId: reservation.id, provider, providerOrderId, idempotencyKey, amount, currency: reservation.currency, status: 'PENDING', providerPayload: order as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 30 * 60_000) } });
    return this.checkoutOrderResponse(attempt);
  }

  private checkoutOrderResponse(attempt: { id: string; provider: PaymentProvider; providerOrderId: string; amount: unknown; currency: string; status: string }) {
    return {
      id: attempt.id,
      provider: attempt.provider,
      providerOrderId: attempt.providerOrderId,
      order_id: attempt.providerOrderId,
      amount: Math.round(Number(attempt.amount) * 100),
      currency: attempt.currency,
      status: attempt.status,
    };
  }

  async verifyCheckoutPayment(reference: string, body: RazorpayVerifyPaymentDto) {
    const { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature } = body;
    if (!paymentId || !orderId || !signature) throw new BadRequestException('razorpay_payment_id, razorpay_order_id, and razorpay_signature are required');

    const reservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true, reference: true } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    const attempt = await this.p.paymentAttempt.findUnique({ where: { providerOrderId: orderId } });
    if (!attempt || attempt.reservationId !== reservation.id || attempt.provider !== 'RAZORPAY') throw new BadRequestException('Unknown Razorpay order');
    if (!(this.gateway('RAZORPAY') as unknown as RazorpayGateway).verifyPaymentSignature(orderId, paymentId, signature)) throw new BadRequestException('Invalid Razorpay payment signature');

    const result = await this.p.$transaction(async (tx) => {
      const current = await tx.paymentAttempt.findUnique({ where: { id: attempt.id } });
      if (!current) throw new BadRequestException('Payment attempt not found');
      if (current.status === 'SUCCESS') {
        if (current.providerPaymentId !== paymentId) throw new BadRequestException('Payment attempt was already completed with another payment');
        return { status: 'SUCCESS' as const, duplicate: true };
      }
      if (current.status !== 'PENDING') throw new BadRequestException('Payment attempt is no longer payable');
      await tx.paymentAttempt.update({ where: { id: current.id }, data: { status: 'SUCCESS', providerPaymentId: paymentId } });
      const existingPayment = await tx.payment.findFirst({ where: { provider: 'RAZORPAY', providerPaymentId: paymentId } });
      if (!existingPayment) await tx.payment.create({ data: { reservationId: current.reservationId, amount: current.amount, mode: 'GATEWAY', provider: 'RAZORPAY', providerOrderId: orderId, providerPaymentId: paymentId, verified: true, paidAt: new Date() } });
      const updatedReservation = await this.recalculateTx(tx, current.reservationId);
      await tx.outboxJob.upsert({ where: { idempotencyKey: `voucher:${current.reservationId}:v1` }, create: { type: 'GENERATE_VOUCHER', aggregateType: 'Reservation', aggregateId: current.reservationId, idempotencyKey: `voucher:${current.reservationId}:v1`, payload: { reservationId: current.reservationId } }, update: {} });
      return { status: 'SUCCESS' as const, duplicate: false, paymentStatus: updatedReservation.paymentStatus };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true, reference, order_id: orderId, payment_id: paymentId, ...result };
  }

  async verifyWalletCheckoutPayment(agentId: string, body: RazorpayVerifyPaymentDto) {
    const { razorpay_payment_id: paymentId, razorpay_order_id: orderId, razorpay_signature: signature } = body;
    if (!paymentId || !orderId || !signature) throw new BadRequestException('razorpay_payment_id, razorpay_order_id, and razorpay_signature are required');
    if (!(this.gateway('RAZORPAY') as unknown as RazorpayGateway).verifyPaymentSignature(orderId, paymentId, signature)) throw new BadRequestException('Invalid Razorpay payment signature');

    const attempt = await this.p.walletRechargeAttempt.findFirst({ where: { providerOrderId: orderId, provider: 'RAZORPAY', wallet: { agentId } } });
    if (!attempt) throw new BadRequestException('Unknown Razorpay wallet order');
    const result = await this.p.$transaction(async (tx) => {
      const current = await tx.walletRechargeAttempt.findUnique({ where: { id: attempt.id } });
      if (!current) throw new BadRequestException('Wallet payment attempt not found');
      if (current.status === 'SUCCESS') {
        if (current.providerPaymentId !== paymentId) throw new BadRequestException('Wallet payment attempt was already completed with another payment');
        return { status: 'SUCCESS' as const, duplicate: true };
      }
      if (current.status !== 'PENDING') throw new BadRequestException('Wallet payment attempt is no longer payable');
      await tx.walletRechargeAttempt.update({ where: { id: current.id }, data: { status: 'SUCCESS', providerPaymentId: paymentId } });
      const wallet = await tx.agentWallet.findUniqueOrThrow({ where: { id: current.walletId } });
      const updatedWallet = await tx.agentWallet.update({ where: { id: wallet.id }, data: { balance: { increment: current.amount } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'RECHARGE', amount: current.amount, balanceAfter: updatedWallet.balance, reference: `RECHARGE:${current.id}`, description: 'Verified agent wallet recharge' } });
      return { status: 'SUCCESS' as const, duplicate: false, balance: updatedWallet.balance };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return { success: true, order_id: orderId, payment_id: paymentId, ...result };
  }

  async webhook(providerValue: string, raw: Buffer, headers: Record<string, string | string[] | undefined>, payload: any) {
    const provider = providerValue.toUpperCase() as PaymentProvider;
    if (!['MOCK', 'RAZORPAY', 'CASHFREE'].includes(provider)) throw new BadRequestException('Unsupported payment provider');
    const gateway = this.gateway(provider);
    if (!gateway.verify(raw, headers)) throw new BadRequestException('Invalid webhook signature');
    const normalized = gateway.normalize(payload);
    if (!normalized.eventId || !normalized.orderId || !normalized.paymentId) throw new BadRequestException('Incomplete payment event');
    let event;
    try {
      event = await this.p.webhookEvent.create({ data: { provider, externalEventId: normalized.eventId, eventType: normalized.eventType, signature: String(headers['x-razorpay-signature'] ?? headers['x-mock-signature'] ?? ''), payloadChecksum: createHash('sha256').update(raw).digest('hex'), payload, status: 'RECEIVED' } });
    } catch (error: any) {
      if (error?.code === 'P2002') return { duplicate: true };
      throw error;
    }
    try {
      const result = await this.p.$transaction(async (tx) => {
        await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSING', attempts: { increment: 1 } } });
        const attempt = await tx.paymentAttempt.findUnique({ where: { providerOrderId: normalized.orderId } });
        const walletAttempt = attempt ? null : await tx.walletRechargeAttempt.findUnique({ where: { providerOrderId: normalized.orderId } });
        const selectedAttempt = attempt ?? walletAttempt;
        if (!selectedAttempt || selectedAttempt.provider !== provider) throw new BadRequestException('Unknown payment order');
        if (normalized.currency !== selectedAttempt.currency || Math.abs(normalized.amount - Number(selectedAttempt.amount)) > 0.01) throw new BadRequestException('Payment amount or currency mismatch');
        if (walletAttempt) {
          if (walletAttempt.status === 'SUCCESS' && normalized.status === 'SUCCESS') { await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date(), completedAt: new Date() } }); return { ok: true, duplicate: true, walletId: walletAttempt.walletId, status: normalized.status }; }
          if (normalized.status === 'SUCCESS') {
            await tx.walletRechargeAttempt.update({ where: { id: walletAttempt.id }, data: { status: 'SUCCESS', providerPaymentId: normalized.paymentId } });
            const wallet = await tx.agentWallet.findUniqueOrThrow({ where: { id: walletAttempt.walletId } });
            const updatedWallet = await tx.agentWallet.update({ where: { id: wallet.id }, data: { balance: { increment: walletAttempt.amount } } });
            await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'RECHARGE', amount: walletAttempt.amount, balanceAfter: updatedWallet.balance, reference: `RECHARGE:${walletAttempt.id}`, description: 'Verified agent wallet recharge' } });
            await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date(), completedAt: new Date() } });
            return { ok: true, walletId: wallet.id, status: normalized.status };
          }
          await tx.walletRechargeAttempt.update({ where: { id: walletAttempt.id }, data: { status: 'FAILED', providerPaymentId: normalized.paymentId } });
          await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date(), completedAt: new Date() } });
          return { ok: true, walletId: walletAttempt.walletId, status: normalized.status };
        }
        if (!attempt) throw new BadRequestException('Unknown payment order');
        if (attempt.status === 'SUCCESS' && normalized.status === 'SUCCESS') {
          await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date(), completedAt: new Date() } });
          return { ok: true, duplicate: true, reservationId: attempt.reservationId, status: normalized.status };
        }
        if (normalized.status === 'SUCCESS') {
          await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'SUCCESS', providerPaymentId: normalized.paymentId } });
          const existingPayment = await tx.payment.findFirst({ where: { provider, providerPaymentId: normalized.paymentId } });
          if (!existingPayment) await tx.payment.create({ data: { reservationId: attempt.reservationId, amount: attempt.amount, mode: 'GATEWAY', provider, providerOrderId: normalized.orderId, providerPaymentId: normalized.paymentId, verified: true, paidAt: new Date() } });
          await this.recalculateTx(tx, attempt.reservationId);
          await tx.outboxJob.upsert({ where: { idempotencyKey: `voucher:${attempt.reservationId}:v1` }, create: { type: 'GENERATE_VOUCHER', aggregateType: 'Reservation', aggregateId: attempt.reservationId, idempotencyKey: `voucher:${attempt.reservationId}:v1`, payload: { reservationId: attempt.reservationId } }, update: {} });
        } else {
          await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'FAILED', providerPaymentId: normalized.paymentId } });
          await tx.reservation.update({ where: { id: attempt.reservationId }, data: { paymentStatus: 'FAILED' } });
        }
        await tx.webhookEvent.update({ where: { id: event.id }, data: { status: 'PROCESSED', processedAt: new Date(), completedAt: new Date() } });
        return { ok: true, reservationId: attempt.reservationId, status: normalized.status };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      if (this.mail && normalized.status === 'SUCCESS') {
        if ((result as any).reservationId) {
          const reservation = await this.p.reservation.findUnique({ where: { id: (result as any).reservationId }, select: { email: true, reference: true, totalAmount: true, advanceAmount: true, balanceAmount: true } });
          if (reservation?.email) await this.mail.queue({ to: reservation.email, subject: `RainWood payment received - ${reservation.reference}`, text: `Payment received for reservation ${reservation.reference}. Advance paid: INR ${Number(reservation.advanceAmount).toFixed(2)}. Balance due: INR ${Number(reservation.balanceAmount).toFixed(2)}.` }, `payment:${normalized.paymentId}:guest-received`, 'Payment', normalized.paymentId);
        } else if ((result as any).walletId) {
          const wallet = await this.p.agentWallet.findUnique({ where: { id: (result as any).walletId }, select: { balance: true, agent: { select: { email: true } } } });
          if (wallet?.agent?.email) await this.mail.queue({ to: wallet.agent.email, subject: 'RainWood wallet recharge successful', text: `Your wallet recharge of INR ${Number(normalized.amount).toFixed(2)} was completed successfully. Your new wallet balance is INR ${Number(wallet.balance).toFixed(2)}.` }, `wallet-payment:${normalized.paymentId}:agent-received`, 'WalletRechargeAttempt', (result as any).walletId);
        }
      }
      return result;
    } catch (error: any) {
      await this.p.webhookEvent.update({ where: { id: event.id }, data: { status: 'FAILED', lastError: String(error?.message ?? error) } });
      throw error;
    }
  }

  async manual(reference: string, body: ManualPaymentDto, userId: string) {
    const actor = await getActorScope(this.p, userId);
    const paymentRoles: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.RESERVATION];
    if (!paymentRoles.includes(actor.role)) throw new ForbiddenException('This account cannot record payments.');
    const reservation = await this.p.reservation.findUnique({ where: { reference } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (!actor.isGlobal && actor.role !== UserRole.ACCOUNTS && actor.hotelId !== reservation.hotelId) throw new ForbiddenException('You cannot record a payment for another hotel.');
    if (body.amount > Number(reservation.balanceAmount)) throw new BadRequestException('Payment exceeds balance due');
    const payment = await this.p.$transaction(async (tx) => {
      const openShift = this.cashierShifts ? await this.cashierShifts.findOpenForHotel(tx, reservation.hotelId) : null;
      if (body.mode === PaymentMode.CASH && !openShift) throw new BadRequestException('Open a cashier shift before recording cash payments.');
      const created = await tx.payment.create({ data: { reservationId: reservation.id, amount: body.amount, mode: body.mode, provider: 'MANUAL', reference: body.reference, proofFileId: body.proofFileId, cashierShiftId: openShift?.id, verified: false } });
      await tx.reservation.update({ where: { id: reservation.id }, data: { paymentStatus: 'PENDING' } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.log({ actorUserId: userId, action: 'PAYMENT_RECORDED', entityType: 'Payment', entityId: payment.id, after: { amount: body.amount, mode: body.mode, cashierShiftId: payment.cashierShiftId } });
    return payment;
  }

  async submitOffline(reference: string, body: ManualPaymentDto, userId: string) {
    const actor = await getActorScope(this.p, userId);
    if (actor.role !== UserRole.AGENT) throw new ForbiddenException('Only agents can submit offline payment proofs.');
    if (!([PaymentMode.UPI, PaymentMode.BANK_TRANSFER, PaymentMode.CHEQUE] as PaymentMode[]).includes(body.mode)) {
      throw new BadRequestException('Offline payment must use UPI, bank transfer, or cheque.');
    }
    if (!body.proofFileId) throw new BadRequestException('A payment screenshot or proof document is required.');
    const reservation = await this.p.reservation.findUnique({ where: { reference }, select: { id: true, reference: true, email: true, guestName: true, createdById: true, balanceAmount: true, status: true } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (reservation.createdById !== userId) throw new ForbiddenException('You can only submit payment for your own booking.');
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reservation.status)) throw new BadRequestException('Reservation is not payable');
    if (body.amount > Number(reservation.balanceAmount)) throw new BadRequestException('Payment exceeds balance due');
    const proof = await this.p.storedFile.findFirst({ where: { id: body.proofFileId, kind: 'PAYMENT_PROOF', createdById: userId }, select: { id: true } });
    if (!proof) throw new BadRequestException('The payment proof is invalid or no longer available.');
    const payment = await this.p.$transaction(async (tx) => {
      const pending = await tx.payment.findFirst({ where: { reservationId: reservation.id, verified: false } });
      if (pending) throw new BadRequestException('A payment proof is already awaiting admin approval.');
      const created = await tx.payment.create({ data: { reservationId: reservation.id, amount: body.amount, mode: body.mode, provider: 'MANUAL', reference: body.reference?.trim() || null, proofFileId: proof.id, verified: false } });
      await tx.reservation.update({ where: { id: reservation.id }, data: { paymentStatus: 'PENDING' } });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.log({ actorUserId: userId, action: 'PAYMENT_SUBMITTED_FOR_REVIEW', entityType: 'Payment', entityId: payment.id, after: { reference, amount: body.amount, mode: body.mode, proofFileId: proof.id } });
    if (this.mail) {
      const summary = `Offline payment proof submitted for reservation ${reference}. Guest: ${reservation.guestName}. Amount: INR ${Number(body.amount).toFixed(2)}. Mode: ${body.mode}.`;
      await Promise.all([
        this.mail.queue({ to: this.mail.adminRecipients(), subject: `Offline payment awaiting approval - ${reference}`, text: summary, attachmentFileIds: [proof.id] }, `payment:${payment.id}:admin-submitted`, 'Payment', payment.id),
        this.p.user.findUnique({ where: { id: userId }, select: { email: true } }).then((agent) => agent?.email ? this.mail!.queue({ to: agent.email, subject: `Payment submitted for approval - ${reference}`, text: `Your offline payment proof for reservation ${reference} was submitted for admin approval.`, attachmentFileIds: [proof.id] }, `payment:${payment.id}:agent-submitted`, 'Payment', payment.id) : null),
      ]);
    }
    return payment;
  }

  async mockComplete(reference: string, body: MockCompletionDto) {
    if (this.providerFromConfig() !== 'MOCK') throw new BadRequestException('Mock payment completion is disabled for the active provider');
    const reservation = await this.p.reservation.findUnique({ where: { reference }, include: { paymentAttempts: { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' }, take: 1 } } });
    const attempt = reservation?.paymentAttempts[0];
    if (!reservation || !attempt) throw new BadRequestException('No pending mock payment attempt exists');
    const payload = { eventId: `mock:${attempt.id}:${body.status}`, orderId: attempt.providerOrderId, paymentId: `mock_payment_${attempt.id}`, status: body.status, amount: Number(attempt.amount), currency: attempt.currency };
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = new MockGateway(this.c).sign(raw);
    return this.webhook('MOCK', raw, { 'x-mock-signature': signature }, payload);
  }

  async verify(paymentId: string, userId: string) {
    const payment = await this.p.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.verified) return payment;
    const updated = await this.p.$transaction(async (tx) => {
      const verified = await tx.payment.update({ where: { id: paymentId, verified: false }, data: { verified: true, verifiedById: userId, paidAt: new Date() } });
      await this.recalculateTx(tx, payment.reservationId);
      return verified;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    await this.audit.log({ actorUserId: userId, action: 'PAYMENT_VERIFIED', entityType: 'Payment', entityId: paymentId });
    if (this.mail) {
      const reservation = await this.p.reservation.findUnique({ where: { id: payment.reservationId }, select: { email: true, reference: true, advanceAmount: true, balanceAmount: true } });
      if (reservation?.email) await this.mail.queue({ to: reservation.email, subject: `RainWood payment approved - ${reservation.reference}`, text: `Your payment of INR ${Number(payment.amount).toFixed(2)} for reservation ${reservation.reference} was approved. Balance due: INR ${Number(reservation.balanceAmount).toFixed(2)}.`, attachmentFileIds: payment.proofFileId ? [payment.proofFileId] : undefined }, `payment:${paymentId}:guest-approved`, 'Payment', paymentId);
    }
    return updated;
  }

  async recalculate(id: string) { return this.p.$transaction((tx) => this.recalculateTx(tx, id), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }

  async recalculateTx(tx: Prisma.TransactionClient, id: string) {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    const paid = reservation.payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const total = Number(reservation.totalAmount);
    const balance = Math.max(total - paid, 0);
    const paymentStatus = balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : reservation.payments.some((payment) => !payment.verified) ? 'PENDING' : 'UNPAID';
      const status = balance <= 0 && ['PENDING_PAYMENT', 'TENTATIVE', 'HELD'].includes(reservation.status)
        ? 'CONFIRMED'
        : reservation.source === 'AGENT' && paid > 0 && ['PENDING_PAYMENT', 'TENTATIVE', 'HELD'].includes(reservation.status)
          ? 'CONFIRMED'
          : reservation.status;
    return tx.reservation.update({ where: { id }, data: { advanceAmount: paid, balanceAmount: balance, paymentStatus, status } });
  }
}

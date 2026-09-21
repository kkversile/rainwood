import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentProvider, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { MockGateway, PaymentGateway, RazorpayGateway } from './payment-provider';
import { ManualPaymentDto, MockCompletionDto } from './payments.dto';

@Injectable()
export class PaymentsService {
  constructor(private p: PrismaService, private c: ConfigService, private audit: AuditService) {}

  async getWalletRechargeAttempt(agentId: string, attemptId: string) {
    const attempt = await this.p.walletRechargeAttempt.findFirst({ where: { id: attemptId, wallet: { agentId } }, select: { id: true, status: true, amount: true, currency: true, provider: true } });
    if (!attempt) throw new NotFoundException('Recharge attempt not found');
    return attempt;
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

  async createOrder(reference: string, idempotencyKey: string) {
    if (!idempotencyKey || idempotencyKey.length < 8) throw new BadRequestException('A stable idempotency-key is required');
    const reservation = await this.p.reservation.findUnique({ where: { reference } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (['CANCELLED', 'COMPLETED', 'NO_SHOW'].includes(reservation.status)) throw new BadRequestException('Reservation is not payable');
    if (Number(reservation.balanceAmount) <= 0) throw new BadRequestException('Reservation has no balance due');
    const existing = await this.p.paymentAttempt.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;
    const provider = this.providerFromConfig();
    const order = await this.gateway(provider).createOrder({ amount: Number(reservation.balanceAmount), currency: reservation.currency, reference });
    const providerOrderId = String(order.id ?? order.orderId ?? '');
    if (!providerOrderId) throw new BadRequestException('Payment provider did not return an order ID');
    return this.p.paymentAttempt.create({ data: { reservationId: reservation.id, provider, providerOrderId, idempotencyKey, amount: reservation.balanceAmount, currency: reservation.currency, status: 'PENDING', providerPayload: order as Prisma.InputJsonValue, expiresAt: new Date(Date.now() + 30 * 60_000) } });
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
      return result;
    } catch (error: any) {
      await this.p.webhookEvent.update({ where: { id: event.id }, data: { status: 'FAILED', lastError: String(error?.message ?? error) } });
      throw error;
    }
  }

  async manual(reference: string, body: ManualPaymentDto, userId: string) {
    const reservation = await this.p.reservation.findUnique({ where: { reference } });
    if (!reservation) throw new NotFoundException('Reservation not found');
    if (body.amount > Number(reservation.balanceAmount)) throw new BadRequestException('Payment exceeds balance due');
    const payment = await this.p.payment.create({ data: { reservationId: reservation.id, amount: body.amount, mode: body.mode, provider: 'MANUAL', reference: body.reference, proofFileId: body.proofFileId, verified: false } });
    await this.p.reservation.update({ where: { id: reservation.id }, data: { paymentStatus: 'PENDING' } });
    await this.audit.log({ actorUserId: userId, action: 'PAYMENT_RECORDED', entityType: 'Payment', entityId: payment.id, after: { amount: body.amount, mode: body.mode } });
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
    return updated;
  }

  async recalculate(id: string) { return this.p.$transaction((tx) => this.recalculateTx(tx, id), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }

  async recalculateTx(tx: Prisma.TransactionClient, id: string) {
    const reservation = await tx.reservation.findUniqueOrThrow({ where: { id }, include: { payments: true } });
    const paid = reservation.payments.filter((payment) => payment.verified).reduce((sum, payment) => sum + Number(payment.amount), 0);
    const total = Number(reservation.totalAmount);
    const balance = Math.max(total - paid, 0);
    const paymentStatus = balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIALLY_PAID' : reservation.payments.some((payment) => !payment.verified) ? 'PENDING' : 'UNPAID';
    const status = balance <= 0 && ['PENDING_PAYMENT', 'TENTATIVE', 'HELD'].includes(reservation.status) ? 'CONFIRMED' : reservation.status;
    return tx.reservation.update({ where: { id }, data: { advanceAmount: paid, balanceAmount: balance, paymentStatus, status } });
  }
}

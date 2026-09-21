import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { MockGateway } from './payment-provider';

describe('wallet recharge webhooks', () => {
  const config = new ConfigService({ JWT_ACCESS_SECRET: 'test-secret', MOCK_WEBHOOK_SECRET: 'test-secret' });

  function setup(walletAttempt: any) {
    const tx: any = {
      webhookEvent: { update: jest.fn() },
      paymentAttempt: { findUnique: jest.fn().mockResolvedValue(null) },
      walletRechargeAttempt: {
        findUnique: jest.fn().mockResolvedValue(walletAttempt),
        update: jest.fn(),
      },
      agentWallet: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: walletAttempt.walletId, balance: 100 }),
        update: jest.fn().mockResolvedValue({ id: walletAttempt.walletId, balance: 200 }),
      },
      walletTransaction: { create: jest.fn() },
    };
    const prisma: any = {
      webhookEvent: { create: jest.fn().mockResolvedValue({ id: 'event-1' }), update: jest.fn() },
      $transaction: jest.fn(async (work: any) => work(tx)),
    };
    const service = new PaymentsService(prisma, config, { log: jest.fn() } as any);
    const payload = { eventId: `event-${walletAttempt.status}`, orderId: walletAttempt.providerOrderId, paymentId: 'payment-1', status: 'SUCCESS', amount: 100, currency: 'INR' };
    const raw = Buffer.from(JSON.stringify(payload));
    const signature = new MockGateway(config).sign(raw);
    return { service, prisma, tx, raw, signature, payload };
  }

  it('credits a wallet exactly once for a successful webhook', async () => {
    const { service, tx, raw, signature, payload } = setup({ id: 'attempt-1', walletId: 'wallet-1', provider: 'MOCK', providerOrderId: 'order-1', amount: 100, currency: 'INR', status: 'PENDING' });
    await service.webhook('MOCK', raw, { 'x-mock-signature': signature }, payload);
    expect(tx.agentWallet.update).toHaveBeenCalledTimes(1);
    expect(tx.walletTransaction.create).toHaveBeenCalledTimes(1);
    expect(tx.walletRechargeAttempt.update).toHaveBeenCalledWith({ where: { id: 'attempt-1' }, data: { status: 'SUCCESS', providerPaymentId: 'payment-1' } });
  });

  it('does not credit twice when a successful webhook is duplicated', async () => {
    const { service, tx, raw, signature, payload } = setup({ id: 'attempt-1', walletId: 'wallet-1', provider: 'MOCK', providerOrderId: 'order-1', amount: 100, currency: 'INR', status: 'SUCCESS' });
    await service.webhook('MOCK', raw, { 'x-mock-signature': signature }, payload);
    expect(tx.agentWallet.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
  });

  it('rejects a wallet webhook with the wrong amount or currency without crediting', async () => {
    const { service, prisma, tx, raw, signature } = setup({ id: 'attempt-1', walletId: 'wallet-1', provider: 'MOCK', providerOrderId: 'order-1', amount: 100, currency: 'INR', status: 'PENDING' });
    const payload = { eventId: 'event-mismatch', orderId: 'order-1', paymentId: 'payment-1', status: 'SUCCESS', amount: 99, currency: 'USD' };
    const mismatchedRaw = Buffer.from(JSON.stringify(payload));
    const mismatchedSignature = new MockGateway(config).sign(mismatchedRaw);
    await expect(service.webhook('MOCK', mismatchedRaw, { 'x-mock-signature': mismatchedSignature }, payload)).rejects.toThrow('Payment amount or currency mismatch');
    expect(tx.agentWallet.update).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(prisma.webhookEvent.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'FAILED' }) }));
    void raw;
    void signature;
  });
});

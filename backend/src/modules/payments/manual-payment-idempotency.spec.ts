import { ConfigService } from '@nestjs/config';
import { PaymentMode, Prisma, UserRole } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('manual booking payment retries', () => {
  const body = { amount: 6160, mode: PaymentMode.BANK_TRANSFER, reference: 'DEMO-BOOKING', idempotencyKey: 'booking-attempt-1' };
  function setup(existing: any = null, reservationPatch: any = {}) {
    const payment = { id: 'payment-1', reservationId: 'reservation-1', amount: new Prisma.Decimal(6160), mode: PaymentMode.BANK_TRANSFER, reference: 'DEMO-BOOKING', proofFileId: null, cashierShiftId: null, verified: false };
    const tx: any = { payment: { findUnique: jest.fn().mockResolvedValue(existing), create: jest.fn().mockResolvedValue(payment) }, reservation: { update: jest.fn() } };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', role: UserRole.SUPER_ADMIN, staffHotelId: null }) }, reservation: { findUnique: jest.fn().mockResolvedValue({ id: 'reservation-1', hotelId: 'hotel-1', stayStatus: 'EXPECTED', balanceAmount: 6160, ...reservationPatch }) }, payment: { findUnique: jest.fn().mockResolvedValue(existing) }, $transaction: jest.fn((work) => work(tx)) };
    const audit = { log: jest.fn() };
    return { service: new PaymentsService(prisma, new ConfigService(), audit as any), prisma, tx, audit, payment };
  }
  it('records the retry key while leaving approval to the reviewer', async () => {
    const { service, tx, audit } = setup();
    await service.manual('RW-TEST', body, 'admin-1');
    expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ idempotencyKey: body.idempotencyKey, verified: false, provider: 'MANUAL' }) }));
    expect(audit.log).toHaveBeenCalledTimes(1);
  });
  it('returns the same payment after an uncertain response, even after approval reduces the balance', async () => {
    const sample = setup().payment;
    const { service, tx, audit } = setup({ ...sample, verified: true }, { balanceAmount: 0 });
    expect(await service.manual('RW-TEST', body, 'admin-1')).toEqual({ ...sample, verified: true });
    expect(tx.payment.create).not.toHaveBeenCalled(); expect(audit.log).not.toHaveBeenCalled();
  });
  it.each([{ reservationId: 'another-reservation' }, { amount: new Prisma.Decimal(1) }, { mode: PaymentMode.CASH }, { reference: 'another-receipt' }])('rejects retry-key reuse for different payment details', async (patch) => {
    const { service, tx } = setup({ ...setup().payment, ...patch });
    await expect(service.manual('RW-TEST', body, 'admin-1')).rejects.toThrow('different payment');
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
  it('does not accept a new booking payment after checkout', async () => {
    const { service, tx } = setup(null, { stayStatus: 'CHECKED_OUT' });
    await expect(service.manual('RW-TEST', body, 'admin-1')).rejects.toThrow('Finalized stays');
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
  it('recovers concurrent unique-key retries without creating or auditing a second payment', async () => {
    const { service, prisma, audit, payment } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' }); prisma.payment.findUnique.mockResolvedValue(payment);
    expect(await service.manual('RW-TEST', body, 'admin-1')).toEqual(payment);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

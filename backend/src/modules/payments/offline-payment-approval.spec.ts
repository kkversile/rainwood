import { ConfigService } from '@nestjs/config';
import { PaymentMode, UserRole } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('agent offline payments and approval', () => {
  const body = { amount: 6160, mode: PaymentMode.BANK_TRANSFER, reference: 'DEMO', proofFileId: 'proof-1', idempotencyKey: 'attempt-1' };
  function setup(role: UserRole = UserRole.AGENT, paymentPatch: any = {}, reservationPatch: any = {}) {
    const reservation = { id: 'reservation-1', reference: 'RW-1', hotelId: 'hotel-1', createdById: 'actor', balanceAmount: 6160, status: 'PENDING_PAYMENT', stayStatus: 'EXPECTED', ...reservationPatch };
    const payment = { id: 'payment-1', reservationId: reservation.id, amount: 6160, mode: PaymentMode.BANK_TRANSFER, reference: 'DEMO', proofFileId: 'proof-1', verified: false, reservation, ...paymentPatch };
    const tx: any = { reservation: { findUnique: jest.fn().mockResolvedValue(reservation), update: jest.fn() }, payment: { findUnique: jest.fn().mockResolvedValue(null), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue(payment), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ ...payment, verified: true }) } };
    const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'actor', role, staffHotelId: role === UserRole.ADMIN ? 'hotel-1' : null, staffHotel: { active: true } }) }, storedFile: { findFirst: jest.fn().mockResolvedValue({ id: 'proof-1' }) }, $transaction: jest.fn((work) => work(tx)) };
    const audit = { log: jest.fn() }; const service = new PaymentsService(prisma, new ConfigService(), audit as any);
    jest.spyOn(service, 'recalculateTx').mockResolvedValue({} as any);
    return { service, tx, prisma, audit, payment };
  }
  it('stores the offline retry key and leaves the proof unverified', async () => {
    const { service, tx, audit } = setup(); await service.submitOffline('RW-1', body, 'actor');
    expect(tx.payment.create).toHaveBeenCalledWith({ data: expect.objectContaining({ idempotencyKey: 'attempt-1', verified: false, proofFileId: 'proof-1' }) }); expect(audit.log).toHaveBeenCalledTimes(1);
  });
  it('replays an approved submission even after the balance becomes zero', async () => {
    const { service, tx, audit, payment } = setup(UserRole.AGENT, { verified: true }, { balanceAmount: 0 }); tx.payment.findUnique.mockResolvedValue(payment);
    expect(await service.submitOffline('RW-1', body, 'actor')).toEqual(payment); expect(tx.payment.create).not.toHaveBeenCalled(); expect(audit.log).not.toHaveBeenCalled();
  });
  it('recovers a concurrent unique-key submission without creating a second receipt', async () => {
    const { service, tx, prisma, payment, audit } = setup();
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' }); tx.payment.findUnique.mockResolvedValue(payment);
    expect(await service.submitOffline('RW-1', body, 'actor')).toEqual(payment);
    expect(tx.payment.create).not.toHaveBeenCalled(); expect(audit.log).not.toHaveBeenCalled();
  });
  it.each([{ amount: 1 }, { mode: PaymentMode.CASH }, { proofFileId: 'other' }, { reservationId: 'other' }, { reference: 'changed' }])('rejects a reused key with changed payment details', async (patch) => {
    const { service, tx, payment } = setup(UserRole.AGENT, patch); tx.payment.findUnique.mockResolvedValue(payment);
    await expect(service.submitOffline('RW-1', body, 'actor')).rejects.toThrow('different payment'); expect(tx.payment.create).not.toHaveBeenCalled();
  });
  it('rejects another agent booking and another pending proof', async () => {
    const owned = setup(UserRole.AGENT, {}, { createdById: 'other' }); await expect(owned.service.submitOffline('RW-1', body, 'actor')).rejects.toThrow('own booking');
    const pending = setup(); pending.tx.payment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(pending.payment); await expect(pending.service.submitOffline('RW-1', body, 'actor')).rejects.toThrow('already awaiting');
  });
  it.each([UserRole.AGENT, UserRole.RESERVATION, UserRole.SERVICE_STAFF])('rejects approval from unauthorized roles: %s', async (role) => {
    const { service, tx } = setup(role); await expect(service.verify('payment-1', 'actor', 'RW-1')).rejects.toThrow(); expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });
  it('binds approval to both the requested booking and the admin hotel', async () => {
    const { service, tx, payment } = setup(UserRole.ADMIN); tx.payment.findUnique.mockResolvedValue(payment);
    await expect(service.verify('payment-1', 'actor', 'RW-OTHER')).rejects.toThrow('not found');
    payment.reservation.hotelId = 'hotel-other'; await expect(service.verify('payment-1', 'actor', 'RW-1')).rejects.toThrow('another hotel'); expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });
  it.each([UserRole.ADMIN, UserRole.ACCOUNTS, UserRole.SUPER_ADMIN])('approves once and safely replays an approval: %s', async (role) => {
    const { service, tx, payment, audit } = setup(role); tx.payment.findUnique.mockResolvedValue(payment);
    expect((await service.verify('payment-1', 'actor', 'RW-1')).verified).toBe(true);
    expect(service.recalculateTx).toHaveBeenCalledTimes(1); expect(audit.log).toHaveBeenCalledTimes(1);
    tx.payment.findUnique.mockResolvedValue({ ...payment, verified: true }); await service.verify('payment-1', 'actor', 'RW-1');
    expect(tx.payment.updateMany).toHaveBeenCalledTimes(1); expect(audit.log).toHaveBeenCalledTimes(1);
  });
  it.each([{ balanceAmount: 1 }, { stayStatus: 'CHECKED_OUT' }, { status: 'CANCELLED' }])('rejects new approval when the booking is no longer payable', async (patch) => {
    const { service, tx, payment } = setup(UserRole.SUPER_ADMIN, {}, patch); tx.payment.findUnique.mockResolvedValue(payment);
    await expect(service.verify('payment-1', 'actor', 'RW-1')).rejects.toThrow(); expect(tx.payment.updateMany).not.toHaveBeenCalled();
  });
});

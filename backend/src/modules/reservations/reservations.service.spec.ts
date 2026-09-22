import { ReservationsService } from './reservations.service';

function reservationFixture() {
  return {
    id: 'reservation-1', reference: 'RW-TEST-1', createdById: 'agent-1', status: 'CONFIRMED', totalAmount: 20000, balanceAmount: 18000, advanceAmount: 2000,
    paymentTermsSnapshot: { milestones: [
      { percentage: 10, dueType: 'ON_BOOKING', daysBeforeCheckIn: null, amount: 2000, dueAt: '2026-09-01T10:00:00.000Z', sortOrder: 0 },
      { percentage: 30, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 20, amount: 6000, dueAt: '2026-09-20T00:00:00.000Z', sortOrder: 1 },
      { percentage: 20, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 10, amount: 4000, dueAt: '2026-10-01T00:00:00.000Z', sortOrder: 2 },
      { percentage: 40, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 0, amount: 8000, dueAt: '2026-11-30T00:00:00.000Z', sortOrder: 3 },
    ] },
    payments: [{ amount: 2000, verified: true, reference: 'WALLET:RW-TEST-1' }],
    createdBy: { id: 'agent-1', role: 'AGENT' },
  };
}

function setup(balance = 10000) {
  const reservation = reservationFixture();
  const tx: any = {
    reservation: { findUnique: jest.fn().mockResolvedValue(reservation), update: jest.fn().mockImplementation(async (_args: any) => { reservation.advanceAmount = 8000; reservation.balanceAmount = 12000; reservation.payments.push({ amount: 6000, verified: true, reference: 'MILESTONE:reservation-1:retry-1' }); return reservation; }) },
    agentWallet: { findUnique: jest.fn().mockResolvedValue({ id: 'wallet-1', balance }), updateMany: jest.fn().mockResolvedValue({ count: balance >= 6000 ? 1 : 0 }), findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'wallet-1', balance: balance - 6000 }) },
    payment: { create: jest.fn().mockResolvedValue({ id: 'payment-2' }) },
    walletTransaction: { create: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = { $transaction: jest.fn(async (work: any) => work(tx)), reservation: { findUnique: jest.fn().mockResolvedValue({ ...reservation, hotel: { name: 'Hotel', slug: 'hotel', city: 'City' }, lines: [], payments: reservation.payments, paymentAttempts: [], syncLogs: [], vouchers: [], cancellations: [], modifications: [] }) } };
  const service = new ReservationsService(prisma, {} as any, {} as any, {} as any);
  return { service, tx };
}

describe('reservation due milestone payments', () => {
  it('debits only the currently due milestone and leaves future milestones unpaid', async () => {
    const { service, tx } = setup();
    const result: any = await service.payDueMilestones('RW-TEST-1', 'retry-1', { id: 'agent-1', role: 'AGENT' });
    expect(tx.agentWallet.updateMany).toHaveBeenCalledWith({ where: { id: 'wallet-1', balance: { gte: 6000 } }, data: { balance: { decrement: 6000 } } });
    expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: 6000, mode: 'WALLET', verified: true }) }));
    expect(tx.walletTransaction.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: -6000 }) }));
    expect(result.paymentSchedule.milestones.map((item: any) => item.status)).toEqual(['PAID', 'PAID', 'UPCOMING', 'UPCOMING']);
  });

  it('does not mutate anything when the wallet cannot cover the due amount', async () => {
    const { service, tx } = setup(5999);
    await expect(service.payDueMilestones('RW-TEST-1', 'retry-2', { id: 'agent-1', role: 'AGENT' })).rejects.toThrow('Insufficient wallet balance');
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(tx.walletTransaction.create).not.toHaveBeenCalled();
    expect(tx.reservation.update).not.toHaveBeenCalled();
  });

  it('rejects an agent attempting to pay another agent reservation', async () => {
    const { service, tx } = setup();
    await expect(service.payDueMilestones('RW-TEST-1', 'retry-3', { id: 'agent-2', role: 'AGENT' })).rejects.toThrow('own reservations');
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

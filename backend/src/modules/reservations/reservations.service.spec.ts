import { ReservationsService } from './reservations.service';

function reservationFixture(paid = 2000) {
  return {
    id: 'reservation-1', reference: 'RW-TEST-1', createdById: 'agent-1', status: 'CONFIRMED', totalAmount: 20000, balanceAmount: 18000, advanceAmount: 2000,
    paymentTermsSnapshot: { milestones: [
      { percentage: 10, dueType: 'ON_BOOKING', daysBeforeCheckIn: null, amount: 2000, dueAt: '2026-09-01T10:00:00.000Z', sortOrder: 0 },
      { percentage: 30, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 20, amount: 6000, dueAt: '2026-09-20T00:00:00.000Z', sortOrder: 1 },
      { percentage: 20, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 10, amount: 4000, dueAt: '2026-10-01T00:00:00.000Z', sortOrder: 2 },
      { percentage: 40, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 0, amount: 8000, dueAt: '2026-11-30T00:00:00.000Z', sortOrder: 3 },
    ] },
    payments: [{ amount: paid, verified: true, reference: 'WALLET:RW-TEST-1' }],
    createdBy: { id: 'agent-1', role: 'AGENT' },
  };
}

function setup(balance = 10000, paid = 2000) {
  const reservation = reservationFixture(paid);
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

  it('excludes a future partially-paid milestone from the due amount', async () => {
    const { service, tx } = setup(5000, 9000);
    await expect(service.payDueMilestones('RW-TEST-1', 'future-partial', { id: 'agent-1', role: 'AGENT' })).rejects.toThrow('no unpaid milestones due right now');
    expect(tx.agentWallet.updateMany).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('does not allow staff to debit an agent wallet through the self-payment endpoint', async () => {
    const { service, tx } = setup();
    await expect(service.payDueMilestones('RW-TEST-1', 'staff-payment', { id: 'admin-1', role: 'ADMIN' })).rejects.toThrow('own reservations');
    expect(tx.agentWallet.updateMany).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });
});

describe('reservation detail projection', () => {
  function detailFixture() {
    return {
      id: 'reservation-detail-1', reference: 'RW-DETAIL-1', status: 'CONFIRMED', paymentStatus: 'PARTIALLY_PAID', syncStatus: 'SYNCED',
      guestName: 'Aarav Nair', email: 'aarav@example.com', mobile: '+919800000000', address: 'Demo address', gstin: null,
      source: 'AGENT', sourceName: 'Demo Travels', checkIn: new Date('2026-09-26T00:00:00.000Z'), checkOut: new Date('2026-09-28T00:00:00.000Z'), currency: 'INR',
      totalAmount: 15000, taxAmount: 0, advanceAmount: 7500, balanceAmount: 7500, paymentTermsSnapshot: null,
      specialRequest: 'Late arrival', billingInstruction: 'Collect balance at check-in', internalRemark: 'Front desk only', createdAt: new Date('2026-09-01T10:00:00.000Z'),
      createdBy: { id: 'admin-1', name: 'Admin' }, reconfirmedAt: null, reconfirmedBy: null,
      hotel: { id: 'hotel-1', name: 'RainWood Demo', slug: 'rainwood-demo', city: 'Kodaikanal' },
      lines: [{ roomType: { id: 'room-1', name: 'Premium Valley Room' }, ratePlan: { id: 'plan-1', name: 'CP' }, checkIn: new Date('2026-09-26T00:00:00.000Z'), checkOut: new Date('2026-09-28T00:00:00.000Z'), rooms: 1, adults: 2, children: 0, nightlyRate: 7500, taxAmount: 0, lineTotal: 15000, nights: [{ date: new Date('2026-09-26T00:00:00.000Z'), rooms: 1, amount: 7500, taxAmount: 0, totalAmount: 7500 }] }],
      payments: [{ id: 'payment-1', amount: 7500, mode: 'UPI', verified: true, paidAt: new Date('2026-09-01T10:00:00.000Z'), createdAt: new Date('2026-09-01T10:00:00.000Z') }],
    };
  }

  it('returns operational detail fields and protects internal remarks by role', async () => {
    const reservation = detailFixture();
    const prisma: any = { reservation: { findUnique: jest.fn().mockResolvedValue(reservation) } };
    const service = new ReservationsService(prisma, {} as any, {} as any, {} as any);

    const viewerDetail: any = await service.get(reservation.reference, true, 'VIEWER');
    expect(viewerDetail).toEqual(expect.objectContaining({ reference: reservation.reference, guestName: 'Aarav Nair', businessType: 'B2B', hotel: expect.objectContaining({ name: 'RainWood Demo' }) }));
    expect(viewerDetail.lines[0]).toEqual(expect.objectContaining({ roomType: { id: 'room-1', name: 'Premium Valley Room' }, ratePlan: { id: 'plan-1', name: 'CP' }, nights: expect.any(Array) }));
    expect(viewerDetail.payments[0]).toEqual(expect.objectContaining({ mode: 'UPI', verified: true }));
    expect(viewerDetail).not.toHaveProperty('internalRemark');

    const adminDetail: any = await service.get(reservation.reference, true, 'ADMIN');
    expect(adminDetail.internalRemark).toBe('Front desk only');
  });
});

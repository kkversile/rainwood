import { ReservationsService } from './reservations.service';
import { Prisma } from '@prisma/client';

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

describe('reservation guest folio charges', () => {
  const actor = { id: 'admin-1' };
  const baseReservation = () => ({ id: 'reservation-folio-1', reference: 'RW-FOLIO-1', status: 'CONFIRMED', currency: 'INR', totalAmount: new Prisma.Decimal(1000), advanceAmount: new Prisma.Decimal(200), balanceAmount: new Prisma.Decimal(800) });
  const charge = (status: 'POSTED' | 'VOIDED', amount: number, id = `charge-${status.toLowerCase()}`) => ({ id, category: 'MINIBAR', description: 'Minibar water', quantity: new Prisma.Decimal(1), unitAmount: new Prisma.Decimal(amount), taxableAmount: new Prisma.Decimal(amount), taxAmount: new Prisma.Decimal(0), totalAmount: new Prisma.Decimal(amount), postingDate: new Date('2026-09-27T00:00:00.000Z'), note: null, status, postedBy: { id: 'admin-1', name: 'Admin' }, voidedAt: status === 'VOIDED' ? new Date() : null, voidedBy: status === 'VOIDED' ? { id: 'admin-1', name: 'Admin' } : null, voidReason: status === 'VOIDED' ? 'Duplicate posting' : null, createdAt: new Date() });

  function setup(rows: any[] = [], status = 'CONFIRMED') {
    const reservation = { ...baseReservation(), status };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const prisma: any = {
      reservation: { findUnique: jest.fn().mockResolvedValue({ ...reservation, folioCharges: rows }) },
      reservationFolioCharge: {
        create: jest.fn().mockResolvedValue({ id: 'charge-created', totalAmount: new Prisma.Decimal(125) }),
        findUnique: jest.fn().mockResolvedValue({ ...charge('POSTED', 125, 'charge-created'), reservation: { id: reservation.id, reference: reservation.reference } }),
        update: jest.fn().mockResolvedValue({ id: 'charge-created', totalAmount: new Prisma.Decimal(125) }),
      },
    };
    const service = new ReservationsService(prisma, {} as any, audit as any, {} as any);
    return { service, prisma, audit, reservation };
  }

  it('posts a dedicated charge, calculates the total, and never edits reservation financials', async () => {
    const { service, prisma, audit, reservation } = setup([charge('POSTED', 125, 'charge-created')]);
    await service.postFolioCharge('RW-FOLIO-1', { category: 'MINIBAR', description: 'Minibar water', quantity: 2, unitAmount: 62.5, postingDate: '2026-09-27' } as any, actor);
    expect(prisma.reservationFolioCharge.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ category: 'MINIBAR', description: 'Minibar water', quantity: new Prisma.Decimal(2), unitAmount: new Prisma.Decimal(62.5), totalAmount: new Prisma.Decimal(125) }) }));
    expect(prisma.reservation).not.toHaveProperty('update');
    expect(reservation.totalAmount.toString()).toBe('1000');
    expect(reservation.balanceAmount.toString()).toBe('800');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FOLIO_CHARGE_POSTED', entityType: 'ReservationFolioCharge' }));
  });

  it('rejects invalid amounts and ineligible reservations before creating a charge', async () => {
    const { service, prisma } = setup();
    await expect(service.postFolioCharge('RW-FOLIO-1', { category: 'MINIBAR', description: 'Water', quantity: 0, unitAmount: 10, postingDate: '2026-09-27' } as any, actor)).rejects.toThrow('quantity');
    expect(prisma.reservationFolioCharge.create).not.toHaveBeenCalled();
    prisma.reservation.findUnique.mockResolvedValueOnce({ ...baseReservation(), status: 'CANCELLED' });
    await expect(service.postFolioCharge('RW-FOLIO-1', { category: 'MINIBAR', description: 'Water', quantity: 1, unitAmount: 10, postingDate: '2026-09-27' } as any, actor)).rejects.toThrow('cannot be posted');
  });

  it('keeps pending, tentative, and completed stays out of the staff-only posting path', async () => {
    for (const status of ['PENDING_PAYMENT', 'TENTATIVE', 'COMPLETED']) {
      const { service, prisma } = setup([], status);
      await expect(service.postFolioCharge('RW-FOLIO-1', { category: 'MINIBAR', description: 'Water', quantity: 1, unitAmount: 10, postingDate: '2026-09-27' } as any, actor, { staffOnly: true })).rejects.toThrow('not eligible for service-staff');
      expect(prisma.reservationFolioCharge.create).not.toHaveBeenCalled();
    }
  });

  it('excludes voided rows from active incidentals while keeping them in the response', async () => {
    const { service } = setup([charge('POSTED', 125), charge('VOIDED', 50)]);
    const result: any = await service.getFolio('RW-FOLIO-1');
    expect(result.charges).toHaveLength(2);
    expect(result.totals.incidentalCharges).toBe(125);
    expect(result.totals.incidentalBalance).toBe(125);
    expect(result.totals.totalOutstanding).toBe(925);
  });

  it('requires a reason, voids rather than deletes, and audits the operation', async () => {
    const { service, prisma, audit } = setup([charge('POSTED', 125, 'charge-created')]);
    await expect(service.voidFolioCharge('RW-FOLIO-1', 'charge-created', { reason: ' ' } as any, actor)).rejects.toThrow('reason');
    await service.voidFolioCharge('RW-FOLIO-1', 'charge-created', { reason: 'Duplicate posting' }, actor);
    expect(prisma.reservationFolioCharge.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'VOIDED', voidReason: 'Duplicate posting' }) }));
    expect(prisma.reservationFolioCharge).not.toHaveProperty('delete');
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'FOLIO_CHARGE_VOIDED', entityType: 'ReservationFolioCharge' }));
  });
});

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
  beforeAll(() => jest.useFakeTimers().setSystemTime(new Date('2026-09-30T12:00:00.000Z')));
  afterAll(() => jest.useRealTimers());

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

describe('reservation list query contract', () => {
  it('uses server-side search and pagination without loading the full database', async () => {
    const p: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN', staffHotelId: null, staffHotel: null }) },
      reservation: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    };
    const service = new ReservationsService(p, {} as any, {} as any, {} as any);
    await service.list({ page: 2, limit: 25, search: 'Ravi Kumar' } as any, 'admin-1');
    expect(p.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25, where: expect.objectContaining({ OR: [
      { reference: { contains: 'Ravi Kumar', mode: 'insensitive' } },
      { guestName: { contains: 'Ravi Kumar', mode: 'insensitive' } },
      { email: { contains: 'Ravi Kumar', mode: 'insensitive' } },
      { mobile: { contains: 'Ravi Kumar', mode: 'insensitive' } },
    ] }) }));
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

describe('checkout settlement', () => {
  function checkoutSetup(overrides: Record<string, any> = {}, actorRole = 'ADMIN') {
    const reservation: any = {
      id: 'reservation-checkout-1', reference: 'RW-CHECKOUT-1', hotelId: 'hotel-1', status: 'CONFIRMED', stayStatus: 'CHECKED_IN',
      guestName: 'Demo Guest', email: 'guest@example.com', mobile: '9999999999', gstin: null,
      totalAmount: new Prisma.Decimal(1000), advanceAmount: new Prisma.Decimal(1000), balanceAmount: new Prisma.Decimal(0),
      checkIn: new Date('2026-09-28T00:00:00.000Z'), checkOut: new Date('2026-09-30T00:00:00.000Z'),
      hotel: { id: 'hotel-1', name: 'RainWood Demo', timezoneName: 'Asia/Kolkata' }, lines: [],
      roomAssignments: [{ id: 'assignment-1', roomId: 'room-1', room: { roomNumber: '101', roomType: { name: 'Deluxe' } } }],
      folioCharges: [{ id: 'charge-1', description: 'Minibar', category: 'MINIBAR', quantity: new Prisma.Decimal(1), totalAmount: new Prisma.Decimal(50), postingDate: new Date('2026-09-28T00:00:00.000Z'), postedBy: { id: 'admin-1', name: 'Admin' } }],
      payments: [{ id: 'payment-1', amount: new Prisma.Decimal(1050), mode: 'CASH', reference: 'receipt-1', paidAt: new Date('2026-09-28T00:00:00.000Z'), verified: true }],
      ...overrides,
    };
    const settlement: any = { id: 'settlement-1', status: 'SETTLED', reservationId: reservation.id, reservationAmount: new Prisma.Decimal(1000), incidentalAmount: new Prisma.Decimal(50), grossAmount: new Prisma.Decimal(1050), paidAmount: new Prisma.Decimal(1050), balanceAmount: new Prisma.Decimal(0), finalFolioNumber: 'RW-FOLIO-2026-DEMO1', settledAt: new Date('2026-09-28T12:00:00.000Z'), snapshot: { finalFolioNumber: 'RW-FOLIO-2026-DEMO1' } };
    const tx: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', name: 'Authenticated Admin', role: actorRole }) },
      reservation: { findUnique: jest.fn().mockResolvedValue(reservation), update: jest.fn().mockResolvedValue({ reference: reservation.reference, stayStatus: 'CHECKED_OUT', checkedOutAt: new Date(), checkedOutBy: { id: 'admin-1', name: 'Admin' } }) },
      room: { update: jest.fn().mockResolvedValue({}) },
      reservationRoomAssignment: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      reservationSettlement: { create: jest.fn().mockResolvedValue(settlement), findUnique: jest.fn().mockResolvedValue(null) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      payment: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'payment-new', amount: new Prisma.Decimal(50) }) },
    };
    const prisma: any = { ...tx, $transaction: jest.fn(async (work: any) => work(tx)) };
    return { service: new ReservationsService(prisma, {} as any, {} as any, {} as any), prisma, tx, reservation, settlement };
  }

  it('does not mutate a checked-in stay when an outstanding balance has no override', async () => {
    const setup = checkoutSetup({ advanceAmount: new Prisma.Decimal(0), balanceAmount: new Prisma.Decimal(1000), payments: [] });
    await expect(setup.service.checkOut('RW-CHECKOUT-1', {}, { id: 'admin-1', role: 'ADMIN' })).rejects.toThrow('Outstanding balance');
    expect(setup.tx.room.update).not.toHaveBeenCalled();
    expect(setup.tx.reservationSettlement.create).not.toHaveBeenCalled();
    expect(setup.tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('creates an immutable final settlement, closes assignments, dirties rooms, and audits both events', async () => {
    const setup = checkoutSetup();
    const result = await setup.service.checkOut('RW-CHECKOUT-1', {}, { id: 'admin-1', role: 'ADMIN' });
    expect(result).toEqual(expect.objectContaining({ stayStatus: 'CHECKED_OUT', finalFolioNumber: expect.stringMatching(/^RW-FOLIO-2026-/) }));
    expect(setup.tx.room.update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data: { status: 'DIRTY' } });
    expect(setup.tx.reservationRoomAssignment.updateMany).toHaveBeenCalled();
    expect(setup.tx.reservationSettlement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reservationId: 'reservation-checkout-1', incidentalAmount: 50, grossAmount: 1050, balanceAmount: 0 }) }));
    expect(setup.tx.auditLog.create).toHaveBeenCalledTimes(2);
    expect(setup.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'GUEST_SETTLED' }) }));
    expect(setup.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'GUEST_CHECKED_OUT' }) }));
  });

  it('is idempotent when the stay is already checked out with a settlement', async () => {
    const setup = checkoutSetup({ stayStatus: 'CHECKED_OUT', settlement: setupSettlement() });
    const result = await setup.service.checkOut('RW-CHECKOUT-1', {}, { id: 'admin-1', role: 'ADMIN' });
    expect(result.finalFolioNumber).toBe('RW-FOLIO-2026-DEMO1');
    expect(setup.tx.reservationSettlement.create).not.toHaveBeenCalled();
    expect(setup.tx.reservation.update).not.toHaveBeenCalled();
  });

  it('returns an idempotent checkout payment without creating a duplicate', async () => {
    const setup = checkoutSetup();
    const existing = { id: 'payment-existing', amount: new Prisma.Decimal(50), idempotencyKey: 'same-key' };
    setup.tx.payment.findUnique.mockResolvedValue(existing);
    const result = await setup.service.recordCheckoutPayment('RW-CHECKOUT-1', { amount: 50, mode: 'CASH', idempotencyKey: 'same-key' } as any, { id: 'admin-1', role: 'ADMIN' });
    expect(result).toBe(existing);
    expect(setup.tx.payment.create).not.toHaveBeenCalled();
  });

  it('records an incidental checkout payment without rewriting reservation accommodation financials', async () => {
    const setup = checkoutSetup({ totalAmount: new Prisma.Decimal(10000), advanceAmount: new Prisma.Decimal(10000), balanceAmount: new Prisma.Decimal(0), folioCharges: [{ totalAmount: new Prisma.Decimal(2000) }], payments: [{ amount: new Prisma.Decimal(10000), verified: true }] });
    await setup.service.recordCheckoutPayment('RW-CHECKOUT-1', { amount: 2000, mode: 'CASH', idempotencyKey: 'incidental-payment-1' } as any, { id: 'admin-1', role: 'ADMIN' });
    expect(setup.tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ amount: new Prisma.Decimal(2000) }) }));
    expect(setup.tx.reservation.update).not.toHaveBeenCalled();
    expect(setup.reservation.totalAmount).toEqual(new Prisma.Decimal(10000));
    expect(setup.reservation.advanceAmount).toEqual(new Prisma.Decimal(10000));
    expect(setup.reservation.balanceAmount).toEqual(new Prisma.Decimal(0));
  });

  it('keeps partially paid accommodation fields unchanged when checkout payment covers only incidentals', async () => {
    const setup = checkoutSetup({ totalAmount: new Prisma.Decimal(10000), advanceAmount: new Prisma.Decimal(6000), balanceAmount: new Prisma.Decimal(4000), folioCharges: [{ totalAmount: new Prisma.Decimal(2000) }], payments: [{ amount: new Prisma.Decimal(6000), verified: true }] });
    await setup.service.recordCheckoutPayment('RW-CHECKOUT-1', { amount: 2000, mode: 'UPI', idempotencyKey: 'incidental-payment-2' } as any, { id: 'admin-1', role: 'ADMIN' });
    expect(setup.tx.reservation.update).not.toHaveBeenCalled();
    expect(setup.reservation.advanceAmount).toEqual(new Prisma.Decimal(6000));
    expect(setup.reservation.balanceAmount).toEqual(new Prisma.Decimal(4000));
  });

  it('allows a reservation user to complete a zero-balance checkout', async () => {
    const setup = checkoutSetup({}, 'RESERVATION');
    await expect(setup.service.checkOut('RW-CHECKOUT-1', {}, { id: 'admin-1', role: 'RESERVATION' })).resolves.toEqual(expect.objectContaining({ stayStatus: 'CHECKED_OUT' }));
  });

  it('rejects a reservation user attempting an outstanding-balance override', async () => {
    const setup = checkoutSetup({ totalAmount: new Prisma.Decimal(1000), advanceAmount: new Prisma.Decimal(0), balanceAmount: new Prisma.Decimal(1000), payments: [], folioCharges: [] }, 'RESERVATION');
    await expect(setup.service.checkOut('RW-CHECKOUT-1', { allowOutstanding: true, overrideReason: 'MANAGEMENT_APPROVAL', authorizedBy: 'General Manager' } as any, { id: 'admin-1', role: 'RESERVATION' })).rejects.toThrow('Only Admin or Super Admin');
  });

  it.each(['ADMIN', 'SUPER_ADMIN'])('stores authenticated %s identity for an outstanding override and ignores spoofed text', async (role) => {
    const setup = checkoutSetup({ totalAmount: new Prisma.Decimal(1000), advanceAmount: new Prisma.Decimal(0), balanceAmount: new Prisma.Decimal(1000), payments: [], folioCharges: [] }, role);
    const result: any = await setup.service.checkOut('RW-CHECKOUT-1', { allowOutstanding: true, overrideReason: 'MANAGEMENT_APPROVAL', authorizedBy: 'General Manager' } as any, { id: 'admin-1', role, name: 'Spoofed Name' });
    expect(result.stayStatus).toBe('CHECKED_OUT');
    expect(setup.tx.reservationSettlement.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ overrideAuthorizedById: 'admin-1', overrideAuthorizedBy: 'Authenticated Admin' }) }));
    expect(result.snapshot.override).toEqual({ reason: 'MANAGEMENT_APPROVAL', authorizedBy: { id: 'admin-1', name: 'Authenticated Admin' } });
    expect(setup.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'GUEST_SETTLED', after: expect.objectContaining({ overrideAuthorizedById: 'admin-1' }) }) }));
  });

  it('requires an override reason even for an authorized Admin', async () => {
    const setup = checkoutSetup({ totalAmount: new Prisma.Decimal(1000), advanceAmount: new Prisma.Decimal(0), balanceAmount: new Prisma.Decimal(1000), payments: [], folioCharges: [] });
    await expect(setup.service.checkOut('RW-CHECKOUT-1', { allowOutstanding: true } as any, { id: 'admin-1', role: 'ADMIN' })).rejects.toThrow('override reason');
  });

  function setupSettlement() { return { id: 'settlement-1', status: 'SETTLED', reservationAmount: new Prisma.Decimal(1000), incidentalAmount: new Prisma.Decimal(50), grossAmount: new Prisma.Decimal(1050), paidAmount: new Prisma.Decimal(1050), balanceAmount: new Prisma.Decimal(0), finalFolioNumber: 'RW-FOLIO-2026-DEMO1', settledAt: new Date(), snapshot: { finalFolioNumber: 'RW-FOLIO-2026-DEMO1' } }; }
});

describe('hotel-local final folio year', () => {
  it('uses the Asia/Kolkata operational year at the UTC midnight boundary', () => {
    const service = new ReservationsService({} as any, {} as any, {} as any, {} as any);
    const folio = (service as any).finalFolioNumber('Asia/Kolkata', new Date('2026-12-31T20:00:00.000Z'));
    expect(folio).toMatch(/^RW-FOLIO-2027-[A-F0-9-]+$/);
  });

  it('uses the UTC hotel year for the same instant', () => {
    const service = new ReservationsService({} as any, {} as any, {} as any, {} as any);
    const folio = (service as any).finalFolioNumber('UTC', new Date('2026-12-31T20:00:00.000Z'));
    expect(folio).toMatch(/^RW-FOLIO-2026-[A-F0-9-]+$/);
  });

  it('keeps the unique final folio pattern', () => {
    const service = new ReservationsService({} as any, {} as any, {} as any, {} as any);
    const first = (service as any).finalFolioNumber('Asia/Kolkata', new Date('2026-09-28T10:00:00.000Z'));
    const second = (service as any).finalFolioNumber('Asia/Kolkata', new Date('2026-09-28T10:00:00.000Z'));
    expect(first).toMatch(/^RW-FOLIO-2026-[A-F0-9-]+$/);
    expect(second).toMatch(/^RW-FOLIO-2026-[A-F0-9-]+$/);
    expect(first).not.toBe(second);
  });
});

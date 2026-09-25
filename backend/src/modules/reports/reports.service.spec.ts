import { ReportsService } from './reports.service';

function reservationFixture() {
  return {
    id: 'reservation-1',
    reference: 'RW-ARRIVAL-1',
    hotel: { id: 'hotel-1', name: 'RainWood Kodaikanal' },
    guestName: 'Asha Guest',
    checkIn: new Date('2026-09-25T00:00:00.000Z'),
    checkOut: new Date('2026-09-27T00:00:00.000Z'),
    source: 'AGENT',
    sourceName: 'Blue Horizon',
    status: 'CONFIRMED',
    paymentStatus: 'PARTIAL',
    totalAmount: 10000,
    advanceAmount: 2500,
    balanceAmount: 7500,
    mobile: '+919999999999',
    gstin: null,
    specialRequest: 'Late arrival',
    billingInstruction: 'Bill company',
    internalRemark: 'Call before arrival',
    createdBy: { id: 'user-1', name: 'Reservation Desk' },
    reconfirmedAt: null,
    reconfirmedBy: null,
    lines: [
      { rooms: 2, adults: 3, children: 1, roomType: { id: 'room-1', name: 'Deluxe Room' } },
      { rooms: 1, adults: 2, children: 0, roomType: { id: 'room-2', name: 'Suite' } },
    ],
    payments: [
      { mode: 'CARD', verified: true, paidAt: new Date('2026-09-20T10:00:00.000Z'), createdAt: new Date('2026-09-20T10:00:00.000Z') },
      { mode: 'UPI', verified: true, paidAt: null, createdAt: new Date('2026-09-22T10:00:00.000Z') },
      { mode: 'CASH', verified: false, paidAt: new Date('2026-09-23T10:00:00.000Z'), createdAt: new Date('2026-09-23T10:00:00.000Z') },
    ],
  };
}

function setup() {
  const prisma: any = {
    reservation: {
      findMany: jest.fn().mockResolvedValue([reservationFixture()]),
      count: jest.fn().mockResolvedValue(1),
    },
    waitlistEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };
  return { service: new ReportsService(prisma), prisma };
}

describe('expected arrivals report', () => {
  it('uses an inclusive date range and returns one aggregated row per reservation', async () => {
    const { service, prisma } = setup();

    const result = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', page: 1, limit: 50 }, { role: 'ADMIN' });
    const where = prisma.reservation.findMany.mock.calls[0][0].where;

    expect(where.checkIn).toEqual({ gte: new Date('2026-09-25T00:00:00.000Z'), lt: new Date('2026-09-26T00:00:00.000Z') });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toEqual(expect.objectContaining({ reference: 'RW-ARRIVAL-1', rooms: 3, adults: 5, children: 1, pax: 6, nights: 2, totalAmount: 10000, advance: 2500, balance: 7500 }));
    expect(result.items[0].roomTypes).toEqual([
      { id: 'room-1', name: 'Deluxe Room', rooms: 2 },
      { id: 'room-2', name: 'Suite', rooms: 1 },
    ]);
  });

  it('selects the latest verified payment mode and hides internal remarks from non-admin roles', async () => {
    const { service } = setup();

    const result = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', page: 1, limit: 50 }, { role: 'VIEWER' });

    expect(result.items[0]).toEqual(expect.objectContaining({ paymentMode: 'UPI', paymentModes: ['CARD', 'UPI'], creditDate: '2026-09-22', internalRemark: null }));
  });

  it('supports status, hotel, reconfirmed and waitlist filters without duplicating reservation totals', async () => {
    const { service, prisma } = setup();
    prisma.waitlistEntry.findMany.mockResolvedValue([{
      id: 'wait-12345678', hotel: { id: 'hotel-1', name: 'RainWood Kodaikanal' }, roomType: { id: 'room-1', name: 'Deluxe Room' },
      guestName: 'Wait Guest', checkIn: new Date('2026-09-25T00:00:00.000Z'), checkOut: new Date('2026-09-26T00:00:00.000Z'), rooms: 1, status: 'WAITING',
    }]);

    const result = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', hotelIds: ['hotel-1'], statuses: ['CONFIRMED'], includeWaitlist: true, reconfirmedOnly: true, page: 1, limit: 50 }, { role: 'ADMIN' });
    const where = prisma.reservation.findMany.mock.calls[0][0].where;

    expect(where).toEqual(expect.objectContaining({ hotelId: { in: ['hotel-1'] }, status: { in: ['CONFIRMED'] }, reconfirmedAt: { not: null } }));
    expect(prisma.waitlistEntry.findMany).toHaveBeenCalled();
    expect(result.summary).toEqual(expect.objectContaining({ reservations: 1, totalAmount: 10000, advance: 2500, waitlist: 1 }));
    expect(result.items.map((item: any) => item.rowType)).toEqual(['RESERVATION', 'WAITLIST']);
  });
});

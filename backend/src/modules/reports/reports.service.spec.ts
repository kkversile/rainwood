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
    $queryRaw: jest.fn().mockResolvedValue([{ source: 'RESERVATION', id: 'reservation-1' }]),
    reservation: {
      findMany: jest.fn().mockResolvedValue([reservationFixture()]),
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: 10000, advanceAmount: 2500, balanceAmount: 7500 } }),
    },
    reservationLine: { aggregate: jest.fn().mockResolvedValue({ _sum: { rooms: 3, adults: 5, children: 1 } }) },
    waitlistEntry: { findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
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
    prisma.$queryRaw.mockResolvedValue([{ source: 'RESERVATION', id: 'reservation-1' }, { source: 'WAITLIST', id: 'wait-12345678' }]);
    prisma.waitlistEntry.count.mockResolvedValue(1);

    const result = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', hotelIds: ['hotel-1'], statuses: ['CONFIRMED'], includeWaitlist: true, reconfirmedOnly: true, page: 1, limit: 50 }, { role: 'ADMIN' });
    const where = prisma.reservation.findMany.mock.calls[0][0].where;

    expect(where).toEqual(expect.objectContaining({ hotelId: { in: ['hotel-1'] }, status: { in: ['CONFIRMED'] }, reconfirmedAt: { not: null } }));
    expect(prisma.waitlistEntry.findMany).toHaveBeenCalled();
    expect(result.summary).toEqual(expect.objectContaining({ reservations: 1, totalAmount: 10000, advance: 2500, waitlist: 1 }));
    expect(result.items.map((item: any) => item.rowType)).toEqual(['RESERVATION', 'WAITLIST']);
  });

  it('adds a lightweight returning-guest summary without exposing CRM notes or spend', async () => {
    const { service, prisma } = setup();
    prisma.reservation.findMany.mockResolvedValue([{ ...reservationFixture(), guestProfile: { id: 'guest-1', preferences: { extraPillow: true, blacklisted: true, secretPreference: 'hidden' }, reservations: [{ status: 'COMPLETED', stayStatus: 'EXPECTED', checkOut: new Date('2026-08-14T00:00:00.000Z') }, { status: 'COMPLETED', stayStatus: 'EXPECTED', checkOut: new Date('2026-07-01T00:00:00.000Z') }] } }]);
    const result: any = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', page: 1, limit: 50 }, { role: 'ADMIN' });
    expect(result.items[0].guestProfile).toEqual({ id: 'guest-1', repeatGuest: true, completedStays: 2, lastStay: new Date('2026-08-14T00:00:00.000Z') });
    expect(result.items[0].guestProfile).not.toHaveProperty('preferences');
  });

  it('loads only the bounded global page and preserves pagination totals', async () => {
    const { service, prisma } = setup();
    prisma.reservation.findMany.mockResolvedValue([]);
    prisma.reservation.count.mockResolvedValue(75);
    const result = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', page: 2, limit: 25 }, { role: 'ADMIN' });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(prisma.reservation.findMany.mock.calls[0][0].where.id).toEqual({ in: ['reservation-1'] });
    expect(prisma.reservation.findMany.mock.calls[0][0]).not.toHaveProperty('take');
    expect(result.items).toHaveLength(0);
    expect(result.pagination).toEqual(expect.objectContaining({ page: 2, limit: 25, total: 75, pages: 3 }));
  });

  it('returns every SQL-paginated page without applying a second in-memory slice', async () => {
    const { service, prisma } = setup();
    const rows = [
      { id: 'reservation-1', reference: 'RW-PAGE-1' },
      { id: 'reservation-2', reference: 'RW-PAGE-2' },
      { id: 'reservation-3', reference: 'RW-PAGE-3' },
    ];
    prisma.$queryRaw
      .mockResolvedValueOnce([{ source: 'RESERVATION', id: rows[0].id }])
      .mockResolvedValueOnce([{ source: 'RESERVATION', id: rows[1].id }])
      .mockResolvedValueOnce([{ source: 'RESERVATION', id: rows[2].id }]);
    prisma.reservation.count.mockResolvedValue(3);
    prisma.reservation.findMany
      .mockResolvedValueOnce([{ ...reservationFixture(), id: rows[0].id, reference: rows[0].reference }])
      .mockResolvedValueOnce([{ ...reservationFixture(), id: rows[1].id, reference: rows[1].reference }])
      .mockResolvedValueOnce([{ ...reservationFixture(), id: rows[2].id, reference: rows[2].reference }]);

    const page1 = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', page: 1, limit: 1 }, { role: 'ADMIN' });
    const page2 = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', page: 2, limit: 1 }, { role: 'ADMIN' });
    const lastPage = await service.expectedArrivals({ from: '2026-09-25', to: '2026-09-25', page: 3, limit: 1 }, { role: 'ADMIN' });

    expect(page1.items.map((item) => item.reference)).toEqual(['RW-PAGE-1']);
    expect(page2.items.map((item) => item.reference)).toEqual(['RW-PAGE-2']);
    expect(lastPage.items.map((item) => item.reference)).toEqual(['RW-PAGE-3']);
    expect(prisma.reservation.findMany.mock.calls.every((call: any[]) => !Object.prototype.hasOwnProperty.call(call[0], 'take'))).toBe(true);
  });
});

describe('room rack report', () => {
  const room = (id: string, roomNumber: string, roomTypeId: string, roomTypeName: string, floor = '1', wing = 'A', status = 'AVAILABLE') => ({ id, roomNumber, floor, wing, status, roomType: { id: roomTypeId, name: roomTypeName }, housekeepingTasks: [], maintenanceTickets: [] });
  const line = (id: string, roomTypeId: string, roomTypeName: string, rooms = 1, checkIn = '2026-10-01', checkOut = '2026-10-04') => ({ id, rooms, adults: 2, children: 0, checkIn: new Date(`${checkIn}T00:00:00.000Z`), checkOut: new Date(`${checkOut}T00:00:00.000Z`), roomType: { id: roomTypeId, name: roomTypeName } });
  const assignment = (id: string, reservationLineId: string | null, roomValue: any, assignedAt: string, unassignedAt: string | null = null) => ({ id, reservationLineId, roomId: roomValue.id, assignedAt: new Date(assignedAt), unassignedAt: unassignedAt ? new Date(unassignedAt) : null, reason: null, room: roomValue });
  const reservation = (id: string, reference: string, lines: any[], roomAssignments: any[], stayStatus = 'EXPECTED', status = 'CONFIRMED') => ({ id, reference, guestName: `${reference} Guest`, checkIn: lines[0].checkIn, checkOut: lines[0].checkOut, status, stayStatus, source: 'DIRECT', balanceAmount: 0, lines, roomAssignments });
  function scenario(rooms: any[], reservations: any[]) {
    const prisma: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'RainWood', timezoneName: 'Asia/Kolkata' }) },
      room: { findMany: jest.fn() },
      reservation: { findMany: jest.fn().mockResolvedValue(reservations) },
    };
    prisma.room.findMany.mockImplementation((args: any) => args.select ? rooms.map((item) => ({ floor: item.floor, wing: item.wing, status: item.status, roomType: item.roomType })) : rooms);
    return { service: new ReportsService(prisma), prisma };
  }

  it('returns physical rooms, assigned blocks, and an unassigned lane without inventing room assignments', async () => {
    const { service, prisma } = setup();
    prisma.hotel = { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'RainWood Kodaikanal', timezoneName: 'Asia/Kolkata' }) };
    prisma.room = { findMany: jest.fn().mockResolvedValue([{ id: 'room-101', roomNumber: '101', floor: '1', wing: 'A', status: 'OCCUPIED', roomType: { id: 'room-type-1', name: 'Deluxe Room' }, housekeepingTasks: [], maintenanceTickets: [] }]) };
    prisma.reservation.findMany.mockResolvedValue([
      { id: 'reservation-assigned', reference: 'RW-ASSIGNED', guestName: 'Assigned Guest', checkIn: new Date('2026-10-02T00:00:00.000Z'), checkOut: new Date('2026-10-04T00:00:00.000Z'), status: 'CONFIRMED', stayStatus: 'CHECKED_IN', source: 'DIRECT', balanceAmount: 0, lines: [{ id: 'line-1', rooms: 1, adults: 2, children: 0, checkIn: new Date('2026-10-02T00:00:00.000Z'), checkOut: new Date('2026-10-04T00:00:00.000Z'), roomType: { id: 'room-type-1', name: 'Deluxe Room' } }], roomAssignments: [{ id: 'assignment-1', reservationLineId: 'line-1', roomId: 'room-101', assignedAt: new Date('2026-10-02T02:00:00.000Z'), unassignedAt: null, reason: null, room: { id: 'room-101', roomNumber: '101', floor: '1', wing: 'A', roomType: { id: 'room-type-1', name: 'Deluxe Room' } } }] },
      { id: 'reservation-unassigned', reference: 'RW-UNASSIGNED', guestName: 'Pending Guest', checkIn: new Date('2026-10-03T00:00:00.000Z'), checkOut: new Date('2026-10-05T00:00:00.000Z'), status: 'CONFIRMED', stayStatus: 'EXPECTED', source: 'DIRECT', balanceAmount: 100, lines: [{ id: 'line-2', rooms: 1, adults: 1, children: 0, checkIn: new Date('2026-10-03T00:00:00.000Z'), checkOut: new Date('2026-10-05T00:00:00.000Z'), roomType: { id: 'room-type-1', name: 'Deluxe Room' } }], roomAssignments: [] },
    ]);

    const result = await service.roomRack({ hotelId: 'hotel-1', from: '2026-10-02', days: 7, page: 1, limit: 50 });
    expect(result.range).toEqual(expect.objectContaining({ from: '2026-10-02', days: 7 }));
    expect(result.rooms[0].assignments[0]).toEqual(expect.objectContaining({ reference: 'RW-ASSIGNED', checkIn: '2026-10-02', checkOut: '2026-10-04' }));
    expect(result.unassignedReservations).toEqual([expect.objectContaining({ reference: 'RW-UNASSIGNED', remainingRooms: 1 })]);
    expect(result.summary).toEqual(expect.objectContaining({ physicalRooms: 1, assignedRoomNights: 2, unassignedReservations: 1 }));
  });

  it('rejects a date range longer than thirty-one days', async () => {
    const { service, prisma } = setup();
    prisma.hotel = { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'RainWood', timezoneName: 'Asia/Kolkata' }) };
    await expect(service.roomRack({ hotelId: 'hotel-1', from: '2026-10-01', to: '2026-11-02', days: 31, page: 1, limit: 50 })).rejects.toThrow('cannot exceed 31 days');
  });

  it('recognizes a fully assigned historical checked-out stay from assignment intervals', async () => {
    const physicalRoom = room('room-101', '101', 'deluxe', 'Deluxe Room');
    const stayLine = line('line-history', 'deluxe', 'Deluxe Room');
    const { service } = scenario([physicalRoom], [reservation('history', 'RW-HISTORY', [stayLine], [assignment('assignment-history', stayLine.id, physicalRoom, '2026-09-30T04:00:00.000Z', '2026-10-04T10:00:00.000Z')], 'CHECKED_OUT', 'COMPLETED')]);

    const result = await service.roomRack({ hotelId: 'hotel-1', from: '2026-10-01', days: 7, page: 1, limit: 50 });

    expect(result.unassignedReservations).toHaveLength(0);
    expect(result.assignments[0]).toEqual(expect.objectContaining({ stayStatus: 'CHECKED_OUT', checkIn: '2026-10-01', checkOut: '2026-10-04' }));
  });

  it('reports only the incomplete reservation line and keeps room-type filtering out of floor/wing/status semantics', async () => {
    const deluxeRoom = room('room-101', '101', 'deluxe', 'Deluxe Room', '1', 'A', 'AVAILABLE');
    const suiteRoom = room('room-201', '201', 'suite', 'Suite', '2', 'B', 'OUT_OF_ORDER');
    const deluxeLine = line('line-deluxe', 'deluxe', 'Deluxe Room');
    const suiteLine = line('line-suite', 'suite', 'Suite');
    const { service } = scenario([deluxeRoom, suiteRoom], [reservation('multi', 'RW-MULTI', [deluxeLine, suiteLine], [assignment('assignment-deluxe', deluxeLine.id, deluxeRoom, '2026-10-01T02:00:00.000Z')])]);

    const result = await service.roomRack({ hotelId: 'hotel-1', from: '2026-10-01', days: 7, roomTypeId: 'suite', floor: '99', wing: 'Missing', roomStatus: 'DIRTY', page: 1, limit: 50 });

    expect(result.unassignedReservations[0].unassignedLines).toEqual([{ reservationLineId: 'line-suite', roomType: { id: 'suite', name: 'Suite' }, requiredRooms: 1, assignedRooms: 0, remainingRooms: 1 }]);
    expect(result.facets).toEqual(expect.objectContaining({ roomTypes: [{ id: 'deluxe', name: 'Deluxe Room' }, { id: 'suite', name: 'Suite' }], floors: ['1', '2'], wings: ['A', 'B'], roomStatuses: ['AVAILABLE', 'OUT_OF_ORDER'] }));
  });

  it('keeps assignment conflicts visible without double-counting occupancy room nights', async () => {
    const physicalRoom = room('room-101', '101', 'deluxe', 'Deluxe Room');
    const firstLine = line('line-one', 'deluxe', 'Deluxe Room', 1, '2026-10-01', '2026-10-03');
    const secondLine = line('line-two', 'deluxe', 'Deluxe Room', 1, '2026-10-02', '2026-10-04');
    const first = reservation('one', 'RW-ONE', [firstLine], [assignment('assignment-one', firstLine.id, physicalRoom, '2026-10-01T01:00:00.000Z')], 'CHECKED_IN');
    const second = reservation('two', 'RW-TWO', [secondLine], [assignment('assignment-two', secondLine.id, physicalRoom, '2026-10-02T01:00:00.000Z')], 'CHECKED_IN');
    const { service, prisma } = scenario([physicalRoom], [first, second]);

    const result = await service.roomRack({ hotelId: 'hotel-1', from: '2026-10-01', days: 7, page: 1, limit: 50 });

    expect(result.conflicts).toEqual([expect.objectContaining({ roomNumber: '101', date: '2026-10-02', reservations: expect.arrayContaining([expect.objectContaining({ reference: 'RW-ONE' }), expect.objectContaining({ reference: 'RW-TWO' })]) })]);
    expect(result.summary.assignedRoomNights).toBe(3);
    expect(result.summary.occupancyPercent).toBeLessThanOrEqual(100);
    expect(prisma.hotel.findUnique).toHaveBeenCalledTimes(1);
    expect(prisma.room.findMany).toHaveBeenCalledTimes(2);
    expect(prisma.reservation.findMany).toHaveBeenCalledTimes(1);
  });
});

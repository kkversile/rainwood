import { Prisma } from '@prisma/client';
import { toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { ManagementDashboardService } from './management-dashboard.service';

function setup(overrides: Record<string, any> = {}) {
  const hotel = { id: 'hotel-1', name: 'RainWood Demo', timezoneName: 'Asia/Kolkata', active: true };
  const admin = { role: 'CORPORATE_ADMIN', staffHotelId: null, staffHotel: null };
  const night = { rooms: 2, totalAmount: new Prisma.Decimal(200), reservationLine: { roomType: { id: 'type-1', name: 'Deluxe' }, reservation: { id: 'reservation-1', source: 'DIRECT' } } };
  const p: any = {
    user: { findUnique: jest.fn().mockResolvedValue(admin) }, hotel: { findUnique: jest.fn().mockResolvedValue(hotel) },
    hotelBusinessDay: { findMany: jest.fn().mockResolvedValue([]) },
    room: { findMany: jest.fn().mockResolvedValue([{ status: 'OCCUPIED' }, { status: 'AVAILABLE' }, { status: 'DIRTY' }, { status: 'OUT_OF_ORDER' }]) },
    reservationRoomNight: { findMany: jest.fn().mockResolvedValue([night]) },
    reservationFolioCharge: { findMany: jest.fn().mockResolvedValue([{ totalAmount: new Prisma.Decimal(30) }]) },
    payment: { findMany: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(50) }]) },
    reservation: { count: jest.fn().mockResolvedValue(1), findMany: jest.fn().mockResolvedValue([{ totalAmount: new Prisma.Decimal(300), folioCharges: [{ totalAmount: new Prisma.Decimal(20) }], payments: [{ amount: new Prisma.Decimal(50) }] }]) },
    maintenanceTicket: { count: jest.fn().mockResolvedValue(2) },
    expense: { aggregate: jest.fn().mockResolvedValue({ _sum: { totalAmount: null } }) },
  };
  Object.assign(p, overrides);
  return { service: new ManagementDashboardService(p), p, hotel };
}

describe('ManagementDashboardService', () => {
  it('uses nightly values and excludes OOO inventory from occupancy', async () => {
    const { service, p } = setup();
    const result: any = await service.dashboard('admin-1', { hotelId: 'hotel-1' });
    expect(result.kpis.occupancy).toBe(66.67);
    expect(result.kpis.adr).toBe(100);
    expect(result.kpis.revpar).toBe(66.67);
    expect(result.kpis.roomRevenue).toBe(200);
    expect(result.kpis.incidentalRevenue).toBe(30);
    expect(result.kpis.grossRevenue).toBe(230);
    expect(result.kpis.paymentsReceived).toBe(50);
    expect(result.kpis.outstandingBalance).toBe(270);
    expect(result.operations.outOfOrderRooms).toBe(1);
    expect(result.sources[0]).toEqual(expect.objectContaining({ source: 'DIRECT', reservations: 1, roomNights: 2, roomRevenue: 200 }));
    expect(result.roomTypes[0]).toEqual(expect.objectContaining({ roomType: 'Deluxe', roomNights: 2, adr: 100 }));
    const paymentWhere = p.payment.findMany.mock.calls[0][0].where;
    expect(paymentWhere.OR[0].paidAt.gte.toISOString()).toBe(`${toDateOnly(new Date(getHotelOperationalDate('Asia/Kolkata').getTime() - 86_400_000))}T18:30:00.000Z`);
  });

  it('uses a closed immutable snapshot for historical dashboard days', async () => {
    const { service, p } = setup();
    const current = getHotelOperationalDate('Asia/Kolkata'); const historical = new Date(current.getTime() - 86_400_000); const snapshot = { occupancy: { occupiedRooms: 1, sellableRooms: 2 }, revenue: { roomRevenue: 1000, incidentalRevenue: 25 }, payments: { total: 400 }, stays: { arrivals: 3, departures: 2, inHouse: 1 }, operations: { dirtyRooms: 1, cleaningRooms: 0, outOfOrderRooms: 0, openMaintenanceTickets: 1 } };
    p.hotelBusinessDay.findMany.mockResolvedValue([{ businessDate: historical, status: 'CLOSED', summary: snapshot }]);
    p.reservationRoomNight.findMany.mockResolvedValue([{ date: historical, rooms: 1, totalAmount: new Prisma.Decimal(1000), reservationLine: { roomType: { id: 'type-1', name: 'Deluxe' }, reservation: { id: 'reservation-1', source: 'AGENT' } } }]);
    const result: any = await service.dashboard('admin-1', { hotelId: 'hotel-1', from: toDateOnly(historical), to: toDateOnly(historical) });
    expect(result.kpis.roomRevenue).toBe(1000);
    expect(result.kpis.incidentalRevenue).toBe(25);
    expect(result.kpis.occupancy).toBe(50);
    expect(p.room.findMany).not.toHaveBeenCalled();
  });

  it('uses explicit snapshot nights, breakdowns, and period-end operational state', async () => {
    const { service, p } = setup();
    const current = getHotelOperationalDate('Asia/Kolkata'); const historical = new Date(current.getTime() - 86_400_000);
    const snapshot = { occupancy: { occupiedRooms: 0, occupiedRoomNights: 2, sellableRooms: 4, sellableRoomNights: 4, availableRooms: 1 }, revenue: { roomRevenue: 10000, incidentalRevenue: 250 }, payments: { total: 5000 }, balances: { outstandingGuestBalance: 7500 }, stays: { arrivals: 3, departures: 2, inHouse: 4 }, operations: { dirtyRooms: 2, cleaningRooms: 1, outOfOrderRooms: 1, openMaintenanceTickets: 3 }, sourcePerformance: [{ source: 'AGENT', reservationIds: ['res-agent'], reservations: 1, roomNights: 2, roomRevenue: 10000 }], roomTypePerformance: [{ roomTypeId: 'type-deluxe', roomTypeName: 'Deluxe', roomNights: 2, roomRevenue: 10000, adr: 5000 }] };
    p.hotelBusinessDay.findMany.mockResolvedValue([{ businessDate: historical, status: 'CLOSED', summary: snapshot }]);
    const result: any = await service.dashboard('admin-1', { hotelId: 'hotel-1', from: toDateOnly(historical), to: toDateOnly(historical) });
    expect(result.kpis).toEqual(expect.objectContaining({ occupancy: 50, adr: 5000, revpar: 2500, roomRevenue: 10000, incidentalRevenue: 250, paymentsReceived: 5000, outstandingBalance: 7500, inHouse: 4, occupiedRoomNights: 2, sellableRoomNights: 4 }));
    expect(result.operations).toEqual({ roomsAvailable: 1, dirtyRooms: 2, cleaningRooms: 1, outOfOrderRooms: 1, openMaintenanceTickets: 3 });
    expect(result.sources).toEqual([{ source: 'AGENT', reservations: 1, roomNights: 2, roomRevenue: 10000 }]);
    expect(result.roomTypes).toEqual([{ roomTypeId: 'type-deluxe', roomType: 'Deluxe', roomNights: 2, roomRevenue: 10000, adr: 5000 }]);
  });

  it('combines closed snapshot and current live breakdowns while using current period-end state', async () => {
    const { service, p } = setup();
    const current = getHotelOperationalDate('Asia/Kolkata'); const historical = new Date(current.getTime() - 86_400_000);
    p.hotelBusinessDay.findMany.mockResolvedValue([{ businessDate: historical, status: 'CLOSED', summary: { occupancy: { occupiedRoomNights: 1, sellableRoomNights: 2, availableRooms: 1 }, revenue: { roomRevenue: 1000, incidentalRevenue: 10 }, payments: { total: 100 }, balances: { outstandingGuestBalance: 999 }, stays: { arrivals: 1, departures: 1, inHouse: 1 }, operations: { dirtyRooms: 2, cleaningRooms: 0, outOfOrderRooms: 0, openMaintenanceTickets: 1 }, sourcePerformance: [{ source: 'AGENT', reservationIds: ['old-res'], reservations: 1, roomNights: 1, roomRevenue: 1000 }], roomTypePerformance: [{ roomTypeId: 'type-old', roomTypeName: 'Standard', roomNights: 1, roomRevenue: 1000, adr: 1000 }] } }]);
    const result: any = await service.dashboard('admin-1', { hotelId: 'hotel-1', from: toDateOnly(historical), to: toDateOnly(current) });
    expect(result.kpis.roomRevenue).toBe(1200);
    expect(result.kpis.outstandingBalance).toBe(270);
    expect(result.kpis.inHouse).toBe(1);
    expect(result.sources.map((row: any) => row.source)).toEqual(expect.arrayContaining(['AGENT', 'DIRECT']));
  });

  it('enforces hotel scope and date range safety', async () => {
    const { service } = setup({ user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN', staffHotelId: 'hotel-own', staffHotel: { id: 'hotel-own', active: true } }) } });
    await expect(service.dashboard('admin-1', { hotelId: 'hotel-other' })).rejects.toThrow('Hotel not found');
    const global = setup();
    await expect(global.service.dashboard('admin-1', { hotelId: 'hotel-1', from: '2025-01-01', to: '2026-12-31' })).rejects.toThrow('cannot exceed 366 days');
  });

  it('keeps mixed legacy and unique source counts independent of row order', () => {
    const { service } = setup();
    const aggregate = (service as any).aggregateSourceRows.bind(service);
    const legacy = { source: 'AGENT', reservationIds: new Set<string>(), legacyReservationCount: 2, roomNights: 2, roomRevenue: 200 };
    const modern = { source: 'AGENT', reservationIds: new Set(['A', 'B']), legacyReservationCount: 0, roomNights: 2, roomRevenue: 300 };
    for (const rows of [[legacy, modern], [modern, legacy]]) {
      const row = aggregate(rows).get('AGENT');
      expect(row.reservationIds.size + row.legacyReservationCount).toBe(4);
      expect(row.roomNights).toBe(4);
    }
  });

  it('deduplicates modern reservation IDs across source rows', () => {
    const { service } = setup();
    const row = (service as any).aggregateSourceRows([
      { source: 'WEBSITE', reservationIds: new Set(['A', 'B']), legacyReservationCount: 0, roomNights: 2, roomRevenue: 200 },
      { source: 'WEBSITE', reservationIds: new Set(['B', 'C']), legacyReservationCount: 0, roomNights: 2, roomRevenue: 300 },
    ]).get('WEBSITE');
    expect(row.reservationIds.size).toBe(3);
    expect(row.legacyReservationCount).toBe(0);
  });
});

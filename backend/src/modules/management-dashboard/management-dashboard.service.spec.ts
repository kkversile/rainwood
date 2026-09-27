import { Prisma } from '@prisma/client';
import { toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { ManagementDashboardService } from './management-dashboard.service';

function setup(overrides: Record<string, any> = {}) {
  const hotel = { id: 'hotel-1', name: 'RainWood Demo', timezoneName: 'Asia/Kolkata', active: true };
  const admin = { role: 'ADMIN', staffHotelId: null };
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
    const result: any = await service.dashboard('admin-1', { hotelId: 'hotel-1', from: toDateOnly(historical), to: toDateOnly(historical) });
    expect(result.kpis.roomRevenue).toBe(1000);
    expect(result.kpis.incidentalRevenue).toBe(25);
    expect(result.kpis.occupancy).toBe(50);
    expect(p.room.findMany).not.toHaveBeenCalled();
  });

  it('enforces hotel scope and date range safety', async () => {
    const { service } = setup({ user: { findUnique: jest.fn().mockResolvedValue({ role: 'ADMIN', staffHotelId: 'hotel-own' }) } });
    await expect(service.dashboard('admin-1', { hotelId: 'hotel-other' })).rejects.toThrow('Hotel not found');
    const global = setup();
    await expect(global.service.dashboard('admin-1', { hotelId: 'hotel-1', from: '2025-01-01', to: '2026-12-31' })).rejects.toThrow('cannot exceed 366 days');
  });
});

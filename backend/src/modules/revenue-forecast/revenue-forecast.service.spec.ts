import { RevenueForecastService } from './revenue-forecast.service';

jest.mock('../../common/role-scope', () => ({
  getActorScope: jest.fn().mockResolvedValue({ role: 'CORPORATE_ADMIN', hotelId: null, isGlobal: true }),
  resolveRequestedHotel: jest.fn((_scope: unknown, hotelId?: string) => hotelId ?? 'hotel-1'),
}));

describe('RevenueForecastService', () => {
  it('captures immutable room-type and aggregate snapshots from authoritative inventory and room nights', async () => {
    const created: any[] = [];
    const p: any = {
      roomType: { findMany: jest.fn().mockResolvedValue([{ id: 'room-type-1', name: 'Deluxe' }, { id: 'room-type-2', name: 'Suite' }]) },
      inventoryDay: { findMany: jest.fn().mockResolvedValue([
        { roomTypeId: 'room-type-1', date: new Date('2026-10-01T00:00:00.000Z'), available: 4, held: 1 },
        { roomTypeId: 'room-type-2', date: new Date('2026-10-01T00:00:00.000Z'), available: 2, held: 0 },
      ]) },
      reservationRoomNight: { findMany: jest.fn().mockResolvedValue([{ date: new Date('2026-10-01T00:00:00.000Z'), rooms: 2, totalAmount: 2400, reservationLine: { roomTypeId: 'room-type-1' } }]) },
      revenueForecastSnapshot: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }: any) => { created.push(data); return { id: `snapshot-${created.length}` }; }) },
    };
    const result = await new RevenueForecastService(p).captureForHotel('hotel-1', new Date('2026-09-30T00:00:00.000Z'), 2);
    expect(result).toMatchObject({ created: 3, existing: 0, availableStayDates: 1 });
    expect(created.find((row) => row.roomTypeId === 'room-type-1')).toMatchObject({ sellableRooms: 4, bookedRooms: 2, heldRooms: 1, roomRevenue: 2400, adr: 1200 });
    expect(created.find((row) => row.roomTypeId === null)).toMatchObject({ sellableRooms: 6, bookedRooms: 2, heldRooms: 1, roomRevenue: 2400, adr: 1200 });
  });

  it('returns pickup, pace, and unavailable states without fabricating missing snapshots', async () => {
    const p: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', timezoneName: 'Asia/Kolkata', active: true }) },
      revenueForecastSnapshot: { findMany: jest.fn().mockResolvedValue([
        { id: 'current', observationDate: new Date('2026-09-30T00:00:00.000Z'), stayDate: new Date('2026-10-01T00:00:00.000Z'), roomTypeId: null, sellableRooms: 10, bookedRooms: 6, heldRooms: 1, roomRevenue: 7200, adr: 1200, roomType: null },
        { id: 'prior', observationDate: new Date('2026-09-23T00:00:00.000Z'), stayDate: new Date('2026-10-01T00:00:00.000Z'), roomTypeId: null, sellableRooms: 10, bookedRooms: 4, heldRooms: 0, roomRevenue: 4800, adr: 1200, roomType: null },
      ]) },
    };
    const result: any = await new RevenueForecastService(p).forecast('user-1', { hotelId: 'hotel-1', observationDate: '2026-09-30', from: '2026-10-01', to: '2026-10-02', pickupWindows: '7' } as any);
    expect(result.rows[0]).toMatchObject({ available: true, bookedRooms: 6, occupancyPercent: 60, projectedBookedRooms: 8, demandSignal: 'HIGH' });
    expect(result.rows[0].pickup['7']).toBe(2);
    expect(result.rows[0].pace['7']).toBeCloseTo(0.29, 2);
    expect(result.rows[1]).toMatchObject({ available: false, bookedRooms: null, occupancyPercent: null, demandSignal: 'UNAVAILABLE' });
  });
});

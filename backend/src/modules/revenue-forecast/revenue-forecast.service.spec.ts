import { ReservationStatus } from '@prisma/client';
import { addDays, toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { COMMITTED_OTB_STATUSES, isCommittedOtbStatus, REVENUE_FORECAST_HORIZON_DAYS, REVENUE_FORECAST_SNAPSHOT_LOOKBACK_DAYS } from './revenue-forecast.constants';
import { RevenueForecastService } from './revenue-forecast.service';

jest.mock('../../common/role-scope', () => ({
  getActorScope: jest.fn().mockResolvedValue({ role: 'CORPORATE_ADMIN', hotelId: null, isGlobal: true }),
  resolveRequestedHotel: jest.fn((_scope: unknown, hotelId?: string) => hotelId ?? 'hotel-1'),
}));

const current = () => getHotelOperationalDate('Asia/Kolkata');
const date = (value: Date) => new Date(`${toDateOnly(value)}T00:00:00.000Z`);

describe('RevenueForecastService', () => {
  it('uses an explicit committed OTB status list and excludes non-firm lifecycle states', () => {
    expect(COMMITTED_OTB_STATUSES).toEqual([ReservationStatus.CONFIRMED, ReservationStatus.MODIFIED]);
    expect([ReservationStatus.CONFIRMED, ReservationStatus.MODIFIED].filter(isCommittedOtbStatus)).toHaveLength(2);
    expect([ReservationStatus.DRAFT, ReservationStatus.HELD, ReservationStatus.PENDING_PAYMENT, ReservationStatus.TENTATIVE, ReservationStatus.CANCELLED, ReservationStatus.EXPIRED].filter(isCommittedOtbStatus)).toEqual([]);
  });

  it('captures committed room nights while retaining held inventory separately', async () => {
    const created: any[] = []; const stayDate = addDays(current(), 1);
    const p: any = {
      roomType: { findMany: jest.fn().mockResolvedValue([{ id: 'room-type-1' }, { id: 'room-type-2' }]) },
      inventoryDay: { findMany: jest.fn().mockResolvedValue([{ roomTypeId: 'room-type-1', date: stayDate, available: 10, held: 2 }, { roomTypeId: 'room-type-2', date: stayDate, available: 5, held: 0 }]) },
      reservationRoomNight: { findMany: jest.fn().mockResolvedValue([{ date: stayDate, rooms: 5, totalAmount: 25000, reservationLine: { roomTypeId: 'room-type-1' } }]) },
      revenueForecastSnapshot: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }: any) => { created.push(data); return { id: `snapshot-${created.length}` }; }) },
    };
    const result = await new RevenueForecastService(p).captureForHotel('hotel-1', current(), 2);
    const room = created.find((row) => row.roomTypeId === 'room-type-1'); const total = created.find((row) => row.roomTypeId === null);
    expect(result).toMatchObject({ created: 3, availableStayDates: 1, horizonDays: 2 });
    expect(room).toMatchObject({ bookedRooms: 5, heldRooms: 2, roomRevenue: 25000, adr: 5000 });
    expect(total).toMatchObject({ sellableRooms: 15, bookedRooms: 5, heldRooms: 2, roomRevenue: 25000, adr: 5000 });
    const query = p.reservationRoomNight.findMany.mock.calls[0][0];
    expect(query.where.reservationLine.reservation.status).toEqual({ in: ['CONFIRMED', 'MODIFIED'] });
  });

  it('uses live OTB for the current open business date and compares pickup to snapshots', async () => {
    const today = current(); const stayDate = addDays(today, 1); const p: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', timezoneName: 'Asia/Kolkata', active: true }) },
      roomType: { findMany: jest.fn().mockResolvedValue([{ id: 'room-type-1' }]) },
      inventoryDay: { findMany: jest.fn().mockResolvedValue([{ roomTypeId: 'room-type-1', date: stayDate, available: 10, held: 1 }]) },
      reservationRoomNight: { findMany: jest.fn().mockResolvedValue([{ date: stayDate, rooms: 6, totalAmount: 7200, reservationLine: { roomTypeId: 'room-type-1' } }]) },
      revenueForecastSnapshot: { findMany: jest.fn().mockResolvedValue([{ observationDate: addDays(today, -7), stayDate, roomTypeId: null, sellableRooms: 10, bookedRooms: 4, heldRooms: 0, roomRevenue: 4800, adr: 1200, roomType: null }]) },
    };
    const result: any = await new RevenueForecastService(p).forecast('user-1', { hotelId: 'hotel-1', observationDate: toDateOnly(today), from: toDateOnly(stayDate), to: toDateOnly(stayDate), pickupWindows: '7' } as any);
    expect(result.observationSource).toBe('LIVE'); expect(result.rows[0]).toMatchObject({ bookedRooms: 6, roomRevenue: 7200, pickup: { '7': 2 }, pickupRevenue: { '7': 2400 }, demandSignal: 'HIGH' });
  });

  it('uses immutable historical snapshots, returns unavailable when missing, and preserves negative pickup', async () => {
    const today = current(); const observation = addDays(today, -1); const stayDate = addDays(today, 1); const p: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', timezoneName: 'Asia/Kolkata', active: true }) },
      revenueForecastSnapshot: { findMany: jest.fn().mockResolvedValue([
        { observationDate: observation, stayDate, roomTypeId: null, sellableRooms: 10, bookedRooms: 3, heldRooms: 1, roomRevenue: 3000, adr: 1000, roomType: null },
        { observationDate: addDays(observation, -7), stayDate, roomTypeId: null, sellableRooms: 10, bookedRooms: 5, heldRooms: 0, roomRevenue: 5000, adr: 1000, roomType: null },
      ]) },
    };
    const service = new RevenueForecastService(p); const result: any = await service.forecast('user-1', { hotelId: 'hotel-1', observationDate: toDateOnly(observation), from: toDateOnly(stayDate), to: toDateOnly(stayDate), pickupWindows: '7' } as any);
    expect(result.observationSource).toBe('SNAPSHOT'); expect(result.rows[0].pickup['7']).toBe(-2); expect(result.rows[0].pickupRevenue['7']).toBe(-2000);
    p.revenueForecastSnapshot.findMany.mockResolvedValue([]); const missing: any = await service.forecast('user-1', { hotelId: 'hotel-1', observationDate: toDateOnly(addDays(observation, -1)), from: toDateOnly(stayDate), to: toDateOnly(stayDate), pickupWindows: '7' } as any);
    expect(missing.rows[0]).toMatchObject({ available: false, bookedRooms: null, roomRevenue: null, demandSignal: 'UNAVAILABLE' });
  });

  it('aggregates room-type totals across the selected stay-date range and calculates ADR from totals', async () => {
    const observation = addDays(current(), -1); const first = addDays(current(), 1); const second = addDays(first, 1); const p: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', timezoneName: 'Asia/Kolkata', active: true }) },
      revenueForecastSnapshot: { findMany: jest.fn().mockResolvedValue([
        { observationDate: observation, stayDate: first, roomTypeId: 'deluxe', sellableRooms: 10, bookedRooms: 5, heldRooms: 1, roomRevenue: 25000, adr: 5000, roomType: { id: 'deluxe', name: 'Deluxe' } },
        { observationDate: observation, stayDate: second, roomTypeId: 'deluxe', sellableRooms: 10, bookedRooms: 8, heldRooms: 0, roomRevenue: 44000, adr: 5500, roomType: { id: 'deluxe', name: 'Deluxe' } },
      ]) },
    };
    const result: any = await new RevenueForecastService(p).forecast('user-1', { hotelId: 'hotel-1', observationDate: toDateOnly(observation), from: toDateOnly(first), to: toDateOnly(second), pickupWindows: '7' } as any);
    expect(result.roomTypes[0]).toMatchObject({ roomTypeId: 'deluxe', sellableRoomNights: 20, bookedRoomNights: 13, heldRoomNights: 1, roomRevenue: 69000, adr: 5307.69 });
  });

  it('keeps the official capture horizon at 90 days', () => expect(REVENUE_FORECAST_HORIZON_DAYS).toBe(90));

  it('uses the bounded 365-day stay history plus lead-time tolerance for snapshot observations', async () => {
    const today = current(); const stayDate = addDays(today, 14); const historicalStay = addDays(today, -10); const p: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', timezoneName: 'Asia/Kolkata', active: true }) },
      roomType: { findMany: jest.fn().mockResolvedValue([]) },
      revenueForecastSnapshot: { findMany: jest.fn().mockResolvedValue([]) },
      hotelBusinessDay: { findMany: jest.fn().mockResolvedValue([{ businessDate: historicalStay, summary: { occupancy: { occupiedRoomNights: 10 } } }]) },
      rateSeason: { findMany: jest.fn().mockResolvedValue([]) },
    };
    await new RevenueForecastService(p).forecast('user-1', { hotelId: 'hotel-1', observationDate: toDateOnly(today), from: toDateOnly(stayDate), to: toDateOnly(stayDate) } as any);
    const completionQuery = p.revenueForecastSnapshot.findMany.mock.calls.at(-1)[0];
    expect(completionQuery.where.observationDate.gte).toEqual(addDays(today, -REVENUE_FORECAST_SNAPSHOT_LOOKBACK_DAYS));
    expect(completionQuery.where.stayDate).toEqual({ in: [historicalStay] });
  });

  it('returns canonical pre-promotion rate context without averaging multiple rates', async () => {
    const stayDate = new Date('2026-10-10T00:00:00.000Z'); const p: any = {
      ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-1', roomTypeId: 'room-1', name: 'BAR', rates: [{ amount: 5000, baseAmount: 5000, overrideAmount: null, occupancyPrices: null }] }, { id: 'plan-2', roomTypeId: 'room-2', name: 'BAR', rates: [{ amount: 6000, baseAmount: 6000, overrideAmount: 5800, occupancyPrices: null }] }]) },
      inventoryDay: { findMany: jest.fn().mockResolvedValue([{ roomTypeId: 'room-1', available: 20, held: 2, sold: 8 }, { roomTypeId: 'room-2', available: 20, held: 0, sold: 0 }]) },
      rateSeason: { findMany: jest.fn().mockResolvedValue([{ id: 'season-1', name: 'Peak', startDate: stayDate, endDate: stayDate, daysOfWeek: [], adjustmentType: 'PERCENT', adjustmentValue: 20, roomTypes: [], ratePlans: [] }]) },
      yieldRule: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const result: any = await (new RevenueForecastService(p) as any).rateContext('hotel-1', stayDate);
    expect(result).toMatchObject({ available: true, multipleRates: true });
    expect(result.rows[0]).toMatchObject({ effectivePrePromoRate: 6000, season: { id: 'season-1' }, note: 'Pre-Promotion Sell Rate; promotions are intentionally excluded.' });
    expect(result.rows[1]).toMatchObject({ effectivePrePromoRate: 5800, manualOverride: 5800, season: null });
  });

  it('returns an ordered immutable booking curve and appends a live point without persisting it', async () => {
    const today = current(); const stayDate = addDays(today, 5); const p: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', timezoneName: 'Asia/Kolkata', active: true }) },
      roomType: { findUnique: jest.fn().mockResolvedValue({ id: 'room-type-1', hotelId: 'hotel-1' }), findMany: jest.fn().mockResolvedValue([{ id: 'room-type-1' }]) },
      inventoryDay: { findMany: jest.fn().mockResolvedValue([{ roomTypeId: 'room-type-1', date: stayDate, available: 40, held: 2 }]) },
      reservationRoomNight: { findMany: jest.fn().mockResolvedValue([{ date: stayDate, rooms: 30, totalAmount: 30000, reservationLine: { roomTypeId: 'room-type-1' } }]) },
      revenueForecastSnapshot: { findMany: jest.fn().mockResolvedValue([{ observationDate: addDays(today, -2), stayDate, roomTypeId: null, sellableRooms: 40, bookedRooms: 26, heldRooms: 1, roomRevenue: 26000, adr: 1000 }, { observationDate: addDays(today, -5), stayDate, roomTypeId: null, sellableRooms: 40, bookedRooms: 20, heldRooms: 1, roomRevenue: 20000, adr: 1000 }]) },
      hotelBusinessDay: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const result: any = await new RevenueForecastService(p).bookingCurve('user-1', { hotelId: 'hotel-1', stayDate: toDateOnly(stayDate) });
    expect(result.observations.map((row: any) => row.observationDate)).toEqual([toDateOnly(addDays(today, -5)), toDateOnly(addDays(today, -2)), toDateOnly(today)]);
    expect(result.observations.map((row: any) => row.daysBeforeArrival)).toEqual([10, 7, 5]); expect(result.observations.at(-1)).toMatchObject({ source: 'LIVE', bookedRooms: 30 }); expect(p.revenueForecastSnapshot.create).toBeUndefined();
  });

  it('uses five comparable closed dates, median completion, and transparent final-demand math', async () => {
    const today = current(); const stayDate = addDays(today, 14); const finals = [40, 36, 44, 38, 42]; const booked = [30, 28, 32, 29, 31]; const historical = finals.map((_final, index) => addDays(today, -7 * (index + 1))); const p: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', timezoneName: 'Asia/Kolkata', active: true }) },
      roomType: { findMany: jest.fn().mockResolvedValue([{ id: 'room-type-1' }]) },
      inventoryDay: { findMany: jest.fn().mockResolvedValue([{ roomTypeId: 'room-type-1', date: stayDate, available: 40, held: 0 }]) },
      reservationRoomNight: { findMany: jest.fn().mockResolvedValue([{ date: stayDate, rooms: 30, totalAmount: 30000, reservationLine: { roomTypeId: 'room-type-1' } }]) },
      hotelBusinessDay: { findMany: jest.fn().mockResolvedValue(historical.map((businessDate, index) => ({ businessDate, summary: { occupancy: { occupiedRoomNights: finals[index] } } }))) },
      rateSeason: { findMany: jest.fn().mockResolvedValue([]) },
      revenueForecastSnapshot: { findMany: jest.fn().mockResolvedValue(historical.map((stayDateValue, index) => ({ observationDate: addDays(stayDateValue, -14), stayDate: stayDateValue, roomTypeId: null, sellableRooms: finals[index], bookedRooms: booked[index], heldRooms: 0, roomRevenue: booked[index] * 1000, adr: 1000 }))) },
    };
    const result: any = await new RevenueForecastService(p).forecast('user-1', { hotelId: 'hotel-1', observationDate: toDateOnly(today), from: toDateOnly(stayDate), to: toDateOnly(stayDate), pickupWindows: '7' } as any);
    expect(result.rows[0].completion).toMatchObject({ available: true, ratio: 0.75, sampleSize: 5, confidence: 'LOW' }); expect(result.rows[0].forecast).toMatchObject({ finalRooms: 40, remainingDemandRooms: 10, occupancyPercent: 100, revenue: null }); expect(result.rows[0].paceComparison).toMatchObject({ status: 'ON_PACE', differenceRooms: 0, historicalMedianOtbAtLead: 30 });
    expect(p.revenueForecastSnapshot.findMany.mock.calls.at(-1)[0].where.observationDate.gte).toEqual(addDays(today, -REVENUE_FORECAST_SNAPSHOT_LOOKBACK_DAYS));
  });
});

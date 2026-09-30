import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { addDays, parseDateOnly, toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { PrismaService } from '../../common/prisma.service';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { RevenueForecastCaptureDto, RevenueForecastQueryDto } from './revenue-forecast.dto';
import { COMMITTED_OTB_STATUSES, REVENUE_FORECAST_HORIZON_DAYS, REVENUE_FORECAST_PICKUP_WINDOWS } from './revenue-forecast.constants';

export type OTBMetric = { stayDate: Date; roomTypeId: string | null; sellableRooms: number; bookedRooms: number; heldRooms: number; roomRevenue: number; adr: number };
type Snapshot = OTBMetric & { id?: string; observationDate: Date; roomType?: { id: string; name: string } | null };
type SnapshotCreate = Omit<OTBMetric, 'stayDate'> & { hotelId: string; observationDate: Date; stayDate: Date };
type OTBCalculation = { totals: OTBMetric[]; roomTypes: OTBMetric[] };

const number = (value: unknown) => Number(value ?? 0);
const money = (value: number) => Number(value.toFixed(2));
const dateKey = (value: Date) => toDateOnly(value);
const key = (observationDate: Date, stayDate: Date) => `${dateKey(observationDate)}:${dateKey(stayDate)}`;

@Injectable()
export class RevenueForecastService {
  constructor(private readonly p: PrismaService) {}

  private async resolveHotel(userId: string, requestedHotelId?: string) {
    const scope = await getActorScope(this.p, userId);
    if (!['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN'].includes(scope.role)) throw new ForbiddenException('Revenue Forecast access is limited to management roles.');
    const hotelId = resolveRequestedHotel(scope, requestedHotelId);
    if (!hotelId) throw new BadRequestException('hotelId is required for a global administrator.');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, timezoneName: true, active: true } });
    if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private windows(value?: string) {
    const parsed = (value ?? REVENUE_FORECAST_PICKUP_WINDOWS.join(',')).split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0 && item <= 30);
    return [...new Set(parsed.length ? parsed : REVENUE_FORECAST_PICKUP_WINDOWS)].sort((a, b) => a - b);
  }

  private observationDate(hotel: { timezoneName: string }, value?: string) {
    const date = value ? parseDateOnly(value, 'observationDate') : getHotelOperationalDate(hotel.timezoneName);
    const current = getHotelOperationalDate(hotel.timezoneName);
    if (dateKey(date) > dateKey(current)) throw new BadRequestException('Future observation dates are not available.');
    return date;
  }

  /** Shared authoritative OTB calculation for live reads and official snapshots. */
  async calculateOtbForStayRange(hotelId: string, stayFrom: Date, stayTo: Date, client: any = this.p): Promise<OTBCalculation> {
    const roomTypes = await client.roomType.findMany({ where: { hotelId, active: true }, select: { id: true } });
    const roomTypeIds = roomTypes.map((roomType: { id: string }) => roomType.id);
    if (!roomTypeIds.length) return { totals: [], roomTypes: [] };
    const [inventory, nights] = await Promise.all([
      client.inventoryDay.findMany({ where: { roomTypeId: { in: roomTypeIds }, date: { gte: stayFrom, lte: stayTo } }, select: { roomTypeId: true, date: true, available: true, held: true } }),
      client.reservationRoomNight.findMany({ where: { date: { gte: stayFrom, lte: stayTo }, reservationLine: { roomTypeId: { in: roomTypeIds }, reservation: { hotelId, status: { in: [...COMMITTED_OTB_STATUSES] as ReservationStatus[] } } } }, select: { date: true, rooms: true, totalAmount: true, reservationLine: { select: { roomTypeId: true } } } }),
    ]);
    const nightTotals = new Map<string, { bookedRooms: number; roomRevenue: number }>();
    for (const night of nights) {
      const rowKey = `${night.reservationLine.roomTypeId}:${dateKey(night.date)}`;
      const bucket = nightTotals.get(rowKey) ?? { bookedRooms: 0, roomRevenue: 0 };
      bucket.bookedRooms += number(night.rooms); bucket.roomRevenue += number(night.totalAmount); nightTotals.set(rowKey, bucket);
    }
    const roomTypesByDate: OTBMetric[] = (inventory as any[]).map((row) => {
      const totals = nightTotals.get(`${row.roomTypeId}:${dateKey(row.date)}`) ?? { bookedRooms: 0, roomRevenue: 0 };
      return { stayDate: row.date, roomTypeId: row.roomTypeId, sellableRooms: Math.max(0, row.available), bookedRooms: totals.bookedRooms, heldRooms: Math.max(0, row.held), roomRevenue: money(totals.roomRevenue), adr: totals.bookedRooms ? money(totals.roomRevenue / totals.bookedRooms) : 0 };
    });
    const totalsByDate = new Map<string, OTBMetric>();
    for (const row of roomTypesByDate) {
      const aggregate = totalsByDate.get(dateKey(row.stayDate)) ?? { stayDate: row.stayDate, roomTypeId: null, sellableRooms: 0, bookedRooms: 0, heldRooms: 0, roomRevenue: 0, adr: 0 };
      aggregate.sellableRooms += row.sellableRooms; aggregate.bookedRooms += row.bookedRooms; aggregate.heldRooms += row.heldRooms; aggregate.roomRevenue += row.roomRevenue; aggregate.adr = aggregate.bookedRooms ? money(aggregate.roomRevenue / aggregate.bookedRooms) : 0; totalsByDate.set(dateKey(row.stayDate), aggregate);
    }
    for (const row of totalsByDate.values()) row.roomRevenue = money(row.roomRevenue);
    return { totals: [...totalsByDate.values()].sort((a, b) => a.stayDate.getTime() - b.stayDate.getTime()), roomTypes: roomTypesByDate.sort((a, b) => a.stayDate.getTime() - b.stayDate.getTime()) };
  }

  /** Captures immutable OTB facts for Night Audit. Repeated calls reuse rows. */
  async captureForHotel(hotelId: string, observationDate: Date, horizon = REVENUE_FORECAST_HORIZON_DAYS) {
    const safeHorizon = Math.min(Math.max(Math.trunc(horizon), 1), REVENUE_FORECAST_HORIZON_DAYS);
    const calculation = await this.calculateOtbForStayRange(hotelId, observationDate, addDays(observationDate, safeHorizon - 1));
    const byDate = new Map<string, OTBMetric[]>();
    for (const row of calculation.roomTypes) byDate.set(dateKey(row.stayDate), [...(byDate.get(dateKey(row.stayDate)) ?? []), row]);
    let created = 0; let existing = 0;
    for (const [stayDateKey, roomRows] of byDate) {
      const stayDate = roomRows[0].stayDate; const aggregate = calculation.totals.find((row) => dateKey(row.stayDate) === stayDateKey);
      const rows: SnapshotCreate[] = roomRows.map((row) => ({ hotelId, observationDate, stayDate, roomTypeId: row.roomTypeId, sellableRooms: row.sellableRooms, bookedRooms: row.bookedRooms, heldRooms: row.heldRooms, roomRevenue: row.roomRevenue, adr: row.adr }));
      if (aggregate) rows.push({ hotelId, observationDate, stayDate, roomTypeId: null, sellableRooms: aggregate.sellableRooms, bookedRooms: aggregate.bookedRooms, heldRooms: aggregate.heldRooms, roomRevenue: aggregate.roomRevenue, adr: aggregate.adr });
      for (const row of rows) {
        const found = await this.p.revenueForecastSnapshot.findFirst({ where: { hotelId, observationDate, stayDate: row.stayDate, roomTypeId: row.roomTypeId }, select: { id: true } });
        if (found) { existing += 1; continue; }
        try { await this.p.revenueForecastSnapshot.create({ data: row }); created += 1; } catch (error: any) { if (error?.code === 'P2002') existing += 1; else throw error; }
      }
    }
    return { created, existing, availableStayDates: byDate.size, observationDate: dateKey(observationDate), horizonDays: safeHorizon };
  }

  async capture(userId: string, body: RevenueForecastCaptureDto) {
    const scope = await getActorScope(this.p, userId);
    if (scope.role !== 'SUPER_ADMIN') throw new ForbiddenException('Manual Revenue Forecast recovery is restricted to SUPER_ADMIN.');
    const hotel = await this.resolveHotel(userId, body.hotelId); const observationDate = this.observationDate(hotel, body.observationDate);
    if (dateKey(observationDate) !== dateKey(getHotelOperationalDate(hotel.timezoneName))) throw new ForbiddenException('Manual recovery is allowed only for the current open business date.');
    return { hotel: { id: hotel.id, name: hotel.name }, ...(await this.captureForHotel(hotel.id, observationDate, body.horizon)) };
  }

  private snapshotMetric(row: any): Snapshot { return { ...row, roomRevenue: number(row.roomRevenue), adr: number(row.adr), roomType: row.roomType }; }

  private aggregateRoomTypes(rows: Snapshot[]) {
    const totals = new Map<string, { roomTypeId: string; roomType: string; sellableRoomNights: number; bookedRoomNights: number; heldRoomNights: number; roomRevenue: number }>();
    for (const row of rows) {
      if (!row.roomTypeId) continue;
      const current = totals.get(row.roomTypeId) ?? { roomTypeId: row.roomTypeId, roomType: row.roomType?.name ?? 'Room type', sellableRoomNights: 0, bookedRoomNights: 0, heldRoomNights: 0, roomRevenue: 0 };
      current.sellableRoomNights += row.sellableRooms; current.bookedRoomNights += row.bookedRooms; current.heldRoomNights += row.heldRooms; current.roomRevenue += row.roomRevenue; totals.set(row.roomTypeId, current);
    }
    return [...totals.values()].map((row) => ({ ...row, roomRevenue: money(row.roomRevenue), adr: row.bookedRoomNights ? money(row.roomRevenue / row.bookedRoomNights) : 0, sellableRooms: row.sellableRoomNights, bookedRooms: row.bookedRoomNights, heldRooms: row.heldRoomNights })).sort((a, b) => b.roomRevenue - a.roomRevenue);
  }

  async forecast(userId: string, query: RevenueForecastQueryDto) {
    const hotel = await this.resolveHotel(userId, query.hotelId); const observation = this.observationDate(hotel, query.observationDate); const currentOperationalDate = getHotelOperationalDate(hotel.timezoneName); const isLive = dateKey(observation) === dateKey(currentOperationalDate);
    const horizon = Math.min(Math.max(Math.trunc(query.horizon ?? REVENUE_FORECAST_HORIZON_DAYS), 1), REVENUE_FORECAST_HORIZON_DAYS); const from = query.from ? parseDateOnly(query.from, 'from') : observation; const to = query.to ? parseDateOnly(query.to, 'to') : addDays(from, horizon - 1); const requestedDays = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (to < from) throw new BadRequestException('to must be on or after from.'); if (requestedDays > REVENUE_FORECAST_HORIZON_DAYS) throw new BadRequestException(`Forecast range cannot exceed ${REVENUE_FORECAST_HORIZON_DAYS} days.`);
    const windows = this.windows(query.pickupWindows); const maxWindow = Math.max(...windows); const dates = Array.from({ length: requestedDays }, (_, index) => addDays(from, index)); const observations = Array.from({ length: maxWindow + 1 }, (_, index) => addDays(observation, -index));
    const snapshots = await this.p.revenueForecastSnapshot.findMany({ where: { hotelId: hotel.id, observationDate: { in: observations }, stayDate: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, include: { roomType: { select: { id: true, name: true } } } });
    const snapshotAggregate = new Map<string, Snapshot>(); const currentSnapshotRoomTypes: Snapshot[] = [];
    for (const row of snapshots as any[]) { const value = this.snapshotMetric(row); if (row.roomTypeId === null) snapshotAggregate.set(key(row.observationDate, row.stayDate), value); if (dateKey(row.observationDate) === dateKey(observation) && row.roomTypeId) currentSnapshotRoomTypes.push(value); }
    const liveCalculation = isLive ? await this.calculateOtbForStayRange(hotel.id, from < observation ? observation : from, to) : null; const liveByDate = new Map((liveCalculation?.totals ?? []).map((row) => [dateKey(row.stayDate), row]));
    const rows = dates.map((stayDate) => {
      const current = isLive ? liveByDate.get(dateKey(stayDate)) : snapshotAggregate.get(key(observation, stayDate)); const pickup: Record<string, number | null> = {}; const pickupRevenue: Record<string, number | null> = {}; const pace: Record<string, number | null> = {}; const revenuePace: Record<string, number | null> = {};
      for (const window of windows) { const previous = snapshotAggregate.get(key(addDays(observation, -window), stayDate)); pickup[String(window)] = current && previous ? current.bookedRooms - previous.bookedRooms : null; pickupRevenue[String(window)] = current && previous ? money(current.roomRevenue - previous.roomRevenue) : null; pace[String(window)] = current && previous ? money((current.bookedRooms - previous.bookedRooms) / window) : null; revenuePace[String(window)] = current && previous ? money((current.roomRevenue - previous.roomRevenue) / window) : null; }
      const pickup7 = pickup[String(windows.includes(7) ? 7 : windows[windows.length - 1])]; const occupancy = current && current.sellableRooms ? money(current.bookedRooms / current.sellableRooms * 100) : null; const projectedBookedRooms = current && pickup7 !== null ? Math.min(current.sellableRooms, current.bookedRooms + Math.max(0, pickup7)) : null;
      const signal = !current ? 'UNAVAILABLE' : occupancy !== null && (occupancy >= 80 || (pickup7 ?? 0) >= Math.max(1, current.sellableRooms * 0.1)) ? 'HIGH' : occupancy !== null && (occupancy >= 50 || (pickup7 ?? 0) > 0) ? 'MEDIUM' : 'LOW';
      const signals = !current ? ['No authoritative data exists for this stay date and observation date.'] : [`OTB occupancy is ${occupancy}% of sellable rooms.`, pickup7 === null ? '7-day pickup is unavailable because the prior snapshot is missing.' : `7-day room pickup is ${pickup7}; negative pickup is retained.`, current.heldRooms ? `${current.heldRooms} room(s) are held separately from committed OTB.` : 'No held inventory is recorded.'];
      return { stayDate: dateKey(stayDate), available: Boolean(current), sellableRooms: current?.sellableRooms ?? null, bookedRooms: current?.bookedRooms ?? null, heldRooms: current?.heldRooms ?? null, roomRevenue: current?.roomRevenue ?? null, adr: current?.adr ?? null, occupancyPercent: occupancy, projectedBookedRooms, demandSignal: signal, signals, pickup, pickupRevenue, pace, revenuePace };
    });
    const availableRows = rows.filter((row) => row.available); const total = availableRows.reduce((sum, row) => ({ sellableRooms: sum.sellableRooms + (row.sellableRooms ?? 0), bookedRooms: sum.bookedRooms + (row.bookedRooms ?? 0), heldRooms: sum.heldRooms + (row.heldRooms ?? 0), roomRevenue: sum.roomRevenue + (row.roomRevenue ?? 0) }), { sellableRooms: 0, bookedRooms: 0, heldRooms: 0, roomRevenue: 0 }); const roomTypeRows = isLive ? (liveCalculation?.roomTypes ?? []).map((row) => ({ ...row, observationDate: observation })) : currentSnapshotRoomTypes; const headline = rows.find((row) => row.stayDate === dateKey(observation)) ?? rows[0] ?? null;
    return { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, observationDate: dateKey(observation), observationSource: isLive ? 'LIVE' : 'SNAPSHOT', from: dateKey(from), to: dateKey(to), pickupWindows: windows, demandSignalRules: { highOccupancyPercent: 80, highPickupRoomsRatio: 0.1, mediumOccupancyPercent: 50 }, summary: { availableDateCount: availableRows.length, requestedDateCount: rows.length, sellableRooms: total.sellableRooms, bookedRooms: total.bookedRooms, heldRooms: total.heldRooms, roomRevenue: money(total.roomRevenue), occupancyPercent: total.sellableRooms ? money(total.bookedRooms / total.sellableRooms * 100) : null, headline }, roomTypes: this.aggregateRoomTypes(roomTypeRows as Snapshot[]), rows };
  }
}

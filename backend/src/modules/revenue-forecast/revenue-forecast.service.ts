import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';
import { addDays, parseDateOnly, toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { PrismaService } from '../../common/prisma.service';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { RevenueForecastCaptureDto, RevenueForecastQueryDto } from './revenue-forecast.dto';

const EXCLUDED: ReservationStatus[] = [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED];
const DEFAULT_WINDOWS = [1, 3, 7, 14, 30];
type Snapshot = { id: string; observationDate: Date; stayDate: Date; roomTypeId: string | null; sellableRooms: number; bookedRooms: number; heldRooms: number; roomRevenue: number; adr: number; roomType?: { id: string; name: string } | null };
type SnapshotCreate = { hotelId: string; observationDate: Date; stayDate: Date; roomTypeId: string | null; sellableRooms: number; bookedRooms: number; heldRooms: number; roomRevenue: number; adr: number };

const number = (value: unknown) => Number(value ?? 0);
const key = (observationDate: Date | string, stayDate: Date | string) => `${toDateOnly(typeof observationDate === 'string' ? parseDateOnly(observationDate, 'date') : observationDate)}:${toDateOnly(typeof stayDate === 'string' ? parseDateOnly(stayDate, 'date') : stayDate)}`;
const money = (value: number) => Number(value.toFixed(2));

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
    const parsed = (value ?? DEFAULT_WINDOWS.join(',')).split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0 && item <= 30);
    return [...new Set(parsed.length ? parsed : DEFAULT_WINDOWS)].sort((a, b) => a - b);
  }

  private observationDate(hotel: { timezoneName: string }, value?: string) {
    const date = value ? parseDateOnly(value, 'observationDate') : getHotelOperationalDate(hotel.timezoneName);
    const current = getHotelOperationalDate(hotel.timezoneName);
    if (toDateOnly(date) > toDateOnly(current)) throw new BadRequestException('Future observation dates are not available.');
    return date;
  }

  /** Captures immutable OTB facts from InventoryDay and ReservationRoomNight. */
  async captureForHotel(hotelId: string, observationDate: Date, horizon = 30) {
    const safeHorizon = Math.min(Math.max(Math.trunc(horizon), 1), 90);
    const stayDates = Array.from({ length: safeHorizon }, (_, index) => addDays(observationDate, index));
    const roomTypes = await this.p.roomType.findMany({ where: { hotelId, active: true }, select: { id: true, name: true } });
    const roomTypeIds = roomTypes.map((roomType) => roomType.id);
    if (!roomTypeIds.length) return { created: 0, existing: 0, availableStayDates: 0, observationDate: toDateOnly(observationDate) };
    const [inventory, nights] = await Promise.all([
      this.p.inventoryDay.findMany({ where: { roomTypeId: { in: roomTypeIds }, date: { in: stayDates } }, select: { roomTypeId: true, date: true, available: true, held: true } }),
      this.p.reservationRoomNight.findMany({ where: { date: { in: stayDates }, reservationLine: { roomTypeId: { in: roomTypeIds }, reservation: { hotelId, status: { notIn: EXCLUDED } } } }, select: { date: true, rooms: true, totalAmount: true, reservationLine: { select: { roomTypeId: true } } } }),
    ]);
    const nightTotals = new Map<string, { bookedRooms: number; roomRevenue: number }>();
    for (const night of nights) {
      const bucket = nightTotals.get(`${night.reservationLine.roomTypeId}:${toDateOnly(night.date)}`) ?? { bookedRooms: 0, roomRevenue: 0 };
      bucket.bookedRooms += number(night.rooms);
      bucket.roomRevenue += number(night.totalAmount);
      nightTotals.set(`${night.reservationLine.roomTypeId}:${toDateOnly(night.date)}`, bucket);
    }
    const inventoryByDate = new Map<string, typeof inventory>();
    for (const row of inventory) inventoryByDate.set(toDateOnly(row.date), [...(inventoryByDate.get(toDateOnly(row.date)) ?? []), row]);
    let created = 0; let existing = 0; let availableStayDates = 0;
    for (const stayDate of stayDates) {
      const rows = inventoryByDate.get(toDateOnly(stayDate)) ?? [];
      if (!rows.length) continue;
      availableStayDates += 1;
      const snapshots: SnapshotCreate[] = rows.map((row) => {
        const totals = nightTotals.get(`${row.roomTypeId}:${toDateOnly(row.date)}`) ?? { bookedRooms: 0, roomRevenue: 0 };
        return { hotelId, observationDate, stayDate: row.date, roomTypeId: row.roomTypeId, sellableRooms: Math.max(0, row.available), bookedRooms: Math.max(0, totals.bookedRooms), heldRooms: Math.max(0, row.held), roomRevenue: money(totals.roomRevenue), adr: totals.bookedRooms ? money(totals.roomRevenue / totals.bookedRooms) : 0 };
      });
      snapshots.push({ hotelId, observationDate, stayDate, roomTypeId: null, sellableRooms: snapshots.reduce((sum, row) => sum + row.sellableRooms, 0), bookedRooms: snapshots.reduce((sum, row) => sum + row.bookedRooms, 0), heldRooms: snapshots.reduce((sum, row) => sum + row.heldRooms, 0), roomRevenue: money(snapshots.reduce((sum, row) => sum + row.roomRevenue, 0)), adr: 0 });
      snapshots[snapshots.length - 1].adr = snapshots[snapshots.length - 1].bookedRooms ? money(snapshots[snapshots.length - 1].roomRevenue / snapshots[snapshots.length - 1].bookedRooms) : 0;
      for (const row of snapshots) {
        const found = await this.p.revenueForecastSnapshot.findFirst({ where: { hotelId, observationDate, stayDate: row.stayDate, roomTypeId: row.roomTypeId }, select: { id: true } });
        if (found) { existing += 1; continue; }
        try { await this.p.revenueForecastSnapshot.create({ data: row }); created += 1; } catch (error: any) { if (error?.code === 'P2002') existing += 1; else throw error; }
      }
    }
    return { created, existing, availableStayDates, observationDate: toDateOnly(observationDate) };
  }

  async capture(userId: string, body: RevenueForecastCaptureDto) {
    const hotel = await this.resolveHotel(userId, body.hotelId);
    return { hotel: { id: hotel.id, name: hotel.name }, ...(await this.captureForHotel(hotel.id, this.observationDate(hotel, body.observationDate), body.horizon)) };
  }

  async forecast(userId: string, query: RevenueForecastQueryDto) {
    const hotel = await this.resolveHotel(userId, query.hotelId);
    const observation = this.observationDate(hotel, query.observationDate);
    const horizon = Math.min(Math.max(Math.trunc(query.horizon ?? 30), 1), 90);
    const from = query.from ? parseDateOnly(query.from, 'from') : observation;
    const to = query.to ? parseDateOnly(query.to, 'to') : addDays(from, horizon - 1);
    if (to < from) throw new BadRequestException('to must be on or after from.');
    if (Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 > 90) throw new BadRequestException('Forecast range cannot exceed 90 days.');
    const windows = this.windows(query.pickupWindows);
    const maxWindow = Math.max(...windows);
    const dates = Array.from({ length: Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1 }, (_, index) => addDays(from, index));
    const observations = Array.from({ length: maxWindow + 1 }, (_, index) => addDays(observation, -index));
    const snapshots = await this.p.revenueForecastSnapshot.findMany({ where: { hotelId: hotel.id, observationDate: { in: observations }, stayDate: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, include: { roomType: { select: { id: true, name: true } } } });
    const aggregate = new Map<string, Snapshot>();
    const roomTypeCurrent = new Map<string, Snapshot>();
    for (const row of snapshots as any[]) {
      const value: Snapshot = { ...row, roomRevenue: number(row.roomRevenue), adr: number(row.adr), roomType: row.roomType };
      const mapKey = key(row.observationDate, row.stayDate);
      if (row.roomTypeId === null) aggregate.set(mapKey, value);
      if (row.observationDate.getTime() === observation.getTime() && row.roomTypeId) roomTypeCurrent.set(row.roomTypeId, value);
    }
    const rows = dates.map((stayDate) => {
      const current = aggregate.get(key(observation, stayDate));
      const pickup: Record<string, number | null> = {}; const pace: Record<string, number | null> = {};
      for (const window of windows) {
        const previous = aggregate.get(key(addDays(observation, -window), stayDate));
        pickup[String(window)] = current && previous ? current.bookedRooms - previous.bookedRooms : null;
        pace[String(window)] = current && previous ? money((current.bookedRooms - previous.bookedRooms) / window) : null;
      }
      const pickup7 = pickup[String(windows.includes(7) ? 7 : windows[windows.length - 1])];
      const occupancy = current && current.sellableRooms ? money(current.bookedRooms / current.sellableRooms * 100) : null;
      const projectedBookedRooms = current && pickup7 !== null ? Math.min(current.sellableRooms, current.bookedRooms + Math.max(0, pickup7)) : null;
      const signal = !current ? 'UNAVAILABLE' : occupancy !== null && (occupancy >= 80 || (pickup7 ?? 0) >= Math.max(1, current.sellableRooms * 0.1)) ? 'HIGH' : occupancy !== null && (occupancy >= 50 || (pickup7 ?? 0) > 0) ? 'MEDIUM' : 'LOW';
      const signals = !current ? ['No immutable snapshot exists for this stay date and observation date.'] : [`OTB occupancy is ${occupancy}% of sellable rooms.`, pickup7 === null ? '7-day pickup is unavailable because the prior snapshot is missing.' : `7-day pickup is ${pickup7} room(s).`, current.heldRooms ? `${current.heldRooms} room(s) are currently held.` : 'No active held inventory is recorded.'];
      return { stayDate: toDateOnly(stayDate), available: Boolean(current), sellableRooms: current?.sellableRooms ?? null, bookedRooms: current?.bookedRooms ?? null, heldRooms: current?.heldRooms ?? null, roomRevenue: current?.roomRevenue ?? null, adr: current?.adr ?? null, occupancyPercent: occupancy, projectedBookedRooms, demandSignal: signal, signals, pickup, pace };
    });
    const availableRows = rows.filter((row) => row.available); const total = availableRows.reduce((sum, row) => ({ sellableRooms: sum.sellableRooms + (row.sellableRooms ?? 0), bookedRooms: sum.bookedRooms + (row.bookedRooms ?? 0), heldRooms: sum.heldRooms + (row.heldRooms ?? 0), roomRevenue: sum.roomRevenue + (row.roomRevenue ?? 0) }), { sellableRooms: 0, bookedRooms: 0, heldRooms: 0, roomRevenue: 0 });
    return { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, observationDate: toDateOnly(observation), from: toDateOnly(from), to: toDateOnly(to), pickupWindows: windows, summary: { availableDateCount: availableRows.length, requestedDateCount: rows.length, sellableRooms: total.sellableRooms, bookedRooms: total.bookedRooms, heldRooms: total.heldRooms, roomRevenue: money(total.roomRevenue), occupancyPercent: total.sellableRooms ? money(total.bookedRooms / total.sellableRooms * 100) : null }, roomTypes: [...roomTypeCurrent.values()].map((row) => ({ roomTypeId: row.roomTypeId, roomType: row.roomType?.name ?? 'Room type', sellableRooms: row.sellableRooms, bookedRooms: row.bookedRooms, heldRooms: row.heldRooms, roomRevenue: row.roomRevenue, adr: row.adr })).sort((a, b) => b.roomRevenue - a.roomRevenue), rows };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HotelBusinessDayStatus, ReservationStatus } from '@prisma/client';
import { addDays, parseDateOnly, toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { PrismaService } from '../../common/prisma.service';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { BookingCurveQueryDto, RevenueForecastCaptureDto, RevenueForecastQueryDto } from './revenue-forecast.dto';
import { BOOKING_CURVE_LEAD_BUCKETS, COMMITTED_OTB_STATUSES, COMPLETION_LEAD_TOLERANCE_DAYS, COMPLETION_MINIMUM_SAMPLE_SIZE, REVENUE_FORECAST_HISTORY_LOOKBACK_DAYS, REVENUE_FORECAST_HORIZON_DAYS, REVENUE_FORECAST_PICKUP_WINDOWS } from './revenue-forecast.constants';

export type OTBMetric = { stayDate: Date; roomTypeId: string | null; sellableRooms: number; bookedRooms: number; heldRooms: number; roomRevenue: number; adr: number };
type Snapshot = OTBMetric & { id?: string; observationDate: Date; roomType?: { id: string; name: string } | null };
type SnapshotCreate = Omit<OTBMetric, 'stayDate'> & { hotelId: string; observationDate: Date; stayDate: Date };
type OTBCalculation = { totals: OTBMetric[]; roomTypes: OTBMetric[] };
type CompletionLevel = 'SAME_WEEKDAY_SAME_SEASON' | 'SAME_WEEKDAY' | 'SAME_ROOM_TYPE' | 'HOTEL_TOTAL';
type CompletionSample = { stayDate: string; finalRooms: number; bookedRooms: number; completionRatio: number; leadTimeDays: number };
type CompletionResult = { available: boolean; ratio?: number; leadTimeDays?: number; sampleSize: number; comparisonLevel?: CompletionLevel; confidence?: 'LOW' | 'MEDIUM' | 'HIGH'; reason?: 'INSUFFICIENT_HISTORY' | 'NO_POSITIVE_COMPLETION_RATIO' | 'NOT_APPLICABLE'; samples?: CompletionSample[]; historicalMedianOtbAtLead?: number; dataQuality?: { excludedZeroFinal: number; excludedMissingSnapshot: number; clampedRatios: number; leadToleranceDays: number } };
type HistoricalActual = { stayDate: Date; roomTypeId: string | null; finalRooms: number; weekday: number; seasonName: string | null };
type HistoricalSnapshot = Snapshot & { leadTimeDays: number };
type CompletionContext = { actuals: HistoricalActual[]; snapshots: HistoricalSnapshot[]; seasons: any[] };
type CurveObservation = { observationDate: string; daysBeforeArrival: number; bookedRooms: number; heldRooms: number; roomRevenue: number; adr: number; sellableRooms: number; source: 'SNAPSHOT' | 'LIVE' };

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

  private median(values: number[]) {
    const sorted = [...values].sort((a, b) => a - b); if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  private seasonForDate(seasons: any[], date: Date, roomTypeId?: string | null) {
    const dateText = dateKey(date); const weekday = date.getUTCDay();
    return seasons.find((season) => dateText >= dateKey(new Date(season.startDate)) && dateText <= dateKey(new Date(season.endDate)) && (!season.daysOfWeek?.length || season.daysOfWeek.includes(weekday)) && (!roomTypeId || !season.roomTypes?.length || season.roomTypes.some((item: any) => item.roomTypeId === roomTypeId))) ?? null;
  }

  private async completionContext(hotel: { id: string; timezoneName: string }, roomTypeId?: string | null): Promise<CompletionContext> {
    const current = getHotelOperationalDate(hotel.timezoneName); const lookbackFrom = addDays(current, -REVENUE_FORECAST_HISTORY_LOOKBACK_DAYS);
    const businessDay = this.p.hotelBusinessDay?.findMany ? await this.p.hotelBusinessDay.findMany({ where: { hotelId: hotel.id, businessDate: { gte: lookbackFrom, lt: current }, status: HotelBusinessDayStatus.CLOSED }, select: { businessDate: true, summary: true } }) : [];
    const seasons = this.p.rateSeason?.findMany ? await this.p.rateSeason.findMany({ where: { hotelId: hotel.id, active: true, startDate: { lte: addDays(current, REVENUE_FORECAST_HORIZON_DAYS) }, endDate: { gte: lookbackFrom } }, include: { roomTypes: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] }) : [];
    const actuals: HistoricalActual[] = [];
    for (const day of businessDay as any[]) {
      const stayDate = new Date(day.businessDate); const summary = day.summary as any ?? {};
      if (roomTypeId) {
        const row = Array.isArray(summary.roomTypePerformance) ? summary.roomTypePerformance.find((item: any) => item.roomTypeId === roomTypeId) : null;
        if (row && number(row.roomNights) >= 0) actuals.push({ stayDate, roomTypeId, finalRooms: number(row.roomNights), weekday: stayDate.getUTCDay(), seasonName: this.seasonForDate(seasons, stayDate, roomTypeId)?.name ?? null });
      } else if (summary.occupancy?.occupiedRoomNights !== undefined && number(summary.occupancy.occupiedRoomNights) >= 0) {
        actuals.push({ stayDate, roomTypeId: null, finalRooms: number(summary.occupancy.occupiedRoomNights), weekday: stayDate.getUTCDay(), seasonName: this.seasonForDate(seasons, stayDate)?.name ?? null });
      }
    }
    const dates = actuals.map((row) => row.stayDate);
    const snapshotRows = dates.length && this.p.revenueForecastSnapshot?.findMany ? await this.p.revenueForecastSnapshot.findMany({ where: { hotelId: hotel.id, stayDate: { in: dates }, observationDate: { gte: lookbackFrom, lt: current }, ...(roomTypeId ? { roomTypeId } : { roomTypeId: null }) }, select: { observationDate: true, stayDate: true, roomTypeId: true, sellableRooms: true, bookedRooms: true, heldRooms: true, roomRevenue: true, adr: true }, orderBy: { observationDate: 'asc' } }) : [];
    const snapshots = (snapshotRows as any[]).map((row) => ({ ...this.snapshotMetric(row), leadTimeDays: Math.round((new Date(row.stayDate).getTime() - new Date(row.observationDate).getTime()) / 86_400_000) }));
    return { actuals, snapshots, seasons };
  }

  private confidence(sampleSize: number, comparisonLevel: CompletionLevel, leadMismatch: number) {
    let value: 'LOW' | 'MEDIUM' | 'HIGH' = sampleSize >= 15 ? 'HIGH' : sampleSize >= 8 ? 'MEDIUM' : 'LOW';
    if (comparisonLevel !== 'SAME_WEEKDAY_SAME_SEASON' || leadMismatch > 1) value = value === 'HIGH' ? 'MEDIUM' : 'LOW';
    return value;
  }

  private completionFor(context: CompletionContext, stayDate: Date, daysToArrival: number, roomTypeId: string | null | undefined): CompletionResult {
    if (daysToArrival <= 0) return { available: false, sampleSize: 0, reason: 'NOT_APPLICABLE' };
    const targetSeason = this.seasonForDate(context.seasons, stayDate, roomTypeId); const targetWeekday = stayDate.getUTCDay(); const targetBucket = [...BOOKING_CURVE_LEAD_BUCKETS].sort((a, b) => Math.abs(a - daysToArrival) - Math.abs(b - daysToArrival))[0];
    const chooseSnapshot = (date: Date) => context.snapshots.filter((row) => dateKey(row.stayDate) === dateKey(date) && row.leadTimeDays >= 0).sort((a, b) => Math.abs(a.leadTimeDays - targetBucket) - Math.abs(b.leadTimeDays - targetBucket))[0];
    const levels: Array<{ level: CompletionLevel; matches: (row: HistoricalActual) => boolean }> = roomTypeId ? [
      { level: 'SAME_WEEKDAY_SAME_SEASON', matches: (row) => row.weekday === targetWeekday && row.seasonName === (targetSeason?.name ?? null) },
      { level: 'SAME_WEEKDAY', matches: (row) => row.weekday === targetWeekday },
      { level: 'SAME_ROOM_TYPE', matches: () => true },
    ] : [
      { level: 'SAME_WEEKDAY_SAME_SEASON', matches: (row) => row.weekday === targetWeekday && row.seasonName === (targetSeason?.name ?? null) },
      { level: 'SAME_WEEKDAY', matches: (row) => row.weekday === targetWeekday },
      { level: 'HOTEL_TOTAL', matches: () => true },
    ];
    let selected: { level: CompletionLevel; samples: CompletionSample[]; missing: number; zeroFinal: number; clamped: number; mismatch: number } | null = null;
    for (const candidate of levels) {
      let missing = 0; let zeroFinal = 0; let clamped = 0; const samples: CompletionSample[] = [];
      for (const actual of context.actuals.filter(candidate.matches)) {
        if (actual.finalRooms <= 0) { zeroFinal += 1; continue; }
        const snapshot = chooseSnapshot(actual.stayDate); if (!snapshot || Math.abs(snapshot.leadTimeDays - targetBucket) > COMPLETION_LEAD_TOLERANCE_DAYS) { missing += 1; continue; }
        const raw = snapshot.bookedRooms / actual.finalRooms; const ratio = Math.min(1, Math.max(0, raw)); if (raw > 1 || raw < 0) clamped += 1;
        samples.push({ stayDate: dateKey(actual.stayDate), finalRooms: actual.finalRooms, bookedRooms: snapshot.bookedRooms, completionRatio: money(ratio), leadTimeDays: snapshot.leadTimeDays });
      }
      const candidateResult = { level: candidate.level, samples, missing, zeroFinal, clamped, mismatch: samples.length ? Math.round(samples.reduce((sum, row) => sum + Math.abs(row.leadTimeDays - targetBucket), 0) / samples.length) : 99 };
      if (!selected || candidateResult.samples.length > selected.samples.length) selected = candidateResult;
      if (samples.length >= COMPLETION_MINIMUM_SAMPLE_SIZE) { selected = candidateResult; break; }
    }
    if (!selected || selected.samples.length < COMPLETION_MINIMUM_SAMPLE_SIZE) return { available: false, sampleSize: selected?.samples.length ?? 0, reason: 'INSUFFICIENT_HISTORY', comparisonLevel: selected?.level, dataQuality: { excludedZeroFinal: selected?.zeroFinal ?? 0, excludedMissingSnapshot: selected?.missing ?? 0, clampedRatios: selected?.clamped ?? 0, leadToleranceDays: COMPLETION_LEAD_TOLERANCE_DAYS } };
    const ratio = this.median(selected.samples.map((row) => row.completionRatio)); if (!ratio || ratio <= 0) return { available: false, sampleSize: selected.samples.length, reason: 'NO_POSITIVE_COMPLETION_RATIO', comparisonLevel: selected.level };
    return { available: true, ratio: money(ratio), leadTimeDays: targetBucket, sampleSize: selected.samples.length, comparisonLevel: selected.level, confidence: this.confidence(selected.samples.length, selected.level, selected.mismatch), historicalMedianOtbAtLead: money(this.median(selected.samples.map((row) => row.bookedRooms)) ?? 0), samples: selected.samples, dataQuality: { excludedZeroFinal: selected.zeroFinal, excludedMissingSnapshot: selected.missing, clampedRatios: selected.clamped, leadToleranceDays: COMPLETION_LEAD_TOLERANCE_DAYS } };
  }

  private async rateContext(hotelId: string, stayDate: Date, roomTypeId?: string | null) {
    if (!this.p.ratePlan?.findMany) return { available: false, reason: 'RATE_CONTEXT_UNAVAILABLE' };
    const plans = await this.p.ratePlan.findMany({ where: { active: true, roomType: { hotelId, ...(roomTypeId ? { id: roomTypeId } : {}) } }, select: { roomTypeId: true, name: true, rates: { where: { date: stayDate }, select: { amount: true, baseAmount: true, overrideAmount: true } } } });
    const rows = (plans as any[]).filter((plan) => plan.rates?.[0]).map((plan) => { const rate = plan.rates[0]; const baseRate = number(rate.baseAmount ?? rate.amount); const manualOverride = rate.overrideAmount == null ? null : number(rate.overrideAmount); return { roomTypeId: plan.roomTypeId, ratePlan: plan.name, baseRate: money(baseRate), manualOverride, season: null, yield: null, effectivePrePromoRate: money(manualOverride ?? baseRate), note: 'Informational RateDay base/override context; season and yield are not applied to forecast revenue.' }; });
    return rows.length ? { available: true, rows } : { available: false, reason: 'NO_RATE_DAY_FOR_STAY_DATE' };
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
    const completionContext = isLive ? await this.completionContext(hotel) : null;
    const rows = dates.map((stayDate) => {
      const current = isLive ? liveByDate.get(dateKey(stayDate)) : snapshotAggregate.get(key(observation, stayDate)); const pickup: Record<string, number | null> = {}; const pickupRevenue: Record<string, number | null> = {}; const pace: Record<string, number | null> = {}; const revenuePace: Record<string, number | null> = {};
      for (const window of windows) { const previous = snapshotAggregate.get(key(addDays(observation, -window), stayDate)); pickup[String(window)] = current && previous ? current.bookedRooms - previous.bookedRooms : null; pickupRevenue[String(window)] = current && previous ? money(current.roomRevenue - previous.roomRevenue) : null; pace[String(window)] = current && previous ? money((current.bookedRooms - previous.bookedRooms) / window) : null; revenuePace[String(window)] = current && previous ? money((current.roomRevenue - previous.roomRevenue) / window) : null; }
      const pickup7 = pickup[String(windows.includes(7) ? 7 : windows[windows.length - 1])]; const occupancy = current && current.sellableRooms ? money(current.bookedRooms / current.sellableRooms * 100) : null; const projectedBookedRooms = current && pickup7 !== null ? Math.min(current.sellableRooms, current.bookedRooms + Math.max(0, pickup7)) : null;
      const daysToArrival = Math.round((stayDate.getTime() - observation.getTime()) / 86_400_000); const completion = current && completionContext ? this.completionFor(completionContext, stayDate, daysToArrival, null) : { available: false, sampleSize: 0, reason: 'NOT_APPLICABLE' as const }; const forecast = current && completion.available && completion.ratio ? { finalRooms: money(Math.min(current.sellableRooms, Math.max(current.bookedRooms, current.bookedRooms / completion.ratio))), occupancyPercent: current.sellableRooms ? money(Math.min(100, Math.max(0, Math.min(current.sellableRooms, Math.max(current.bookedRooms, current.bookedRooms / completion.ratio)) / current.sellableRooms * 100))) : null, remainingDemandRooms: money(Math.max(0, Math.min(current.sellableRooms, Math.max(current.bookedRooms, current.bookedRooms / completion.ratio)) - current.bookedRooms)), revenue: null, revenueReason: 'DEFERRED_UNTIL_RELIABLE_PRE_PROMO_RATE_POLICY' } : null; const paceDifferenceRooms = current && completion.historicalMedianOtbAtLead !== undefined ? money(current.bookedRooms - completion.historicalMedianOtbAtLead) : null; const paceStatus = paceDifferenceRooms === null ? 'UNAVAILABLE' : paceDifferenceRooms >= 2 ? 'AHEAD' : paceDifferenceRooms <= -2 ? 'BEHIND' : 'ON_PACE'; const forecastDemandSignal = !forecast ? 'UNAVAILABLE' : forecast.occupancyPercent !== null && forecast.occupancyPercent >= 90 ? 'COMPRESSION' : forecast.occupancyPercent !== null && forecast.occupancyPercent >= 75 ? 'STRONG' : forecast.occupancyPercent !== null && forecast.occupancyPercent >= 50 ? 'NORMAL' : 'SOFT';
      const signal = !current ? 'UNAVAILABLE' : occupancy !== null && (occupancy >= 80 || (pickup7 ?? 0) >= Math.max(1, current.sellableRooms * 0.1)) ? 'HIGH' : occupancy !== null && (occupancy >= 50 || (pickup7 ?? 0) > 0) ? 'MEDIUM' : 'LOW';
      const signals = !current ? ['No authoritative data exists for this stay date and observation date.'] : [`OTB occupancy is ${occupancy}% of sellable rooms.`, pickup7 === null ? '7-day pickup is unavailable because the prior snapshot is missing.' : `7-day room pickup is ${pickup7}; negative pickup is retained.`, current.heldRooms ? `${current.heldRooms} room(s) are held separately from committed OTB.` : 'No held inventory is recorded.'];
      return { stayDate: dateKey(stayDate), daysToArrival, available: Boolean(current), sellableRooms: current?.sellableRooms ?? null, bookedRooms: current?.bookedRooms ?? null, heldRooms: current?.heldRooms ?? null, roomRevenue: current?.roomRevenue ?? null, adr: current?.adr ?? null, occupancyPercent: occupancy, projectedBookedRooms, demandSignal: signal, forecastDemandSignal, completion, forecast, paceComparison: { status: paceStatus, differenceRooms: paceDifferenceRooms, historicalMedianOtbAtLead: completion.historicalMedianOtbAtLead ?? null }, signals, pickup, pickupRevenue, pace, revenuePace };
    });
    const availableRows = rows.filter((row) => row.available); const total = availableRows.reduce((sum, row) => ({ sellableRooms: sum.sellableRooms + (row.sellableRooms ?? 0), bookedRooms: sum.bookedRooms + (row.bookedRooms ?? 0), heldRooms: sum.heldRooms + (row.heldRooms ?? 0), roomRevenue: sum.roomRevenue + (row.roomRevenue ?? 0) }), { sellableRooms: 0, bookedRooms: 0, heldRooms: 0, roomRevenue: 0 }); const roomTypeRows = isLive ? (liveCalculation?.roomTypes ?? []).map((row) => ({ ...row, observationDate: observation })) : currentSnapshotRoomTypes; const headline = rows.find((row) => row.stayDate === dateKey(observation)) ?? rows[0] ?? null;
    const headlineRateContext = isLive && headline ? await this.rateContext(hotel.id, parseDateOnly(headline.stayDate, 'stayDate')) : { available: false, reason: 'RATE_CONTEXT_NOT_REQUESTED_FOR_HISTORICAL_OBSERVATION' };
    return { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, observationDate: dateKey(observation), observationSource: isLive ? 'LIVE' : 'SNAPSHOT', from: dateKey(from), to: dateKey(to), pickupWindows: windows, forecastPolicy: { formula: 'currentOtb / medianHistoricalCompletionRatio', minimumSampleSize: COMPLETION_MINIMUM_SAMPLE_SIZE, revenue: 'DEFERRED_UNTIL_RELIABLE_PRE_PROMO_RATE_POLICY' }, demandSignalRules: { highOccupancyPercent: 80, highPickupRoomsRatio: 0.1, mediumOccupancyPercent: 50, forecastCompressionOccupancyPercent: 90, forecastStrongOccupancyPercent: 75, forecastNormalOccupancyPercent: 50 }, rateContext: headlineRateContext, summary: { availableDateCount: availableRows.length, requestedDateCount: rows.length, sellableRooms: total.sellableRooms, bookedRooms: total.bookedRooms, heldRooms: total.heldRooms, roomRevenue: money(total.roomRevenue), occupancyPercent: total.sellableRooms ? money(total.bookedRooms / total.sellableRooms * 100) : null, headline }, roomTypes: this.aggregateRoomTypes(roomTypeRows as Snapshot[]), rows };
  }

  async bookingCurve(userId: string, query: BookingCurveQueryDto) {
    const hotel = await this.resolveHotel(userId, query.hotelId); const stayDate = parseDateOnly(query.stayDate, 'stayDate'); const current = getHotelOperationalDate(hotel.timezoneName);
    if (query.roomTypeId) {
      const roomType = await this.p.roomType.findUnique({ where: { id: query.roomTypeId }, select: { id: true, hotelId: true } });
      if (!roomType || roomType.hotelId !== hotel.id) throw new NotFoundException('Room type not found.');
    }
    const snapshots = await this.p.revenueForecastSnapshot.findMany({ where: { hotelId: hotel.id, stayDate, ...(query.roomTypeId ? { roomTypeId: query.roomTypeId } : { roomTypeId: null }), observationDate: { lte: current, gte: addDays(current, -REVENUE_FORECAST_HISTORY_LOOKBACK_DAYS) } }, orderBy: { observationDate: 'asc' }, select: { observationDate: true, stayDate: true, roomTypeId: true, sellableRooms: true, bookedRooms: true, heldRooms: true, roomRevenue: true, adr: true } });
    const observations: CurveObservation[] = (snapshots as any[]).map((row) => ({ observationDate: dateKey(new Date(row.observationDate)), daysBeforeArrival: Math.round((stayDate.getTime() - new Date(row.observationDate).getTime()) / 86_400_000), bookedRooms: number(row.bookedRooms), heldRooms: number(row.heldRooms), roomRevenue: number(row.roomRevenue), adr: number(row.adr), sellableRooms: number(row.sellableRooms), source: 'SNAPSHOT' }));
    const currentBusinessDay = this.p.hotelBusinessDay?.findUnique ? await this.p.hotelBusinessDay.findUnique({ where: { hotelId_businessDate: { hotelId: hotel.id, businessDate: current } }, select: { status: true } }) : null;
    if (stayDate >= current && currentBusinessDay?.status !== HotelBusinessDayStatus.CLOSED) {
      const live = await this.calculateOtbForStayRange(hotel.id, stayDate, stayDate); const point = query.roomTypeId ? live.roomTypes.find((row) => row.roomTypeId === query.roomTypeId) : live.totals[0];
      if (point && !observations.some((row) => row.observationDate === dateKey(current) && row.source === 'LIVE')) observations.push({ observationDate: dateKey(current), daysBeforeArrival: Math.round((stayDate.getTime() - current.getTime()) / 86_400_000), bookedRooms: point.bookedRooms, heldRooms: point.heldRooms, roomRevenue: point.roomRevenue, adr: point.adr, sellableRooms: point.sellableRooms, source: 'LIVE' });
    }
    observations.sort((a, b) => a.observationDate.localeCompare(b.observationDate)); const context = await this.completionContext(hotel, query.roomTypeId); const latest = observations[observations.length - 1]; const completion = latest ? this.completionFor(context, stayDate, latest.daysBeforeArrival, query.roomTypeId) : { available: false, sampleSize: 0, reason: 'INSUFFICIENT_HISTORY' as const };
    return { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, hotelId: hotel.id, stayDate: dateKey(stayDate), roomTypeId: query.roomTypeId ?? null, sellableRooms: latest?.sellableRooms ?? null, observations, completion, leadBuckets: BOOKING_CURVE_LEAD_BUCKETS, historicalSource: 'RevenueForecastSnapshot', finalDemandSource: query.roomTypeId ? 'HotelBusinessDay.summary.roomTypePerformance.roomNights' : 'HotelBusinessDay.summary.occupancy.occupiedRoomNights', livePointIncluded: observations.some((row) => row.source === 'LIVE') };
  }
}

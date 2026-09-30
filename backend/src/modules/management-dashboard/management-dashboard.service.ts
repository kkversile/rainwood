import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExpenseStatus, HotelBusinessDayStatus, ReservationStatus, RoomOperationalStatus, StayStatus, UserRole } from '@prisma/client';
import { addDays, parseDateOnly, toDateOnly } from '../../common/dates';
import { getHotelBusinessDayUtcRange, getHotelOperationalDate } from '../../common/hotel-dates';
import { PrismaService } from '../../common/prisma.service';
import { ManagementDashboardQueryDto } from './management-dashboard.dto';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';

const EXCLUDED: ReservationStatus[] = [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED];
const METRIC_KEYS = ['occupiedRoomNights', 'sellableRoomNights', 'roomRevenue', 'incidentalRevenue', 'payments', 'outstandingBalance', 'arrivals', 'departures', 'inHouse', 'roomsAvailable', 'dirtyRooms', 'cleaningRooms', 'outOfOrderRooms', 'openMaintenanceTickets'] as const;
type MetricKey = typeof METRIC_KEYS[number];
type Metric = Record<MetricKey, number> & { legacyOccupancySemantics?: boolean };
type SourceRow = { source: string; reservationIds: Set<string>; legacyReservationCount: number; roomNights: number; roomRevenue: number; legacyFallback?: boolean };
type RoomTypeRow = { roomTypeId: string; roomTypeName: string; roomNights: number; roomRevenue: number; legacyFallback?: boolean };
type LiveDay = { metric: Metric; sources: Map<string, SourceRow>; roomTypes: Map<string, RoomTypeRow> };

const emptyMetric = (): Metric => ({ occupiedRoomNights: 0, sellableRoomNights: 0, roomRevenue: 0, incidentalRevenue: 0, payments: 0, outstandingBalance: 0, arrivals: 0, departures: 0, inHouse: 0, roomsAvailable: 0, dirtyRooms: 0, cleaningRooms: 0, outOfOrderRooms: 0, openMaintenanceTickets: 0 });
const number = (value: unknown) => Number(value ?? 0);
const money = (value: unknown) => Number(Number(value ?? 0).toFixed(2));
const dateRange = (date: Date) => ({ gte: date, lt: addDays(date, 1) });

@Injectable()
export class ManagementDashboardService {
  constructor(private readonly p: PrismaService) {}

  private async resolveHotel(userId: string, requestedHotelId?: string) {
    const scope = await getActorScope(this.p, userId);
    if (!['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN'].includes(scope.role)) throw new ForbiddenException('Management dashboard requires management access.');
    const hotelId = resolveRequestedHotel(scope, requestedHotelId);
    if (!hotelId) throw new BadRequestException('hotelId is required for a global administrator.');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, timezoneName: true, active: true } });
    if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private async roomNightRows(hotelId: string, dates: Date[]) {
    if (!dates.length) return [];
    return this.p.reservationRoomNight.findMany({
      where: { date: { in: dates }, reservationLine: { reservation: { hotelId, status: { notIn: EXCLUDED } } } },
      select: { date: true, rooms: true, totalAmount: true, reservationLine: { select: { roomType: { select: { id: true, name: true } }, reservation: { select: { id: true, source: true } } } } },
    });
  }

  private breakdown(rows: any[], legacyFallback = false) {
    const sources = new Map<string, SourceRow>();
    const roomTypes = new Map<string, RoomTypeRow>();
    for (const row of rows) {
      const reservation = row.reservationLine?.reservation; const roomType = row.reservationLine?.roomType;
      const roomNights = number(row.rooms); const roomRevenue = number(row.totalAmount ?? row.amount);
      if (reservation) {
        const current = sources.get(String(reservation.source)) ?? { source: String(reservation.source), reservationIds: new Set<string>(), legacyReservationCount: 0, roomNights: 0, roomRevenue: 0, legacyFallback };
        current.reservationIds.add(reservation.id); current.roomNights += roomNights; current.roomRevenue += roomRevenue; current.legacyFallback = current.legacyFallback || legacyFallback; sources.set(current.source, current);
      }
      if (roomType) {
        const current = roomTypes.get(roomType.id) ?? { roomTypeId: roomType.id, roomTypeName: roomType.name, roomNights: 0, roomRevenue: 0, legacyFallback };
        current.roomNights += roomNights; current.roomRevenue += roomRevenue; current.legacyFallback = current.legacyFallback || legacyFallback; roomTypes.set(current.roomTypeId, current);
      }
    }
    return { sources, roomTypes };
  }

  private async liveDay(hotel: { id: string; timezoneName: string }, date: Date): Promise<LiveDay> {
    const range = dateRange(date); const timestamp = getHotelBusinessDayUtcRange(date, hotel.timezoneName); const reservationWhere = { hotelId: hotel.id, status: { notIn: EXCLUDED } };
    const [rooms, nights, charges, payments, arrivals, departures, inHouse, maintenance, activeReservations] = await Promise.all([
      this.p.room.findMany({ where: { hotelId: hotel.id, active: true }, select: { status: true } }),
      this.p.reservationRoomNight.findMany({ where: { date, reservationLine: { reservation: reservationWhere } }, select: { rooms: true, totalAmount: true, reservationLine: { select: { roomType: { select: { id: true, name: true } }, reservation: { select: { id: true, source: true } } } } } }),
      this.p.reservationFolioCharge.findMany({ where: { postingDate: range, status: 'POSTED', reservation: reservationWhere }, select: { totalAmount: true } }),
      this.p.payment.findMany({ where: { verified: true, reservation: reservationWhere, OR: [{ paidAt: { gte: timestamp.startUtc, lt: timestamp.endUtc } }, { paidAt: null, createdAt: { gte: timestamp.startUtc, lt: timestamp.endUtc } }] }, select: { amount: true } }),
      this.p.reservation.count({ where: { ...reservationWhere, checkIn: range } }),
      this.p.reservation.count({ where: { ...reservationWhere, checkOut: range } }),
      this.p.reservation.count({ where: { ...reservationWhere, stayStatus: StayStatus.CHECKED_IN } }),
      this.p.maintenanceTicket.count({ where: { hotelId: hotel.id, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] as any } } }),
      this.p.reservation.findMany({ where: { ...reservationWhere, stayStatus: { not: StayStatus.CHECKED_OUT } }, select: { totalAmount: true, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } }, payments: { where: { verified: true }, select: { amount: true } } } }),
    ]);
    const metric = emptyMetric(); const outOfOrder = rooms.filter((room: any) => room.status === RoomOperationalStatus.OUT_OF_ORDER).length;
    metric.sellableRoomNights = Math.max(rooms.length - outOfOrder, 0); metric.roomsAvailable = rooms.filter((room: any) => room.status === RoomOperationalStatus.AVAILABLE).length; metric.dirtyRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.DIRTY).length; metric.cleaningRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.CLEANING).length; metric.outOfOrderRooms = outOfOrder; metric.openMaintenanceTickets = maintenance;
    metric.occupiedRoomNights = nights.reduce((sum: number, row: any) => sum + number(row.rooms), 0); metric.roomRevenue = money(nights.reduce((sum: number, row: any) => sum + number(row.totalAmount ?? row.amount), 0)); metric.incidentalRevenue = money(charges.reduce((sum: number, row: any) => sum + number(row.totalAmount), 0)); metric.payments = money(payments.reduce((sum: number, row: any) => sum + number(row.amount), 0)); metric.outstandingBalance = money((activeReservations as any[]).reduce((sum, row) => sum + Math.max(number(row.totalAmount) + row.folioCharges.reduce((subtotal: number, charge: any) => subtotal + number(charge.totalAmount), 0) - row.payments.reduce((subtotal: number, payment: any) => subtotal + number(payment.amount), 0), 0), 0)); metric.arrivals = arrivals; metric.departures = departures; metric.inHouse = inHouse;
    const breakdownRows = this.breakdown(nights);
    return { metric, sources: breakdownRows.sources, roomTypes: breakdownRows.roomTypes };
  }

  private snapshotMetric(summary: any): Metric {
    const metric = emptyMetric(); const occupancy = summary?.occupancy ?? {}; const revenue = summary?.revenue ?? {}; const payments = summary?.payments ?? {}; const balances = summary?.balances ?? {}; const stays = summary?.stays ?? {}; const operations = summary?.operations ?? {};
    const hasExplicitNights = occupancy.occupiedRoomNights !== undefined || occupancy.sellableRoomNights !== undefined;
    metric.occupiedRoomNights = number(occupancy.occupiedRoomNights ?? occupancy.occupiedRooms); metric.sellableRoomNights = number(occupancy.sellableRoomNights ?? occupancy.sellableRooms); metric.legacyOccupancySemantics = !hasExplicitNights;
    metric.roomRevenue = number(revenue.roomRevenue); metric.incidentalRevenue = number(revenue.incidentalRevenue); metric.payments = number(payments.total); metric.outstandingBalance = number(balances.outstandingGuestBalance); metric.arrivals = number(stays.arrivals); metric.departures = number(stays.departures); metric.inHouse = number(stays.inHouse); metric.roomsAvailable = number(occupancy.availableRooms); metric.dirtyRooms = number(operations.dirtyRooms ?? occupancy.dirtyRooms); metric.cleaningRooms = number(operations.cleaningRooms ?? occupancy.cleaningRooms); metric.outOfOrderRooms = number(operations.outOfOrderRooms ?? occupancy.outOfOrderRooms); metric.openMaintenanceTickets = number(operations.openMaintenanceTickets);
    return metric;
  }

  private addMetric(target: Metric, source: Metric) { for (const key of METRIC_KEYS) target[key] += source[key]; }

  private aggregateSourceRows(rows: SourceRow[]) {
    const aggregate = new Map<string, SourceRow>();
    for (const row of rows) {
      const current = aggregate.get(row.source) ?? { source: row.source, reservationIds: new Set<string>(), legacyReservationCount: 0, roomNights: 0, roomRevenue: 0, legacyFallback: false };
      row.reservationIds.forEach((id) => current.reservationIds.add(id));
      current.legacyReservationCount += row.legacyReservationCount;
      current.roomNights += row.roomNights;
      current.roomRevenue += row.roomRevenue;
      current.legacyFallback = Boolean(current.legacyFallback || row.legacyFallback);
      aggregate.set(row.source, current);
    }
    return aggregate;
  }

  async dashboard(userId: string, query: ManagementDashboardQueryDto) {
    const hotel = await this.resolveHotel(userId, query.hotelId); const current = getHotelOperationalDate(hotel.timezoneName); const currentText = toDateOnly(current);
    const from = query.from ? parseDateOnly(query.from, 'from') : current; const to = query.to ? parseDateOnly(query.to, 'to') : from; const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (dayCount < 1) throw new BadRequestException('to must be on or after from.'); if (dayCount > 366) throw new BadRequestException('Dashboard date range cannot exceed 366 days.'); if (toDateOnly(to) > currentText) throw new BadRequestException('Dashboard dates cannot be in the future.');
    const dates = Array.from({ length: dayCount }, (_, index) => addDays(from, index)); const closedDays = await this.p.hotelBusinessDay.findMany({ where: { hotelId: hotel.id, businessDate: { gte: from, lte: to }, status: HotelBusinessDayStatus.CLOSED }, select: { businessDate: true, summary: true } }); const closedByDate = new Map(closedDays.map((day: any) => [toDateOnly(day.businessDate), day]));
    for (const date of dates) if (toDateOnly(date) < currentText && !closedByDate.has(toDateOnly(date))) throw new BadRequestException(`Historical dashboard data is unavailable for ${toDateOnly(date)} because the business day was not closed.`);
    const liveNeeded = dates.some((date) => toDateOnly(date) === currentText && !closedByDate.has(currentText)); const live = liveNeeded ? await this.liveDay(hotel, current) : { metric: emptyMetric(), sources: new Map<string, SourceRow>(), roomTypes: new Map<string, RoomTypeRow>() };
    const legacyDates = dates.filter((date) => { const day = closedByDate.get(toDateOnly(date)); return Boolean(day && (!Array.isArray((day.summary as any)?.sourcePerformance) || !Array.isArray((day.summary as any)?.roomTypePerformance))); }); const legacyRows = await this.roomNightRows(hotel.id, legacyDates); const legacyByDate = new Map<string, any[]>(); for (const row of legacyRows as any[]) { const key = toDateOnly(row.date); legacyByDate.set(key, [...(legacyByDate.get(key) ?? []), row]); }
    const dayMetric = (date: Date) => { const day = closedByDate.get(toDateOnly(date)); return day ? this.snapshotMetric(day.summary) : live.metric; };
    const daily = dates.map((date) => { const metric = dayMetric(date); const occupancy = metric.sellableRoomNights ? metric.occupiedRoomNights / metric.sellableRoomNights * 100 : 0; return { date: toDateOnly(date), occupancy: money(occupancy), adr: metric.occupiedRoomNights ? money(metric.roomRevenue / metric.occupiedRoomNights) : 0, revpar: metric.sellableRoomNights ? money(metric.roomRevenue / metric.sellableRoomNights) : 0, roomRevenue: money(metric.roomRevenue), incidentalRevenue: money(metric.incidentalRevenue), grossRevenue: money(metric.roomRevenue + metric.incidentalRevenue), legacyOccupancySemantics: Boolean(metric.legacyOccupancySemantics) }; });
    const total = emptyMetric(); for (const date of dates) this.addMetric(total, dayMetric(date));
    const periodEndMetric = dayMetric(to); const sourceRows: SourceRow[] = []; const roomTypeAggregate = new Map<string, RoomTypeRow>();
    const addBreakdown = (sources: Map<string, SourceRow>, roomTypes: Map<string, RoomTypeRow>) => { sourceRows.push(...sources.values()); for (const [roomTypeId, row] of roomTypes) { const currentRow = roomTypeAggregate.get(roomTypeId) ?? { roomTypeId, roomTypeName: row.roomTypeName, roomNights: 0, roomRevenue: 0 }; currentRow.roomNights += row.roomNights; currentRow.roomRevenue += row.roomRevenue; roomTypeAggregate.set(roomTypeId, currentRow); } };
    for (const date of dates) { const day = closedByDate.get(toDateOnly(date)); if (!day) { addBreakdown(live.sources, live.roomTypes); continue; } const summary: any = day.summary ?? {}; let breakdown = this.breakdown([], false); if (Array.isArray(summary.sourcePerformance)) { for (const row of summary.sourcePerformance) { const ids = new Set<string>(row.reservationIds ?? []); breakdown.sources.set(row.source, { source: row.source, reservationIds: ids, legacyReservationCount: ids.size ? 0 : number(row.reservations), roomNights: number(row.roomNights), roomRevenue: number(row.roomRevenue) }); } } else { breakdown = this.breakdown(legacyByDate.get(toDateOnly(date)) ?? [], true); } if (Array.isArray(summary.roomTypePerformance)) { for (const row of summary.roomTypePerformance) breakdown.roomTypes.set(row.roomTypeId, { roomTypeId: row.roomTypeId, roomTypeName: row.roomTypeName, roomNights: number(row.roomNights), roomRevenue: number(row.roomRevenue) }); } else { const legacy = this.breakdown(legacyByDate.get(toDateOnly(date)) ?? [], true); breakdown.roomTypes = legacy.roomTypes; } addBreakdown(breakdown.sources, breakdown.roomTypes); }
    const sourceAggregate = this.aggregateSourceRows(sourceRows); const legacySourceCounts = [...sourceAggregate.values()].some((row) => row.legacyReservationCount > 0); const sources = [...sourceAggregate.values()].map((row) => ({ source: row.source, reservations: row.reservationIds.size + row.legacyReservationCount, roomNights: row.roomNights, roomRevenue: money(row.roomRevenue) })).sort((a, b) => b.roomRevenue - a.roomRevenue); const roomTypes = [...roomTypeAggregate.values()].map((row) => ({ roomTypeId: row.roomTypeId, roomType: row.roomTypeName, roomNights: row.roomNights, roomRevenue: money(row.roomRevenue), adr: row.roomNights ? money(row.roomRevenue / row.roomNights) : 0 })).sort((a, b) => b.roomRevenue - a.roomRevenue);
    const expenseAggregate = await this.p.expense.aggregate({ where: { hotelId: hotel.id, expenseDate: { gte: from, lte: to }, status: { in: [ExpenseStatus.APPROVED, ExpenseStatus.PAID] } }, _sum: { totalAmount: true } });
    const grossRevenue = money(total.roomRevenue + total.incidentalRevenue); const operatingExpenses = money(expenseAggregate._sum.totalAmount); const operatingContribution = money(grossRevenue - operatingExpenses);
    return { period: { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, from: toDateOnly(from), to: toDateOnly(to), days: dayCount }, kpis: { occupancy: total.sellableRoomNights ? money(total.occupiedRoomNights / total.sellableRoomNights * 100) : 0, adr: total.occupiedRoomNights ? money(total.roomRevenue / total.occupiedRoomNights) : 0, revpar: total.sellableRoomNights ? money(total.roomRevenue / total.sellableRoomNights) : 0, roomRevenue: money(total.roomRevenue), incidentalRevenue: money(total.incidentalRevenue), grossRevenue, operatingExpenses, operatingContribution, operatingContributionLabel: 'Management metric — not statutory accounting P&L', paymentsReceived: money(total.payments), outstandingBalance: money(periodEndMetric.outstandingBalance), arrivals: total.arrivals, departures: total.departures, inHouse: periodEndMetric.inHouse, occupiedRoomNights: total.occupiedRoomNights, sellableRoomNights: total.sellableRoomNights }, daily, sources, roomTypes, sourceReservationSemantics: legacySourceCounts ? 'MIXED_UNIQUE_AND_LEGACY_DAILY_RESERVATIONS' : 'UNIQUE_RESERVATIONS', operations: { roomsAvailable: periodEndMetric.roomsAvailable, dirtyRooms: periodEndMetric.dirtyRooms, cleaningRooms: periodEndMetric.cleaningRooms, outOfOrderRooms: periodEndMetric.outOfOrderRooms, openMaintenanceTickets: periodEndMetric.openMaintenanceTickets } };
  }
}

import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HotelBusinessDayStatus, ReservationStatus, RoomOperationalStatus, StayStatus, UserRole } from '@prisma/client';
import { addDays, parseDateOnly, toDateOnly } from '../../common/dates';
import { getHotelBusinessDayUtcRange, getHotelOperationalDate } from '../../common/hotel-dates';
import { PrismaService } from '../../common/prisma.service';
import { ManagementDashboardQueryDto } from './management-dashboard.dto';

const EXCLUDED: ReservationStatus[] = [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED];
const MODES = ['CASH', 'UPI', 'BANK_TRANSFER', 'GATEWAY', 'WALLET', 'COMPANY_CREDIT'];

type Metric = { occupiedRoomNights: number; sellableRoomNights: number; roomRevenue: number; incidentalRevenue: number; payments: number; outstandingBalance: number; arrivals: number; departures: number; inHouse: number; roomsAvailable: number; dirtyRooms: number; cleaningRooms: number; outOfOrderRooms: number; openMaintenanceTickets: number };
const emptyMetric = (): Metric => ({ occupiedRoomNights: 0, sellableRoomNights: 0, roomRevenue: 0, incidentalRevenue: 0, payments: 0, outstandingBalance: 0, arrivals: 0, departures: 0, inHouse: 0, roomsAvailable: 0, dirtyRooms: 0, cleaningRooms: 0, outOfOrderRooms: 0, openMaintenanceTickets: 0 });
const number = (value: unknown) => Number(value ?? 0);
const money = (value: number) => Number(value.toFixed(2));

@Injectable()
export class ManagementDashboardService {
  constructor(private readonly p: PrismaService) {}

  private async resolveHotel(userId: string, requestedHotelId?: string) {
    const admin = await this.p.user.findUnique({ where: { id: userId }, select: { role: true, staffHotelId: true } });
    if (!admin || (admin.role !== UserRole.ADMIN && admin.role !== UserRole.SUPER_ADMIN)) throw new ForbiddenException('Management dashboard requires Admin or Super Admin access.');
    if (admin.staffHotelId && requestedHotelId && admin.staffHotelId !== requestedHotelId) throw new NotFoundException('Hotel not found.');
    const hotelId = admin.staffHotelId ?? requestedHotelId;
    if (!hotelId) throw new BadRequestException('hotelId is required for a global Admin.');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, timezoneName: true, active: true } });
    if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private async liveDay(hotel: { id: string; timezoneName: string }, date: Date): Promise<{ metric: Metric; sources: Map<string, { reservations: Set<string>; roomNights: number; roomRevenue: number }>; roomTypes: Map<string, { name: string; roomNights: number; roomRevenue: number }> }> {
    const dateRange = { gte: date, lt: addDays(date, 1) };
    const timestamp = getHotelBusinessDayUtcRange(date, hotel.timezoneName);
    const reservationWhere = { hotelId: hotel.id, status: { notIn: EXCLUDED } };
    const [rooms, nights, charges, payments, arrivals, departures, inHouse, maintenance, sources, activeReservations] = await Promise.all([
      this.p.room.findMany({ where: { hotelId: hotel.id, active: true }, select: { status: true } }),
      this.p.reservationRoomNight.findMany({ where: { date, reservationLine: { reservation: reservationWhere } }, select: { rooms: true, totalAmount: true, reservationLine: { select: { roomType: { select: { id: true, name: true } }, reservation: { select: { id: true, source: true } } } } } }),
      this.p.reservationFolioCharge.findMany({ where: { postingDate: dateRange, status: 'POSTED', reservation: reservationWhere }, select: { totalAmount: true } }),
      this.p.payment.findMany({ where: { verified: true, reservation: reservationWhere, OR: [{ paidAt: { gte: timestamp.startUtc, lt: timestamp.endUtc } }, { paidAt: null, createdAt: { gte: timestamp.startUtc, lt: timestamp.endUtc } }] }, select: { amount: true } }),
      this.p.reservation.count({ where: { ...reservationWhere, checkIn: dateRange } }),
      this.p.reservation.count({ where: { ...reservationWhere, checkOut: dateRange } }),
      this.p.reservation.count({ where: { ...reservationWhere, stayStatus: StayStatus.CHECKED_IN } }),
      this.p.maintenanceTicket.count({ where: { hotelId: hotel.id, status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] as any } } }),
      this.p.reservationRoomNight.findMany({ where: { date: dateRange, reservationLine: { reservation: reservationWhere } }, select: { rooms: true, totalAmount: true, reservationLine: { select: { roomType: { select: { id: true, name: true } }, reservation: { select: { id: true, source: true } } } } } }),
      this.p.reservation.findMany({ where: { ...reservationWhere, stayStatus: { not: StayStatus.CHECKED_OUT } }, select: { totalAmount: true, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } }, payments: { where: { verified: true }, select: { amount: true } } } }),
    ]);
    const metric = emptyMetric();
    const outOfOrder = rooms.filter((room: any) => room.status === RoomOperationalStatus.OUT_OF_ORDER).length;
    metric.sellableRoomNights = Math.max(rooms.length - outOfOrder, 0);
    metric.roomsAvailable = rooms.filter((room: any) => room.status === RoomOperationalStatus.AVAILABLE).length;
    metric.dirtyRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.DIRTY).length;
    metric.cleaningRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.CLEANING).length;
    metric.outOfOrderRooms = outOfOrder;
    metric.openMaintenanceTickets = maintenance;
    metric.occupiedRoomNights = nights.reduce((sum: number, row: any) => sum + number(row.rooms), 0);
    metric.roomRevenue = money(nights.reduce((sum: number, row: any) => sum + number(row.totalAmount ?? row.amount), 0));
    metric.incidentalRevenue = money(charges.reduce((sum: number, row: any) => sum + number(row.totalAmount), 0));
    metric.payments = money(payments.reduce((sum: number, row: any) => sum + number(row.amount), 0));
    metric.outstandingBalance = money((activeReservations as any[]).reduce((sum, row) => Math.max(number(row.totalAmount) + row.folioCharges.reduce((subtotal: number, charge: any) => subtotal + number(charge.totalAmount), 0) - row.payments.reduce((subtotal: number, payment: any) => subtotal + number(payment.amount), 0), 0) + sum, 0));
    metric.arrivals = arrivals; metric.departures = departures; metric.inHouse = inHouse;
    const sourceMap = new Map<string, { reservations: Set<string>; roomNights: number; roomRevenue: number }>();
    const roomTypeMap = new Map<string, { name: string; roomNights: number; roomRevenue: number }>();
    for (const row of sources as any[]) {
      const source = String(row.reservationLine.reservation.source);
      const sourceRow = sourceMap.get(source) ?? { reservations: new Set<string>(), roomNights: 0, roomRevenue: 0 };
      sourceRow.reservations.add(row.reservationLine.reservation.id); sourceRow.roomNights += number(row.rooms); sourceRow.roomRevenue += number(row.totalAmount); sourceMap.set(source, sourceRow);
      const type = row.reservationLine.roomType; const typeRow = roomTypeMap.get(type.id) ?? { name: type.name, roomNights: 0, roomRevenue: 0 };
      typeRow.roomNights += number(row.rooms); typeRow.roomRevenue += number(row.totalAmount); roomTypeMap.set(type.id, typeRow);
    }
    return { metric, sources: sourceMap, roomTypes: roomTypeMap };
  }

  private snapshotMetric(summary: any): Metric {
    const metric = emptyMetric(); const occupancy = summary?.occupancy ?? {}; const revenue = summary?.revenue ?? {}; const payments = summary?.payments ?? {}; const stays = summary?.stays ?? {}; const operations = summary?.operations ?? {};
    metric.occupiedRoomNights = number(occupancy.occupiedRooms); metric.sellableRoomNights = number(occupancy.sellableRooms); metric.roomRevenue = number(revenue.roomRevenue); metric.incidentalRevenue = number(revenue.incidentalRevenue); metric.payments = number(payments.total); metric.arrivals = number(stays.arrivals); metric.departures = number(stays.departures); metric.inHouse = number(stays.inHouse); metric.roomsAvailable = number(occupancy.availableRooms); metric.dirtyRooms = number(operations.dirtyRooms ?? occupancy.dirtyRooms); metric.cleaningRooms = number(operations.cleaningRooms ?? occupancy.cleaningRooms); metric.outOfOrderRooms = number(operations.outOfOrderRooms ?? occupancy.outOfOrderRooms); metric.openMaintenanceTickets = number(operations.openMaintenanceTickets);
    return metric;
  }

  async dashboard(userId: string, query: ManagementDashboardQueryDto) {
    const hotel = await this.resolveHotel(userId, query.hotelId);
    const current = getHotelOperationalDate(hotel.timezoneName);
    const from = query.from ? parseDateOnly(query.from, 'from') : current;
    const to = query.to ? parseDateOnly(query.to, 'to') : from;
    const dayCount = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
    if (dayCount < 1) throw new BadRequestException('to must be on or after from.');
    if (dayCount > 366) throw new BadRequestException('Dashboard date range cannot exceed 366 days.');
    if (toDateOnly(to) > toDateOnly(current)) throw new BadRequestException('Dashboard dates cannot be in the future.');
    const dates = Array.from({ length: dayCount }, (_, index) => addDays(from, index));
    const closedDays = await this.p.hotelBusinessDay.findMany({ where: { hotelId: hotel.id, businessDate: { gte: from, lte: to }, status: HotelBusinessDayStatus.CLOSED }, select: { businessDate: true, summary: true } });
    const closedByDate = new Map(closedDays.map((day: any) => [toDateOnly(day.businessDate), day]));
    for (const date of dates) if (toDateOnly(date) < toDateOnly(current) && !closedByDate.has(toDateOnly(date))) throw new BadRequestException(`Historical dashboard data is unavailable for ${toDateOnly(date)} because the business day was not closed.`);
    const liveNeeded = dates.some((date) => toDateOnly(date) === toDateOnly(current) && !closedByDate.has(toDateOnly(date)));
    const live = liveNeeded ? await this.liveDay(hotel, current) : { metric: emptyMetric(), sources: new Map<string, { reservations: Set<string>; roomNights: number; roomRevenue: number }>(), roomTypes: new Map<string, { name: string; roomNights: number; roomRevenue: number }>() };
    const daily = dates.map((date) => {
      const closed = closedByDate.get(toDateOnly(date)); const metric = closed ? this.snapshotMetric(closed.summary) : live.metric;
      const occupancy = metric.sellableRoomNights ? metric.occupiedRoomNights / metric.sellableRoomNights * 100 : 0;
      return { date: toDateOnly(date), occupancy: money(occupancy), adr: metric.occupiedRoomNights ? money(metric.roomRevenue / metric.occupiedRoomNights) : 0, revpar: metric.sellableRoomNights ? money(metric.roomRevenue / metric.sellableRoomNights) : 0, roomRevenue: money(metric.roomRevenue), incidentalRevenue: money(metric.incidentalRevenue), grossRevenue: money(metric.roomRevenue + metric.incidentalRevenue) };
    });
    const total = dates.reduce((sum, date) => { const closed = closedByDate.get(toDateOnly(date)); const metric = closed ? this.snapshotMetric(closed.summary) : live.metric; for (const key of Object.keys(sum) as (keyof Metric)[]) sum[key] += metric[key]; return sum; }, emptyMetric());
    const sources = [...live.sources.entries()].map(([source, row]) => ({ source, reservations: row.reservations.size, roomNights: row.roomNights, roomRevenue: money(row.roomRevenue) })).sort((a, b) => b.roomRevenue - a.roomRevenue);
    const roomTypes = [...live.roomTypes.entries()].map(([roomTypeId, row]) => ({ roomTypeId, roomType: row.name, roomNights: row.roomNights, roomRevenue: money(row.roomRevenue), adr: row.roomNights ? money(row.roomRevenue / row.roomNights) : 0 }));
    return { period: { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, from: toDateOnly(from), to: toDateOnly(to), days: dayCount }, kpis: { occupancy: total.sellableRoomNights ? money(total.occupiedRoomNights / total.sellableRoomNights * 100) : 0, adr: total.occupiedRoomNights ? money(total.roomRevenue / total.occupiedRoomNights) : 0, revpar: total.sellableRoomNights ? money(total.roomRevenue / total.sellableRoomNights) : 0, roomRevenue: money(total.roomRevenue), incidentalRevenue: money(total.incidentalRevenue), grossRevenue: money(total.roomRevenue + total.incidentalRevenue), paymentsReceived: money(total.payments), outstandingBalance: money(live.metric.outstandingBalance), arrivals: total.arrivals, departures: total.departures, inHouse: total.inHouse, occupiedRoomNights: total.occupiedRoomNights, sellableRoomNights: total.sellableRoomNights }, daily, sources, roomTypes, operations: { roomsAvailable: live.metric.roomsAvailable, dirtyRooms: live.metric.dirtyRooms, cleaningRooms: live.metric.cleaningRooms, outOfOrderRooms: live.metric.outOfOrderRooms, openMaintenanceTickets: live.metric.openMaintenanceTickets } };
  }
}

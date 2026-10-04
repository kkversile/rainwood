import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingSource, Prisma, ReservationStatus, RoomOperationalStatus, StayStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { addDays, parseDateOnly, todayUtc } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { ReportQueryDto, RoomRackQueryDto } from './reports.dto';
import { guestArrivalContext } from '../guests/guests.service';

function flag(value: unknown) {
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

function hotelDateOnly(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

@Injectable()
export class ReportsService {
  constructor(public readonly prisma: PrismaService) {}

  async dashboard(hotelId?: string) {
    const hotelWhere = hotelId ? { hotelId } : {};
    const [bookings, pendingSync, pendingPayments, revenue, arrivals, failedJobs] = await Promise.all([
      this.prisma.reservation.count({ where: { ...hotelWhere, status: { not: 'CANCELLED' } } }),
      this.prisma.reservation.count({ where: { ...hotelWhere, syncStatus: { in: ['PENDING', 'RETRY', 'FAILED', 'MANUAL_ACTION_REQUIRED', 'DEAD_LETTER'] } } }),
      this.prisma.reservation.aggregate({ _sum: { balanceAmount: true }, where: { ...hotelWhere, balanceAmount: { gt: 0 }, status: { not: 'CANCELLED' } } }),
      this.prisma.reservation.aggregate({ _sum: { totalAmount: true }, where: { ...hotelWhere, status: { in: ['CONFIRMED', 'COMPLETED', 'MODIFIED'] } } }),
      this.dashboardArrivals(hotelId),
      this.dashboardFailedJobs(hotelId),
    ]);
    return { bookings, pendingSync, balancePending: Number(pendingPayments._sum.balanceAmount ?? 0), revenue: Number(revenue._sum.totalAmount ?? 0), arrivals, failedJobs };
  }

  async reservations(query: ReportQueryDto) {
    const where = this.where(query);
    const page = Math.max(1, Number(query.page));
    const limit = Math.min(200, Math.max(1, Number(query.limit)));
    const [items, total, totals] = await Promise.all([
      this.prisma.reservation.findMany({ where, include: { hotel: true, lines: { include: { roomType: true, ratePlan: true } }, payments: true }, orderBy: { checkIn: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.reservation.count({ where }),
      this.prisma.reservation.aggregate({ where, _sum: { totalAmount: true, advanceAmount: true, balanceAmount: true } }),
    ]);
    return { items, totals: { totalAmount: Number(totals._sum.totalAmount ?? 0), advanceAmount: Number(totals._sum.advanceAmount ?? 0), balanceAmount: Number(totals._sum.balanceAmount ?? 0) }, pagination: { page, limit, total, pages: Math.ceil(total / limit) } };
  }

  async summary(query: ReportQueryDto) {
    const reservations = await this.prisma.reservation.findMany({ where: this.where(query), include: { hotel: { select: { id: true, name: true } }, lines: { include: { nights: true } } }, orderBy: [{ hotel: { name: 'asc' } }, { checkIn: 'asc' }], take: 10000 });
    const waitlist = await this.prisma.waitlistEntry.findMany({ where: { hotelId: query.hotelId, checkIn: query.from || query.to ? { gte: query.from ? parseDateOnly(query.from, 'from') : undefined, lt: query.to ? parseDateOnly(query.to, 'to') : undefined } : undefined }, select: { hotelId: true, checkIn: true } });
    type Totals = { reservationCount: number; roomNights: number; tentative: number; totalAmount: number; advance: number; waitingList: number };
    const zero = (): Totals => ({ reservationCount: 0, roomNights: 0, tentative: 0, totalAmount: 0, advance: 0, waitingList: 0 });
    const groups = new Map<string, { hotelId: string; hotel: string; months: Map<string, Totals> }>();
    for (const reservation of reservations) {
      const month = reservation.checkIn.toISOString().slice(0, 7);
      let group = groups.get(reservation.hotelId);
      if (!group) { group = { hotelId: reservation.hotelId, hotel: reservation.hotel.name, months: new Map() }; groups.set(reservation.hotelId, group); }
      let row = group.months.get(month);
      if (!row) { row = zero(); group.months.set(month, row); }
      row.reservationCount += 1;
      row.roomNights += reservation.lines.reduce((sum, line) => sum + line.nights.reduce((nights, night) => nights + night.rooms, 0), 0);
      row.tentative += reservation.status === 'TENTATIVE' ? 1 : 0;
      row.totalAmount += Number(reservation.totalAmount);
      row.advance += Number(reservation.advanceAmount);
    }
    for (const entry of waitlist) {
      const group = groups.get(entry.hotelId);
      const row = group?.months.get(entry.checkIn.toISOString().slice(0, 7));
      if (row) row.waitingList += 1;
    }
    const items = [...groups.values()].map((group) => {
      const months = [...group.months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, row], index) => { const year = Number(key.slice(0, 4)); return { serial: index + 1, month: new Date(`${key}-01T00:00:00.000Z`).toLocaleString('en-US', { month: 'long', timeZone: 'UTC' }), financialYear: `${String(year).slice(-2)}${String(year + 1).slice(-2)}`, ...row }; });
      const total = months.reduce((sum, row) => ({ reservationCount: sum.reservationCount + row.reservationCount, roomNights: sum.roomNights + row.roomNights, tentative: sum.tentative + row.tentative, totalAmount: sum.totalAmount + row.totalAmount, advance: sum.advance + row.advance, waitingList: sum.waitingList + row.waitingList }), zero());
      return { hotelId: group.hotelId, hotel: group.hotel, months, total };
    });
    const overall = items.reduce((sum, group) => ({ reservationCount: sum.reservationCount + group.total.reservationCount, roomNights: sum.roomNights + group.total.roomNights, tentative: sum.tentative + group.total.tentative, totalAmount: sum.totalAmount + group.total.totalAmount, advance: sum.advance + group.total.advance, waitingList: sum.waitingList + group.total.waitingList }), zero());
    return { items, overall, filters: { from: query.from ?? null, to: query.to ?? null, hotelId: query.hotelId ?? null } };
  }

  async roomRack(query: RoomRackQueryDto) {
    const requestedDays = Math.min(31, Math.max(1, Number(query.days) || 14));
    const from = query.from ? parseDateOnly(query.from, 'from') : await this.defaultOperationalDate(query);
    const to = query.to ? parseDateOnly(query.to, 'to') : addDays(from, requestedDays - 1);
    const rangeTo = addDays(to, 1);
    const days = Math.max(1, Math.round((rangeTo.getTime() - from.getTime()) / 86_400_000));
    if (days > 31) throw new BadRequestException('Room Rack date range cannot exceed 31 days.');
    const hotelId = query.hotelId ?? (query.hotelIds?.length === 1 ? query.hotelIds[0] : undefined);
    if (!hotelId) throw new BadRequestException('Select a hotel before loading the Room Rack.');
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, timezoneName: true } });
    if (!hotel) throw new NotFoundException('Hotel not found.');
    const roomStatuses = Object.values(RoomOperationalStatus);
    const requestedRoomStatus = query.roomStatus && roomStatuses.includes(query.roomStatus as RoomOperationalStatus) ? query.roomStatus as RoomOperationalStatus : undefined;
    const roomWhere: Prisma.RoomWhereInput = {
      hotelId, active: true, roomTypeId: query.roomTypeId || undefined, floor: query.floor || undefined, wing: query.wing || undefined, status: requestedRoomStatus,
    };
    const [rooms, eligibleRoomFacets, reservations] = await Promise.all([
      this.prisma.room.findMany({
        where: roomWhere,
        orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
        include: {
          roomType: { select: { id: true, name: true } },
          housekeepingTasks: { where: { status: { in: ['PENDING', 'ACCEPTED', 'CLEANING'] } }, orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, status: true, issueNote: true, updatedAt: true } },
          maintenanceTickets: { where: { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } }, orderBy: { updatedAt: 'desc' }, take: 1, select: { id: true, status: true, priority: true, title: true, requiresOutOfOrder: true, updatedAt: true } },
        },
      }),
      this.prisma.room.findMany({
        where: { hotelId, active: true },
        select: { floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } },
        orderBy: [{ floor: 'asc' }, { roomNumber: 'asc' }],
      }),
      this.prisma.reservation.findMany({
        where: { hotelId, status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED, ReservationStatus.NO_SHOW] }, checkIn: { lt: rangeTo }, checkOut: { gt: from }, ...(query.stayStatus ? { stayStatus: query.stayStatus as StayStatus } : {}) },
        orderBy: [{ checkIn: 'asc' }, { reference: 'asc' }],
        select: {
          id: true, reference: true, guestName: true, checkIn: true, checkOut: true, status: true, stayStatus: true, source: true, balanceAmount: true,
          groupReservation: { select: { id: true, groupCode: true, groupName: true, status: true } },
          lines: { select: { id: true, rooms: true, adults: true, children: true, checkIn: true, checkOut: true, roomType: { select: { id: true, name: true } } } },
          roomAssignments: { where: { assignedAt: { lt: rangeTo }, OR: [{ unassignedAt: null }, { unassignedAt: { gte: from } }] }, orderBy: { assignedAt: 'asc' }, select: { id: true, reservationLineId: true, roomId: true, assignedAt: true, unassignedAt: true, reason: true, room: { select: { id: true, roomNumber: true, floor: true, wing: true, roomType: { select: { id: true, name: true } } } } } },
        },
      }),
    ]);
    const roomIds = new Set(rooms.map((room) => room.id));
    const search = query.search?.trim().toLowerCase();
    const dateOnly = (value: Date) => value.toISOString().slice(0, 10);
    const assignmentDateOnly = (value: Date) => hotelDateOnly(value, hotel.timezoneName);
    const clampStart = (a: string, b: string) => a > b ? a : b;
    const clampEnd = (a: string, b: string) => a < b ? a : b;
    const blocks: Array<any> = [];
    const unassignedReservations: Array<any> = [];
    const conflictsByRoomDate = new Map<string, any[]>();
    for (const reservation of reservations) {
      const roomTypes = [...new Map(reservation.lines.map((line) => [line.roomType.id, line.roomType.name])).entries()].map(([id, name]) => ({ id, name }));
      const matchesSearch = !search || `${reservation.reference} ${reservation.guestName} ${roomTypes.map((item) => item.name).join(' ')}`.toLowerCase().includes(search);
      const unassignedLines: Array<any> = [];
      for (const line of reservation.lines) {
        if (query.roomTypeId && line.roomType.id !== query.roomTypeId) continue;
        const lineStart = clampStart(dateOnly(line.checkIn), dateOnly(from));
        const lineEnd = clampEnd(dateOnly(line.checkOut), dateOnly(rangeTo));
        if (lineStart >= lineEnd) continue;
        const lineAssignments = reservation.roomAssignments.filter((assignment) => assignment.reservationLineId === line.id || (!assignment.reservationLineId && reservation.lines.length === 1));
        const nightlyRoomIds: string[][] = [];
        for (let date = lineStart; date < lineEnd; date = addDays(parseDateOnly(date, 'rack date'), 1).toISOString().slice(0, 10)) {
          const roomIdsForNight = [...new Set(lineAssignments.filter((assignment) => {
            if (assignment.room.roomType.id !== line.roomType.id) return false;
            const assignmentStart = assignmentDateOnly(assignment.assignedAt);
            const assignmentEnd = assignment.unassignedAt ? assignmentDateOnly(assignment.unassignedAt) : dateOnly(rangeTo);
            return assignmentStart <= date && date < assignmentEnd;
          }).map((assignment) => assignment.roomId))];
          nightlyRoomIds.push(roomIdsForNight);
        }
        const assignedRooms = nightlyRoomIds.length ? Math.min(...nightlyRoomIds.map((roomIds) => roomIds.length)) : 0;
        const remainingRooms = Math.max(line.rooms - assignedRooms, 0);
        if (remainingRooms > 0) unassignedLines.push({ reservationLineId: line.id, roomType: line.roomType, requiredRooms: line.rooms, assignedRooms, remainingRooms });
      }
      if (matchesSearch && unassignedLines.length) {
        const rooms = unassignedLines.reduce((sum, line) => sum + line.requiredRooms, 0);
        const assignedRooms = unassignedLines.reduce((sum, line) => sum + line.assignedRooms, 0);
        const remainingRooms = unassignedLines.reduce((sum, line) => sum + line.remainingRooms, 0);
        unassignedReservations.push({ reservationId: reservation.id, reference: reservation.reference, guestName: reservation.guestName, checkIn: dateOnly(reservation.checkIn), checkOut: dateOnly(reservation.checkOut), rooms, assignedRooms, remainingRooms, adults: reservation.lines.reduce((sum, line) => sum + line.adults, 0), children: reservation.lines.reduce((sum, line) => sum + line.children, 0), roomTypes: unassignedLines.map((line) => line.roomType), unassignedLines, status: reservation.status, stayStatus: reservation.stayStatus, source: reservation.source, balanceAmount: Number(reservation.balanceAmount), groupReservation: reservation.groupReservation });
      }
      for (const assignment of reservation.roomAssignments) {
        if (!roomIds.has(assignment.roomId)) continue;
        const line = reservation.lines.find((candidate) => candidate.id === assignment.reservationLineId) ?? (reservation.lines.length === 1 ? reservation.lines[0] : undefined);
        if (!line) continue;
        const start = clampStart(clampStart(dateOnly(line.checkIn), assignmentDateOnly(assignment.assignedAt)), query.from ?? dateOnly(from));
        const end = clampEnd(clampEnd(dateOnly(line.checkOut), assignment.unassignedAt ? assignmentDateOnly(assignment.unassignedAt) : dateOnly(rangeTo)), dateOnly(rangeTo));
        if (start >= end) continue;
        const block = { id: assignment.id, reservationId: reservation.id, reservationLineId: assignment.reservationLineId, roomId: assignment.roomId, reference: reservation.reference, guestName: reservation.guestName, roomType: line.roomType, checkIn: start, checkOut: end, adults: line.adults, children: line.children, status: reservation.status, stayStatus: reservation.stayStatus, source: reservation.source, balanceAmount: Number(reservation.balanceAmount), reason: assignment.reason ?? null, groupReservation: reservation.groupReservation };
        if (search && !`${block.reference} ${block.guestName} ${block.roomType.name} ${assignment.room.roomNumber}`.toLowerCase().includes(search)) continue;
        blocks.push(block);
        for (let date = start; date < end; date = addDays(parseDateOnly(date, 'rack date'), 1).toISOString().slice(0, 10)) {
          const key = `${assignment.roomId}:${date}`;
          const current = conflictsByRoomDate.get(key) ?? [];
          current.push({ reference: block.reference, guestName: block.guestName, reservationId: block.reservationId });
          conflictsByRoomDate.set(key, current);
        }
      }
    }
    const filteredRooms = rooms.filter((room) => !search || `${room.roomNumber} ${room.floor ?? ''} ${room.wing ?? ''} ${room.roomType.name}`.toLowerCase().includes(search) || blocks.some((block) => block.roomId === room.id));
    const visibleRoomIds = new Set(filteredRooms.map((room) => room.id));
    const visibleBlocks = blocks.filter((block) => visibleRoomIds.has(block.roomId));
    const conflicts = [...conflictsByRoomDate.entries()].filter(([key, rows]) => visibleRoomIds.has(key.split(':')[0]) && new Set(rows.map((row) => row.reservationId)).size > 1).map(([key, rows]) => { const [roomId, date] = key.split(':'); const room = filteredRooms.find((item) => item.id === roomId); return { roomId, roomNumber: room?.roomNumber ?? 'Unknown', date, reservations: rows }; });
    const dateValues = Array.from({ length: days }, (_, index) => addDays(from, index).toISOString().slice(0, 10));
    const occupiedRoomDates = new Set<string>();
    for (const block of visibleBlocks) for (const date of dateValues) if (date >= block.checkIn && date < block.checkOut) occupiedRoomDates.add(`${block.roomId}:${date}`);
    const assignedRoomNights = occupiedRoomDates.size;
    const totalRoomNights = filteredRooms.length * days;
    const roomRows = filteredRooms.map((room) => ({ id: room.id, roomNumber: room.roomNumber, floor: room.floor, wing: room.wing, status: room.status, roomType: room.roomType, housekeeping: room.housekeepingTasks[0] ?? null, maintenance: room.maintenanceTickets[0] ?? null, assignments: visibleBlocks.filter((block) => block.roomId === room.id) }));
    const facets = { roomTypes: [...new Map(eligibleRoomFacets.map((room) => [room.roomType.id, room.roomType])).values()].sort((a, b) => a.name.localeCompare(b.name)), floors: [...new Set(eligibleRoomFacets.map((room) => room.floor).filter((value): value is string => Boolean(value)))].sort(), wings: [...new Set(eligibleRoomFacets.map((room) => room.wing).filter((value): value is string => Boolean(value)))].sort(), roomStatuses: [...new Set(eligibleRoomFacets.map((room) => room.status))].sort() };
    return { title: 'RAINWOOD ROOM RACK & OCCUPANCY PLANNING REPORT', hotel, range: { from: from.toISOString().slice(0, 10), to: addDays(rangeTo, -1).toISOString().slice(0, 10), days, maxDays: 31 }, dates: dateValues, rooms: roomRows, assignments: visibleBlocks, unassignedReservations, conflicts, facets, summary: { physicalRooms: filteredRooms.length, roomNights: totalRoomNights, assignedRoomNights, unassignedReservations: unassignedReservations.length, occupancyPercent: totalRoomNights ? Math.min(100, Math.round((assignedRoomNights / totalRoomNights) * 100)) : 0, byStatus: Object.fromEntries(roomStatuses.map((status) => [status, filteredRooms.filter((room) => room.status === status).length])) }, filters: { hotelId, roomTypeId: query.roomTypeId ?? null, floor: query.floor ?? null, wing: query.wing ?? null, roomStatus: query.roomStatus ?? null, stayStatus: query.stayStatus ?? null, search: query.search ?? null } };
  }

  async expectedArrivals(query: ReportQueryDto, user?: { role?: string }) {
    const from = query.from ? parseDateOnly(query.from, 'from') : await this.defaultOperationalDate(query);
    const to = query.to ? addDays(parseDateOnly(query.to, 'to'), 1) : addDays(from, 1);
    const hotelIds = query.hotelIds?.length ? query.hotelIds : query.hotelId ? [query.hotelId] : undefined;
    const statuses: ReservationStatus[] = query.statuses?.length ? query.statuses : query.status ? [query.status] : [ReservationStatus.CONFIRMED, ReservationStatus.TENTATIVE];
    const reconfirmedOnly = flag(query.reconfirmedOnly);
    const includeWaitlist = flag(query.includeWaitlist);
    const where: Prisma.ReservationWhereInput = {
      hotelId: hotelIds?.length ? { in: hotelIds } : undefined,
      source: query.sources?.length ? { in: query.sources } : query.source,
      status: { in: statuses },
      checkIn: { gte: from, lt: to },
      ...(reconfirmedOnly ? { reconfirmedAt: { not: null } } : {}),
    };
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(query.limit) || 25));
    const reservationFilters: Prisma.Sql[] = [
      Prisma.sql`r."checkIn" >= ${from}`,
      Prisma.sql`r."checkIn" < ${to}`,
      Prisma.sql`r."status" IN (${Prisma.join(statuses)})`,
    ];
    if (hotelIds?.length) reservationFilters.push(Prisma.sql`r."hotelId" IN (${Prisma.join(hotelIds)})`);
    if (query.sources?.length) reservationFilters.push(Prisma.sql`r."source" IN (${Prisma.join(query.sources)})`);
    else if (query.source) reservationFilters.push(Prisma.sql`r."source" = ${query.source}`);
    if (reconfirmedOnly) reservationFilters.push(Prisma.sql`r."reconfirmedAt" IS NOT NULL`);
    const candidateWaitlist = includeWaitlist ? Prisma.sql` UNION ALL SELECT 'WAITLIST' AS source, w."id" AS id, w."checkIn" AS arrival, h2."name" AS hotel_name, ('WAIT-' || UPPER(RIGHT(w."id", 8))) AS reference FROM "WaitlistEntry" w JOIN "Hotel" h2 ON h2."id" = w."hotelId" WHERE w."checkIn" >= ${from} AND w."checkIn" < ${to} AND w."status" = 'WAITING'${hotelIds?.length ? Prisma.sql` AND w."hotelId" IN (${Prisma.join(hotelIds)})` : Prisma.empty}` : Prisma.empty;
    const candidateRows = await this.prisma.$queryRaw<Array<{ source: 'RESERVATION' | 'WAITLIST'; id: string }>>(Prisma.sql`SELECT source, id FROM (SELECT 'RESERVATION' AS source, r."id" AS id, r."checkIn" AS arrival, h."name" AS hotel_name, r."reference" AS reference FROM "Reservation" r JOIN "Hotel" h ON h."id" = r."hotelId" WHERE ${Prisma.join(reservationFilters, ' AND ')}${candidateWaitlist}) combined ORDER BY arrival ASC, hotel_name ASC, reference ASC OFFSET ${(page - 1) * limit} LIMIT ${limit}`);
    const reservationIds = candidateRows.filter((row) => row.source === 'RESERVATION').map((row) => row.id);
    const waitlistIds = candidateRows.filter((row) => row.source === 'WAITLIST').map((row) => row.id);
    const [reservations, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { ...where, id: { in: reservationIds } },
        select: {
          id: true, reference: true, hotel: { select: { id: true, name: true } }, guestName: true, checkIn: true, checkOut: true, stayStatus: true, checkedInAt: true, checkedInBy: { select: { id: true, name: true } },
          groupReservation: { select: { id: true, groupCode: true, groupName: true, status: true } },
          source: true, sourceName: true, status: true, paymentStatus: true, totalAmount: true, advanceAmount: true, balanceAmount: true,
          mobile: true, gstin: true, specialRequest: true, billingInstruction: true, internalRemark: true,
          guestProfile: { select: { id: true, preferences: true, reservations: { where: { status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED] }, OR: [{ stayStatus: StayStatus.CHECKED_OUT }, { status: ReservationStatus.COMPLETED }] }, select: { status: true, stayStatus: true, checkOut: true }, orderBy: { checkOut: 'desc' } } } },
          createdBy: { select: { id: true, name: true } }, reconfirmedAt: true, reconfirmedBy: { select: { id: true, name: true } },
          lines: { select: { rooms: true, adults: true, children: true, roomType: { select: { id: true, name: true } } } },
          payments: { select: { mode: true, verified: true, paidAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
          roomAssignments: { where: { unassignedAt: null }, select: { room: { select: { id: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } } } } },
        },
        orderBy: [{ checkIn: 'asc' }, { hotel: { name: 'asc' } }, { reference: 'asc' }],
      }),
      this.prisma.reservation.count({ where }),
    ]);
    const waitlistWhere = { hotelId: hotelIds?.length ? { in: hotelIds } : undefined, checkIn: { gte: from, lt: to }, status: 'WAITING' } as const;
    const [waitlist, waitlistTotal] = includeWaitlist ? await Promise.all([this.prisma.waitlistEntry.findMany({
      where: { ...waitlistWhere, id: { in: waitlistIds } },
      select: { id: true, hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } }, guestName: true, checkIn: true, checkOut: true, rooms: true, status: true },
      orderBy: [{ checkIn: 'asc' }, { hotel: { name: 'asc' } }, { createdAt: 'asc' }],
    }), this.prisma.waitlistEntry.count({ where: waitlistWhere })]) : [[], 0] as const;
    const canSeeInternalRemarks = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION'].includes(user?.role ?? '');
    const dateValue = (value: Date | null | undefined) => value ? value.toISOString().slice(0, 10) : null;
    const reservationItems = reservations.map((reservation) => {
      const roomTypes = new Map<string, { id: string; name: string; rooms: number }>();
      let rooms = 0; let adults = 0; let children = 0;
      for (const line of reservation.lines) {
        rooms += line.rooms; adults += line.adults; children += line.children;
        const current = roomTypes.get(line.roomType.id);
        if (current) current.rooms += line.rooms;
        else roomTypes.set(line.roomType.id, { id: line.roomType.id, name: line.roomType.name, rooms: line.rooms });
      }
      const paymentModes = [...new Set(reservation.payments.filter((payment) => payment.verified).map((payment) => payment.mode))];
      const selectedPayment = reservation.payments.filter((payment) => payment.verified).sort((a, b) => (b.paidAt ?? b.createdAt).getTime() - (a.paidAt ?? a.createdAt).getTime())[0];
      const specialRequest = reservation.specialRequest ?? null;
      const billingInstruction = reservation.billingInstruction ?? null;
      const internalRemark = canSeeInternalRemarks ? reservation.internalRemark ?? null : null;
      return {
        rowType: 'RESERVATION' as const, reservationId: reservation.id, reference: reservation.reference, hotel: reservation.hotel,
        guestName: reservation.guestName, arrival: dateValue(reservation.checkIn), departure: dateValue(reservation.checkOut),
        nights: Math.max(0, Math.round((reservation.checkOut.getTime() - reservation.checkIn.getTime()) / 86_400_000)), rooms,
        roomTypes: [...roomTypes.values()], adults, children, pax: adults + children, status: reservation.status, source: reservation.source,
        sourceName: reservation.sourceName, businessType: reservation.source === 'AGENT' || reservation.source === 'COMPANY' ? 'B2B' : reservation.source === 'OTA' ? 'OTA' : 'B2C',
        advance: Number(reservation.advanceAmount), totalAmount: Number(reservation.totalAmount), balance: Number(reservation.balanceAmount),
        paymentStatus: reservation.paymentStatus, paymentMode: selectedPayment?.mode ?? null, paymentModes,
        creditDate: dateValue(selectedPayment ? (selectedPayment.paidAt ?? selectedPayment.createdAt) : null), bookedBy: reservation.createdBy, mobile: reservation.mobile, gstin: reservation.gstin,
        specialRequest, billingInstruction, internalRemark, instruction: [specialRequest, billingInstruction].filter(Boolean).join(' | '),
        reconfirmed: Boolean(reservation.reconfirmedAt), reconfirmedAt: dateValue(reservation.reconfirmedAt), reconfirmedBy: reservation.reconfirmedBy,
        stayStatus: reservation.stayStatus, checkedInAt: reservation.checkedInAt, checkedInBy: reservation.checkedInBy, groupReservation: reservation.groupReservation,
        guestProfile: guestArrivalContext(reservation.guestProfile),
        assignedRooms: (reservation.roomAssignments ?? []).map((assignment) => assignment.room),
        confirmed: ['CONFIRMED', 'COMPLETED'].includes(reservation.status), amount: Number(reservation.totalAmount),
        roomType: [...roomTypes.values()].map((roomType) => `${roomType.name} × ${roomType.rooms}`).join(', '),
      };
    });
    const waitlistItems = waitlist.map((entry) => ({
      rowType: 'WAITLIST' as const, reservationId: null, reference: `WAIT-${entry.id.slice(-8).toUpperCase()}`, hotel: entry.hotel, guestName: entry.guestName,
      arrival: dateValue(entry.checkIn), departure: dateValue(entry.checkOut), nights: Math.max(0, Math.round((entry.checkOut.getTime() - entry.checkIn.getTime()) / 86_400_000)), rooms: entry.rooms,
      roomTypes: entry.roomType ? [{ id: entry.roomType.id, name: entry.roomType.name, rooms: entry.rooms }] : [], adults: null, children: null, pax: null,
      status: entry.status, source: null, sourceName: null, businessType: null, advance: 0, totalAmount: 0, balance: 0, paymentStatus: null, paymentMode: null, paymentModes: [], creditDate: null,
      bookedBy: null, mobile: null, gstin: null, specialRequest: null, billingInstruction: null, internalRemark: null, instruction: '', reconfirmed: false, reconfirmedAt: null, reconfirmedBy: null,
      confirmed: false, amount: 0, stayStatus: 'EXPECTED', checkedInAt: null, checkedInBy: null, assignedRooms: [], roomType: entry.roomType ? `${entry.roomType.name} × ${entry.rooms}` : 'Any room type',
    }));
    const items = [...reservationItems, ...waitlistItems].sort((a, b) => String(a.arrival).localeCompare(String(b.arrival)) || a.hotel.name.localeCompare(b.hotel.name) || a.reference.localeCompare(b.reference));
    const [financialSummary, lineSummary] = await Promise.all([
      this.prisma.reservation.aggregate({ where, _sum: { totalAmount: true, advanceAmount: true, balanceAmount: true } }),
      this.prisma.reservationLine.aggregate({ where: { reservation: where }, _sum: { rooms: true, adults: true, children: true } }),
    ]);
    const rooms = Number(lineSummary._sum.rooms ?? 0); const adults = Number(lineSummary._sum.adults ?? 0); const children = Number(lineSummary._sum.children ?? 0);
    const reservationSummary = { reservations: total, rooms, adults, children, pax: adults + children, totalAmount: Number(financialSummary._sum.totalAmount ?? 0), advance: Number(financialSummary._sum.advanceAmount ?? 0), balance: Number(financialSummary._sum.balanceAmount ?? 0) };
    const combinedTotal = total + waitlistTotal;
    return { items, summary: { ...reservationSummary, waitlist: waitlistTotal }, pagination: { page, limit, total: combinedTotal, pages: Math.ceil(combinedTotal / limit) }, filters: { from: query.from ?? dateValue(from), to: query.to ?? dateValue(addDays(to, -1)), hotelIds: hotelIds ?? [], statuses, sources: query.sources ?? (query.source ? [query.source] : []), includeWaitlist, reconfirmedOnly } };
  }

  arrivals(query: ReportQueryDto) { return this.dateReport(query, 'checkIn'); }
  departures(query: ReportQueryDto) { return this.dateReport(query, 'checkOut'); }

  async cancellations(query: ReportQueryDto) {
    const where: any = {};
    if (query.from || query.to) where.createdAt = { gte: query.from ? parseDateOnly(query.from, 'from') : undefined, lt: query.to ? parseDateOnly(query.to, 'to') : undefined };
    const rows = await this.prisma.cancellationRequest.findMany({ where, include: { reservation: { include: { hotel: true } } }, orderBy: { createdAt: 'desc' }, take: Math.min(200, Number(query.limit ?? 50)) });
    return { items: rows, totals: { refundAmount: rows.reduce((sum, row) => sum + Number(row.refundAmount), 0) } };
  }

  async payments(query: ReportQueryDto) {
    const where: any = { reservation: this.where(query) };
    const rows = await this.prisma.payment.findMany({ where, include: { reservation: { include: { hotel: true } }, proofFile: true }, orderBy: { createdAt: 'desc' }, take: Math.min(200, Number(query.limit ?? 50)) });
    return { items: rows, totals: { verified: rows.filter((row) => row.verified).reduce((sum, row) => sum + Number(row.amount), 0), pending: rows.filter((row) => !row.verified).reduce((sum, row) => sum + Number(row.amount), 0) } };
  }

  exportCsv(query: ReportQueryDto) {
    return this.reservations(query).then((result) => {
      const lines = ['Reference,Guest,Hotel,Check-in,Check-out,Status,Payment status,Total,Advance,Balance'];
      for (const row of result.items) lines.push([row.reference, row.guestName, row.hotel.name, row.checkIn.toISOString().slice(0, 10), row.checkOut.toISOString().slice(0, 10), row.status, row.paymentStatus, row.totalAmount, row.advanceAmount, row.balanceAmount].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(','));
      return lines.join('\n');
    });
  }

  private where(query: ReportQueryDto): Prisma.ReservationWhereInput {
    const hotelIds = query.hotelIds?.length ? query.hotelIds : query.hotelId ? [query.hotelId] : undefined;
    const statuses = query.statuses?.length ? { in: query.statuses } : query.status ? query.status : undefined;
    const to = query.to ? addDays(parseDateOnly(query.to, 'to'), 1) : undefined;
    return { hotelId: hotelIds?.length ? { in: hotelIds } : undefined, source: query.sources?.length ? { in: query.sources } : query.source, status: statuses, checkIn: query.from || query.to ? { gte: query.from ? parseDateOnly(query.from, 'from') : undefined, lt: to } : undefined };
  }

  private async dateReport(query: ReportQueryDto, field: 'checkIn' | 'checkOut') {
    const from = query.from ? parseDateOnly(query.from, 'from') : await this.defaultOperationalDate(query);
    const to = query.to ? parseDateOnly(query.to, 'to') : addDays(from, 1);
    const where: any = { ...this.where({ ...query, from: undefined, to: undefined }), [field]: { gte: from, lt: to } };
    return this.prisma.reservation.findMany({ where, include: { hotel: true, lines: { include: { roomType: true } }, payments: true }, orderBy: { [field]: 'asc' } });
  }

  private async defaultOperationalDate(query: ReportQueryDto) {
    const hotelId = query.hotelId ?? (query.hotelIds?.length === 1 ? query.hotelIds[0] : undefined);
    if (!hotelId) return todayUtc();
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, select: { timezoneName: true } });
    return hotel ? getHotelOperationalDate(hotel.timezoneName) : todayUtc();
  }

  private async dashboardArrivals(hotelId?: string) {
    const hotels = await this.prisma.hotel.findMany({ where: { id: hotelId ?? undefined, active: true }, select: { id: true, timezoneName: true } });
    const counts = await Promise.all(hotels.map((hotel) => this.prisma.reservation.count({ where: { hotelId: hotel.id, status: 'CONFIRMED', checkIn: getHotelOperationalDate(hotel.timezoneName) } })));
    return counts.reduce((sum, count) => sum + count, 0);
  }

  private async dashboardFailedJobs(hotelId?: string) {
    const where: any = { status: { in: ['FAILED', 'DEAD_LETTER'] } };
    if (hotelId) {
      const reservations = await this.prisma.reservation.findMany({ where: { hotelId }, select: { id: true } });
      where.aggregateType = 'Reservation';
      where.aggregateId = { in: reservations.map((reservation) => reservation.id) };
    }
    return this.prisma.outboxJob.count({ where });
  }
}

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { HotelBusinessDayStatus, MaintenanceTicketStatus, Prisma, ReservationStatus, RoomOperationalStatus, StayStatus, UserRole } from '@prisma/client';
import { parseDateOnly, toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { PrismaService } from '../../common/prisma.service';
import { serializable } from '../../common/transactions';
import { NightAuditCloseDto, NightAuditPreviewQueryDto } from './night-audit.dto';

const ACTIVE_HOUSEKEEPING = ['PENDING', 'ACCEPTED', 'CLEANING'];
const ACTIVE_MAINTENANCE: MaintenanceTicketStatus[] = [MaintenanceTicketStatus.OPEN, MaintenanceTicketStatus.ASSIGNED, MaintenanceTicketStatus.IN_PROGRESS];
const EXCLUDED_RESERVATION_STATUSES: ReservationStatus[] = [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED];

type Issue = { code: string; message: string; details?: unknown };

@Injectable()
export class NightAuditService {
  constructor(private readonly p: PrismaService) {}

  private async admin(userId: string, client: any = this.p) {
    const user = await client.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, staffHotelId: true } });
    if (!user || (user.role !== UserRole.ADMIN && user.role !== UserRole.SUPER_ADMIN)) throw new ForbiddenException('Night Audit requires Admin or Super Admin access.');
    return user;
  }

  private async hotelFor(adminUserId: string, requestedHotelId: string | undefined, client: any = this.p) {
    const admin = await this.admin(adminUserId, client);
    if (admin.staffHotelId && requestedHotelId && admin.staffHotelId !== requestedHotelId) throw new NotFoundException('Hotel not found.');
    const hotelId = admin.staffHotelId ?? requestedHotelId;
    if (!hotelId) throw new BadRequestException('hotelId is required for a global Admin.');
    const hotel = await client.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, timezoneName: true, active: true } });
    if (!hotel || !hotel.active) throw new NotFoundException('Hotel not found.');
    return { admin, hotel };
  }

  private businessDate(hotel: { timezoneName: string }, requested?: string) {
    return requested ? parseDateOnly(requested, 'businessDate') : getHotelOperationalDate(hotel.timezoneName);
  }

  private dateRange(date: Date) { return { gte: date, lt: new Date(date.getTime() + 86_400_000) }; }

  private number(value: unknown) { return Number(value ?? 0); }

  private async calculate(client: any, hotel: { id: string; name: string; timezoneName: string }, businessDate: Date) {
    const range = this.dateRange(businessDate);
    const reservationWhere = { hotelId: hotel.id, status: { notIn: EXCLUDED_RESERVATION_STATUSES } };
    const [rooms, arrivalRows, departureRows, inHouseRows, noShowRows, nights, charges, payments, activeReservations, assignments, housekeepingTasks, maintenanceTickets] = await Promise.all([
      client.room.findMany({ where: { hotelId: hotel.id, active: true }, select: { id: true, roomNumber: true, status: true }, orderBy: { roomNumber: 'asc' } }),
      client.reservation.findMany({ where: { ...reservationWhere, checkIn: range }, select: { id: true, stayStatus: true } }),
      client.reservation.findMany({ where: { ...reservationWhere, checkOut: range }, select: { id: true, stayStatus: true } }),
      client.reservation.findMany({ where: { ...reservationWhere, stayStatus: StayStatus.CHECKED_IN }, select: { id: true, reference: true, guestName: true, checkIn: true, checkOut: true, roomAssignments: { where: { unassignedAt: null }, select: { roomId: true } }, totalAmount: true, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } }, payments: { where: { verified: true }, select: { amount: true } } } }),
      client.reservation.count({ where: { ...reservationWhere, OR: [{ status: ReservationStatus.NO_SHOW }, { stayStatus: StayStatus.NO_SHOW }], checkIn: range } }),
      client.reservationRoomNight.findMany({ where: { date: businessDate, reservationLine: { reservation: reservationWhere } }, select: { amount: true, totalAmount: true, rooms: true } }),
      client.reservationFolioCharge.findMany({ where: { postingDate: range, status: 'POSTED', reservation: reservationWhere }, select: { totalAmount: true } }),
      client.payment.findMany({ where: { verified: true, reservation: reservationWhere, OR: [{ paidAt: range }, { paidAt: null, createdAt: range }] }, select: { amount: true, mode: true, paidAt: true, createdAt: true } }),
      client.reservation.findMany({ where: { ...reservationWhere, stayStatus: { not: StayStatus.CHECKED_OUT } }, select: { id: true, reference: true, guestName: true, stayStatus: true, totalAmount: true, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } }, payments: { where: { verified: true }, select: { amount: true } } } }),
      client.reservationRoomAssignment.findMany({ where: { reservation: reservationWhere, unassignedAt: null }, select: { id: true, roomId: true, reservationId: true, room: { select: { id: true, roomNumber: true, hotelId: true, active: true, status: true } }, reservation: { select: { id: true, stayStatus: true } } } }),
      client.housekeepingTask.findMany({ where: { hotelId: hotel.id, status: { in: ACTIVE_HOUSEKEEPING as any } }, select: { id: true, roomId: true, status: true, room: { select: { roomNumber: true, status: true } } } }),
      client.maintenanceTicket.findMany({ where: { hotelId: hotel.id, status: { in: ACTIVE_MAINTENANCE } }, select: { id: true, roomId: true, status: true, requiresOutOfOrder: true, room: { select: { roomNumber: true, status: true } } } }),
    ]);

    const blockers: Issue[] = [];
    const warnings: Issue[] = [];
    const activeByRoom = new Map<string, typeof assignments>();
    for (const assignment of assignments) activeByRoom.set(assignment.roomId, [...(activeByRoom.get(assignment.roomId) ?? []), assignment]);
    const checkedInIds = new Set(inHouseRows.map((row: any) => row.id));
    for (const reservation of inHouseRows) {
      const active = assignments.filter((assignment: any) => assignment.reservationId === reservation.id);
      if (!active.length || active.some((assignment: any) => !assignment.room.active || assignment.room.hotelId !== hotel.id)) blockers.push({ code: 'CHECKED_IN_WITHOUT_VALID_ROOM', message: `Checked-in stay ${reservation.reference} has no valid active room assignment.` });
    }
    for (const room of rooms.filter((item: any) => item.status === RoomOperationalStatus.OCCUPIED)) {
      const active = activeByRoom.get(room.id) ?? [];
      if (!active.some((assignment: any) => checkedInIds.has(assignment.reservationId))) blockers.push({ code: 'OCCUPIED_WITHOUT_CHECKED_IN_STAY', message: `Occupied room ${room.roomNumber} has no checked-in reservation.` });
    }
    for (const [roomId, rows] of activeByRoom) if (rows.length > 1) blockers.push({ code: 'DUPLICATE_ACTIVE_ROOM_ASSIGNMENT', message: `Room ${rows[0].room.roomNumber} has multiple active assignments.`, details: { roomId, count: rows.length } });
    for (const task of housekeepingTasks) {
      const expected = task.status === 'CLEANING' ? RoomOperationalStatus.CLEANING : RoomOperationalStatus.DIRTY;
      if (task.room.status !== expected) blockers.push({ code: 'HOUSEKEEPING_ROOM_STATE_MISMATCH', message: `Housekeeping task for room ${task.room.roomNumber} is ${task.status} while the room is ${task.room.status}.` });
    }
    for (const ticket of maintenanceTickets) if (ticket.requiresOutOfOrder && ticket.room && ticket.room.status !== RoomOperationalStatus.OUT_OF_ORDER) blockers.push({ code: 'MAINTENANCE_ROOM_STATE_MISMATCH', message: `Maintenance ticket for room ${ticket.room.roomNumber} requires out-of-order status.` });

    const dirtyRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.DIRTY).map((room: any) => room.roomNumber);
    const cleaningRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.CLEANING).map((room: any) => room.roomNumber);
    const outOfOrderRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.OUT_OF_ORDER).map((room: any) => room.roomNumber);
    if (dirtyRooms.length) warnings.push({ code: 'DIRTY_ROOMS', message: `${dirtyRooms.length} room(s) are DIRTY.`, details: dirtyRooms });
    if (cleaningRooms.length) warnings.push({ code: 'CLEANING_ROOMS', message: `${cleaningRooms.length} room(s) are CLEANING.`, details: cleaningRooms });
    if (outOfOrderRooms.length) warnings.push({ code: 'OUT_OF_ORDER_ROOMS', message: `${outOfOrderRooms.length} room(s) are OUT OF ORDER.`, details: outOfOrderRooms });
    const pendingArrivals = arrivalRows.filter((row: any) => row.stayStatus === StayStatus.EXPECTED).length;
    const expectedDepartures = departureRows.filter((row: any) => row.stayStatus === StayStatus.CHECKED_IN).length;
    if (pendingArrivals) warnings.push({ code: 'PENDING_ARRIVALS', message: `${pendingArrivals} arrival(s) are not checked in.` });
    if (expectedDepartures) warnings.push({ code: 'EXPECTED_DEPARTURES_STILL_IN_HOUSE', message: `${expectedDepartures} expected departure(s) are still checked in.` });
    const outstandingByReservation = activeReservations.map((row: any) => Math.max(this.number(row.totalAmount) + row.folioCharges.reduce((sum: number, charge: any) => sum + this.number(charge.totalAmount), 0) - row.payments.reduce((sum: number, payment: any) => sum + this.number(payment.amount), 0), 0));
    const outstandingGuestBalance = outstandingByReservation.reduce((sum: number, amount: number) => sum + amount, 0);
    const unsettledCheckoutCount = activeReservations.filter((_row: any, index: number) => outstandingByReservation[index] > 0.005 && _row.stayStatus === StayStatus.CHECKED_IN).length;
    if (outstandingGuestBalance > 0.005) warnings.push({ code: 'OUTSTANDING_GUEST_BALANCE', message: `Outstanding guest balance is INR ${outstandingGuestBalance.toFixed(2)}.` });
    if (maintenanceTickets.length) warnings.push({ code: 'OPEN_MAINTENANCE_TICKETS', message: `${maintenanceTickets.length} maintenance ticket(s) remain open.` });

    const totalRooms = rooms.length;
    const occupiedRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.OCCUPIED).length;
    const availableRooms = rooms.filter((room: any) => room.status === RoomOperationalStatus.AVAILABLE).length;
    const outOfOrderCount = outOfOrderRooms.length;
    const sellableRooms = Math.max(totalRooms - outOfOrderCount, 0);
    const roomRevenue = nights.reduce((sum: number, night: any) => sum + this.number(night.totalAmount ?? night.amount), 0);
    const incidentalRevenue = charges.reduce((sum: number, charge: any) => sum + this.number(charge.totalAmount), 0);
    const paymentsByMode: Record<string, number> = { CASH: 0, UPI: 0, BANK_TRANSFER: 0, GATEWAY: 0, WALLET: 0, COMPANY_CREDIT: 0 };
    for (const payment of payments) paymentsByMode[payment.mode] = (paymentsByMode[payment.mode] ?? 0) + this.number(payment.amount);
    const totalPayments = Object.values(paymentsByMode).reduce((sum, amount) => sum + amount, 0);
    const summary = {
      occupancy: { totalRooms, occupiedRooms, availableRooms, dirtyRooms: dirtyRooms.length, cleaningRooms: cleaningRooms.length, outOfOrderRooms: outOfOrderCount, sellableRooms, occupancyPercent: sellableRooms ? Number(((occupiedRooms / sellableRooms) * 100).toFixed(2)) : 0 },
      stays: { arrivals: arrivalRows.length, checkedIn: arrivalRows.filter((row: any) => row.stayStatus === StayStatus.CHECKED_IN).length, departures: departureRows.length, checkedOut: departureRows.filter((row: any) => row.stayStatus === StayStatus.CHECKED_OUT).length, inHouse: inHouseRows.length, noShows: noShowRows },
      revenue: { roomRevenue, incidentalRevenue, grossRevenue: roomRevenue + incidentalRevenue },
      payments: { cash: paymentsByMode.CASH, upi: paymentsByMode.UPI, bankTransfer: paymentsByMode.BANK_TRANSFER, gateway: paymentsByMode.GATEWAY, wallet: paymentsByMode.WALLET, companyCredit: paymentsByMode.COMPANY_CREDIT, total: totalPayments },
      balances: { outstandingGuestBalance, unsettledCheckoutCount },
      operations: { dirtyRooms: dirtyRooms.length, cleaningRooms: cleaningRooms.length, outOfOrderRooms: outOfOrderCount, openMaintenanceTickets: maintenanceTickets.length, openHousekeepingTasks: housekeepingTasks.length },
    };
    return { summary, blockers, warnings };
  }

  private result(hotel: any, businessDate: Date, calculated: any, day: any = null) {
    return { businessDate: toDateOnly(businessDate), hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, summary: calculated.summary, blockers: calculated.blockers, warnings: calculated.warnings, alreadyClosed: day?.status === HotelBusinessDayStatus.CLOSED, closed: day?.status === HotelBusinessDayStatus.CLOSED ? { closedAt: day.closedAt, closedBy: day.closedBy ? { id: day.closedBy.id, name: day.closedBy.name } : null } : null, snapshot: day?.status === HotelBusinessDayStatus.CLOSED ? day.summary : null };
  }

  async preview(userId: string, query: NightAuditPreviewQueryDto) {
    const { hotel } = await this.hotelFor(userId, query.hotelId);
    const businessDate = this.businessDate(hotel, query.date);
    const [calculated, day] = await Promise.all([this.calculate(this.p, hotel, businessDate), this.p.hotelBusinessDay.findUnique({ where: { hotelId_businessDate: { hotelId: hotel.id, businessDate } }, include: { closedBy: { select: { id: true, name: true } } } })]);
    return this.result(hotel, businessDate, calculated, day);
  }

  async close(userId: string, body: NightAuditCloseDto) {
    const { hotel } = await this.hotelFor(userId, body.hotelId);
    const businessDate = this.businessDate(hotel, body.businessDate);
    try {
      return await serializable(this.p, async (tx) => {
        const existing = await tx.hotelBusinessDay.findUnique({ where: { hotelId_businessDate: { hotelId: hotel.id, businessDate } }, include: { closedBy: { select: { id: true, name: true } } } });
        if (existing?.status === HotelBusinessDayStatus.CLOSED) return this.result(hotel, businessDate, { summary: existing.summary, blockers: [], warnings: (existing.exceptions as any)?.warnings ?? [] }, existing);
        const calculated = await this.calculate(tx, hotel, businessDate);
        if (calculated.blockers.length) throw new ConflictException({ code: 'NIGHT_AUDIT_BLOCKED', message: 'Night Audit cannot close while blockers remain.', businessDate: toDateOnly(businessDate), blockers: calculated.blockers, warnings: calculated.warnings, summary: calculated.summary });
        const closedAt = new Date();
        const day = await tx.hotelBusinessDay.create({ data: { hotelId: hotel.id, businessDate, status: HotelBusinessDayStatus.CLOSED, closedAt, closedById: userId, summary: calculated.summary as Prisma.InputJsonValue, exceptions: { blockers: [], warnings: calculated.warnings } as Prisma.InputJsonValue }, include: { closedBy: { select: { id: true, name: true } } } });
        await tx.auditLog.create({ data: { actorUserId: userId, action: 'NIGHT_AUDIT_CLOSED', entityType: 'HotelBusinessDay', entityId: day.id, after: { hotelId: hotel.id, businessDate: toDateOnly(businessDate), blockerCount: 0, warningCount: calculated.warnings.length, summary: calculated.summary } } });
        return this.result(hotel, businessDate, calculated, day);
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        const existing = await this.p.hotelBusinessDay.findUnique({ where: { hotelId_businessDate: { hotelId: hotel.id, businessDate } }, include: { closedBy: { select: { id: true, name: true } } } });
        if (existing?.status === HotelBusinessDayStatus.CLOSED) return this.result(hotel, businessDate, { summary: existing.summary, blockers: [], warnings: (existing.exceptions as any)?.warnings ?? [] }, existing);
      }
      throw error;
    }
  }
}

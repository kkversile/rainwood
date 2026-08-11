import { Injectable } from '@nestjs/common';
import { BookingSource, Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { addDays, parseDateOnly, todayUtc } from '../../common/dates';
import { ReportQueryDto } from './reports.dto';

@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}

  async dashboard() {
    const [bookings, pendingSync, pendingPayments, revenue, arrivals, failedJobs] = await Promise.all([
      this.prisma.reservation.count({ where: { status: { not: 'CANCELLED' } } }),
      this.prisma.reservation.count({ where: { syncStatus: { in: ['PENDING', 'RETRY', 'FAILED', 'MANUAL_ACTION_REQUIRED', 'DEAD_LETTER'] } } }),
      this.prisma.reservation.aggregate({ _sum: { balanceAmount: true }, where: { balanceAmount: { gt: 0 }, status: { not: 'CANCELLED' } } }),
      this.prisma.reservation.aggregate({ _sum: { totalAmount: true }, where: { status: { in: ['CONFIRMED', 'COMPLETED', 'MODIFIED'] } } }),
      this.prisma.reservation.count({ where: { status: 'CONFIRMED', checkIn: todayUtc() } }),
      this.prisma.outboxJob.count({ where: { status: { in: ['FAILED', 'DEAD_LETTER'] } } }),
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

  async expectedArrivals(query: ReportQueryDto) {
    const from = query.from ? parseDateOnly(query.from, 'from') : todayUtc();
    const to = query.to ? parseDateOnly(query.to, 'to') : addDays(from, 1);
    const rows = await this.prisma.reservation.findMany({ where: { ...this.where({ ...query, from: undefined, to: undefined }), checkIn: { gte: from, lt: to } }, include: { hotel: true, lines: { include: { roomType: true } }, payments: true }, orderBy: [{ checkIn: 'asc' }, { hotel: { name: 'asc' } }], take: 10000 });
    return { items: rows.flatMap((reservation) => reservation.lines.map((line) => ({ hotel: reservation.hotel.name, reference: reservation.reference, guestName: reservation.guestName, departure: reservation.checkOut.toISOString().slice(0, 10), roomType: line.roomType.name, confirmed: ['CONFIRMED', 'COMPLETED'].includes(reservation.status), pax: line.adults + line.children, source: reservation.sourceName || reservation.source, advance: Number(reservation.advanceAmount), paymentMode: reservation.payments[0]?.mode ?? null, instruction: reservation.specialRequest || reservation.billingInstruction || '', mobile: reservation.mobile, amount: Number(reservation.totalAmount), balance: Number(reservation.balanceAmount), reconfirmed: reservation.status === 'CONFIRMED' }))) };
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
    return { hotelId: query.hotelId, source: query.source as BookingSource | undefined, status: query.status as ReservationStatus | undefined, checkIn: query.from || query.to ? { gte: query.from ? parseDateOnly(query.from, 'from') : undefined, lt: query.to ? parseDateOnly(query.to, 'to') : undefined } : undefined };
  }

  private dateReport(query: ReportQueryDto, field: 'checkIn' | 'checkOut') {
    const from = query.from ? parseDateOnly(query.from, 'from') : todayUtc();
    const to = query.to ? parseDateOnly(query.to, 'to') : addDays(from, 1);
    const where: any = { ...this.where({ ...query, from: undefined, to: undefined }), [field]: { gte: from, lt: to } };
    return this.prisma.reservation.findMany({ where, include: { hotel: true, lines: { include: { roomType: true } }, payments: true }, orderBy: { [field]: 'asc' } });
  }
}

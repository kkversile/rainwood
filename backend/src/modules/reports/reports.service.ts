import { Injectable } from '@nestjs/common';
import { BookingSource, Prisma, ReservationStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { addDays, parseDateOnly, todayUtc } from '../../common/dates';
import { ReportQueryDto } from './reports.dto';

function flag(value: unknown) {
  return value === true || ['true', '1', 'yes', 'on'].includes(String(value ?? '').toLowerCase());
}

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

  async expectedArrivals(query: ReportQueryDto, user?: { role?: string }) {
    const from = query.from ? parseDateOnly(query.from, 'from') : todayUtc();
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
    const [reservations, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        select: {
          id: true, reference: true, hotel: { select: { id: true, name: true } }, guestName: true, checkIn: true, checkOut: true,
          source: true, sourceName: true, status: true, paymentStatus: true, totalAmount: true, advanceAmount: true, balanceAmount: true,
          mobile: true, gstin: true, specialRequest: true, billingInstruction: true, internalRemark: true,
          createdBy: { select: { id: true, name: true } }, reconfirmedAt: true, reconfirmedBy: { select: { id: true, name: true } },
          lines: { select: { rooms: true, adults: true, children: true, roomType: { select: { id: true, name: true } } } },
          payments: { select: { mode: true, verified: true, paidAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
        },
        orderBy: [{ checkIn: 'asc' }, { hotel: { name: 'asc' } }, { reference: 'asc' }],
        take: 5000,
      }),
      this.prisma.reservation.count({ where }),
    ]);
    const waitlist = includeWaitlist ? await this.prisma.waitlistEntry.findMany({
      where: { hotelId: hotelIds?.length ? { in: hotelIds } : undefined, checkIn: { gte: from, lt: to }, status: 'WAITING' },
      select: { id: true, hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } }, guestName: true, checkIn: true, checkOut: true, rooms: true, status: true },
      orderBy: [{ checkIn: 'asc' }, { hotel: { name: 'asc' } }, { createdAt: 'asc' }],
      take: 5000,
    }) : [];
    const canSeeInternalRemarks = ['SUPER_ADMIN', 'ADMIN', 'RESERVATION'].includes(user?.role ?? '');
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
      confirmed: false, amount: 0, roomType: entry.roomType ? `${entry.roomType.name} × ${entry.rooms}` : 'Any room type',
    }));
    const items = [...reservationItems, ...waitlistItems].sort((a, b) => String(a.arrival).localeCompare(String(b.arrival)) || a.hotel.name.localeCompare(b.hotel.name) || a.reference.localeCompare(b.reference));
    const page = Math.max(1, Number(query.page)); const limit = Math.min(200, Math.max(1, Number(query.limit)));
    const reservationSummary = reservationItems.reduce((summary, row) => ({ reservations: summary.reservations + 1, rooms: summary.rooms + row.rooms, adults: summary.adults + row.adults, children: summary.children + row.children, pax: summary.pax + row.pax, totalAmount: summary.totalAmount + row.totalAmount, advance: summary.advance + row.advance, balance: summary.balance + row.balance }), { reservations: 0, rooms: 0, adults: 0, children: 0, pax: 0, totalAmount: 0, advance: 0, balance: 0 });
    return { items: items.slice((page - 1) * limit, page * limit), summary: { ...reservationSummary, waitlist: waitlistItems.length }, pagination: { page, limit, total: total + waitlistItems.length, pages: Math.ceil((total + waitlistItems.length) / limit) }, filters: { from: query.from ?? dateValue(from), to: query.to ?? dateValue(addDays(to, -1)), hotelIds: hotelIds ?? [], statuses, sources: query.sources ?? (query.source ? [query.source] : []), includeWaitlist, reconfirmedOnly } };
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

  private dateReport(query: ReportQueryDto, field: 'checkIn' | 'checkOut') {
    const from = query.from ? parseDateOnly(query.from, 'from') : todayUtc();
    const to = query.to ? parseDateOnly(query.to, 'to') : addDays(from, 1);
    const where: any = { ...this.where({ ...query, from: undefined, to: undefined }), [field]: { gte: from, lt: to } };
    return this.prisma.reservation.findMany({ where, include: { hotel: true, lines: { include: { roomType: true } }, payments: true }, orderBy: { [field]: 'asc' } });
  }
}

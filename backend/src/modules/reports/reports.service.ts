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

import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CashierShiftStatus, PaymentMode, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { getHotelBusinessDayUtcRange, getHotelOperationalDate } from '../../common/hotel-dates';
import { parseDateOnly, toDateOnly } from '../../common/dates';
import { PrismaService } from '../../common/prisma.service';
import { nextDocumentNumber } from '../../common/document-sequences';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { CashierShiftQueryDto, CloseCashierShiftDto, OpenCashierShiftDto } from './cashier-shifts.dto';

const OPEN_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.RESERVATION];
const READ_ROLES: UserRole[] = [...OPEN_ROLES, UserRole.ACCOUNTS];
const round = (value: number) => Math.round(value * 100) / 100;
const amount = (value: unknown) => round(Number(value ?? 0));

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CashierShiftsService {
  constructor(private readonly p: PrismaService, private readonly audit: AuditService) {}

  private async actor(userId: string, allowed: UserRole[]) {
    const scope = await getActorScope(this.p, userId);
    if (!allowed.includes(scope.role)) throw new ForbiddenException('This account cannot access cashier shifts.');
    // Accounts are organization-wide read-only users in the current role model.
    return scope.role === UserRole.ACCOUNTS ? { ...scope, isGlobal: true } : scope;
  }

  private async hotelFor(db: Db, scope: any, requestedHotelId?: string) {
    const hotelId = resolveRequestedHotel(scope, requestedHotelId);
    if (!hotelId) throw new BadRequestException('hotelId is required.');
    const hotel = await db.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, timezoneName: true, active: true } });
    if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private businessDate(hotel: { timezoneName: string }, requested?: string) {
    return requested ? parseDateOnly(requested, 'businessDate') : getHotelOperationalDate(hotel.timezoneName);
  }

  private async totals(db: Db, shiftId: string) {
    // Cashier totals represent payments recorded against the drawer, including
    // pending manual payments. Verification is a separate payment workflow;
    // changing this filter would alter the existing cashier business meaning.
    const rows = await db.payment.findMany({ where: { cashierShiftId: shiftId }, select: { amount: true, mode: true } });
    const byMode: Record<string, number> = { CASH: 0, UPI: 0, CARD: 0, BANK_TRANSFER: 0, GATEWAY: 0, WALLET: 0, COMPANY_CREDIT: 0, CHEQUE: 0, OTHER: 0 };
    for (const row of rows) byMode[row.mode] = round((byMode[row.mode] ?? 0) + amount(row.amount));
    const total = round(Object.values(byMode).reduce((sum, value) => sum + value, 0));
    const cash = byMode.CASH;
    return { byMode, cash, total };
  }

  private view(shift: any, totals: any) {
    const snapshot = shift.paymentTotalsSnapshot as any;
    const paymentTotals = shift.status === CashierShiftStatus.CLOSED && snapshot ? snapshot : totals;
    return { ...shift, openingCash: amount(shift.openingCash), expectedCash: shift.expectedCash == null ? round(amount(shift.openingCash) + amount(paymentTotals.cash)) : amount(shift.expectedCash), actualCash: shift.actualCash == null ? null : amount(shift.actualCash), cashVariance: shift.cashVariance == null ? null : amount(shift.cashVariance), businessDate: toDateOnly(shift.businessDate), paymentTotals };
  }

  async findOpenForHotel(db: Db, hotelId: string) {
    return db.cashierShift.findFirst({ where: { hotelId, status: CashierShiftStatus.OPEN }, orderBy: { openedAt: 'desc' } });
  }

  async open(userId: string, body: OpenCashierShiftDto) {
    const scope = await this.actor(userId, OPEN_ROLES);
    const hotel = await this.hotelFor(this.p, scope, body.hotelId);
    const businessDate = this.businessDate(hotel);
    try {
      return await this.p.$transaction(async (tx) => {
        const existing = await this.findOpenForHotel(tx, hotel.id);
        if (existing) throw new ConflictException(`Cashier shift ${existing.shiftNo} is already open for this hotel.`);
        const shiftNo = await nextDocumentNumber(tx, hotel.id, 'CASHIER_SHIFT', businessDate.getUTCFullYear(), 'CSH');
        const shift = await tx.cashierShift.create({ data: { hotelId: hotel.id, shiftNo, openedById: userId, openingCash: round(body.openingCash), businessDate, status: CashierShiftStatus.OPEN } });
        await tx.auditLog.create({ data: { actorUserId: userId, action: 'CASHIER_SHIFT_OPENED', entityType: 'CashierShift', entityId: shift.id, after: { hotelId: hotel.id, businessDate: toDateOnly(businessDate), shiftNo, openingCash: round(body.openingCash), openingNote: body.openingNote?.trim() || null } } });
        return this.view({ ...shift, openedBy: { id: userId } }, { byMode: {}, cash: 0, total: 0 });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('An open cashier shift already exists for this hotel.');
      throw error;
    }
  }

  async current(userId: string, hotelId?: string) {
    const scope = await this.actor(userId, READ_ROLES);
    const hotel = await this.hotelFor(this.p, scope, hotelId);
    const shift = await this.findOpenForHotel(this.p, hotel.id);
    if (!shift) return { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, shift: null };
    return { hotel: { id: hotel.id, name: hotel.name, timezoneName: hotel.timezoneName }, shift: this.view(shift, await this.totals(this.p, shift.id)) };
  }

  async close(userId: string, id: string, body: CloseCashierShiftDto) {
    const scope = await this.actor(userId, OPEN_ROLES);
    return this.p.$transaction(async (tx) => {
      const shift = await tx.cashierShift.findUnique({ where: { id }, include: { hotel: { select: { id: true, name: true, timezoneName: true } } } });
      if (!shift || (!scope.isGlobal && shift.hotelId !== scope.hotelId)) throw new NotFoundException('Cashier shift not found.');
      if (shift.status !== CashierShiftStatus.OPEN) throw new ConflictException('This cashier shift is already closed.');
      const totals = await this.totals(tx, shift.id);
      const expectedCash = round(amount(shift.openingCash) + totals.cash);
      const cashVariance = round(body.actualCash - expectedCash);
      if (Math.abs(cashVariance) > 0.005 && !body.closingNote?.trim()) throw new BadRequestException('A closing note is required when actual cash does not balance.');
      const closedAt = new Date();
      const updated = await tx.cashierShift.update({ where: { id }, data: { status: CashierShiftStatus.CLOSED, closedById: userId, closedAt, expectedCash, actualCash: round(body.actualCash), cashVariance, closingNote: body.closingNote?.trim() || null, paymentTotalsSnapshot: totals as Prisma.InputJsonValue }, include: { openedBy: { select: { id: true, name: true } }, closedBy: { select: { id: true, name: true } }, hotel: { select: { id: true, name: true, timezoneName: true } } } });
      await tx.auditLog.create({ data: { actorUserId: userId, action: 'CASHIER_SHIFT_CLOSED', entityType: 'CashierShift', entityId: id, after: { hotelId: shift.hotelId, businessDate: toDateOnly(shift.businessDate), shiftNo: shift.shiftNo, expectedCash, actualCash: round(body.actualCash), variance: cashVariance } } });
      return this.view(updated, totals);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  }

  async list(userId: string, query: CashierShiftQueryDto) {
    const scope = await this.actor(userId, READ_ROLES);
    const hotelId = resolveRequestedHotel(scope, query.hotelId);
    const rows = await this.p.cashierShift.findMany({ where: { hotelId: hotelId ?? undefined, openedById: query.cashierId, businessDate: query.from || query.to ? { gte: query.from ? parseDateOnly(query.from, 'from') : undefined, lte: query.to ? parseDateOnly(query.to, 'to') : undefined } : undefined }, include: { hotel: { select: { id: true, name: true, timezoneName: true } }, openedBy: { select: { id: true, name: true } }, closedBy: { select: { id: true, name: true } } }, orderBy: { openedAt: 'desc' } });
    return Promise.all(rows.map(async (row) => {
      const snapshot = row.status === CashierShiftStatus.CLOSED && row.paymentTotalsSnapshot;
      return this.view(row, snapshot || await this.totals(this.p, row.id));
    }));
  }
}

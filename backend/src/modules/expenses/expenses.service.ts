import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentSequenceType, ExpenseStatus, PaymentMode, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { getActorScope, resolveRequestedHotel, ActorScope } from '../../common/role-scope';
import { ExpenseCategoryDto, ExpenseCreateDto, ExpenseListQueryDto, ExpenseUpdateDto, VendorDto } from './expenses.dto';
import { nextDocumentNumber } from '../../common/document-sequences';

const ACCESS: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.ACCOUNTS];
const MANAGEMENT: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN];
const money = (value: unknown) => Number(value ?? 0);
const totalFor = (amount: number, taxAmount?: number | null) => Number((amount + (taxAmount ?? 0)).toFixed(2));

@Injectable()
export class ExpensesService {
  constructor(private readonly p: PrismaService, private readonly audit: AuditService) {}

  private async scope(userId: string) {
    const scope = await getActorScope(this.p, userId);
    if (!ACCESS.includes(scope.role)) throw new ForbiddenException('Expense access is not available to this account.');
    return scope;
  }

  private async managementScope(userId: string) {
    const scope = await this.scope(userId);
    if (!MANAGEMENT.includes(scope.role)) throw new ForbiddenException('Management permission is required.');
    return scope;
  }

  private effectiveHotel(scope: ActorScope, hotelId?: string) {
    return resolveRequestedHotel(scope, hotelId);
  }

  private async assertHotel(scope: ActorScope, hotelId: string) {
    const effective = this.effectiveHotel(scope, hotelId);
    if (effective !== hotelId) throw new ForbiddenException('You cannot access another hotel.');
    const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, active: true } });
    if (!hotel?.active) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private async validateReferences(hotelId: string, categoryId: string, vendorId?: string) {
    const category = await this.p.expenseCategory.findUnique({ where: { id: categoryId } });
    if (!category || (category.hotelId !== null && category.hotelId !== hotelId)) throw new BadRequestException('Category is not available for this hotel.');
    if (vendorId) {
      const vendor = await this.p.vendor.findUnique({ where: { id: vendorId } });
      if (!vendor || (vendor.hotelId !== null && vendor.hotelId !== hotelId)) throw new BadRequestException('Vendor is not available for this hotel.');
    }
  }

  private view(row: any) {
    return { ...row, amount: money(row.amount), taxableAmount: row.taxableAmount === null ? null : money(row.taxableAmount), taxAmount: row.taxAmount === null ? null : money(row.taxAmount), totalAmount: money(row.totalAmount), category: row.category ? { id: row.category.id, name: row.category.name, code: row.category.code } : null, vendor: row.vendor ? { id: row.vendor.id, name: row.vendor.name } : null, hotel: row.hotel ? { id: row.hotel.id, name: row.hotel.name } : null, createdBy: row.createdBy ? { id: row.createdBy.id, name: row.createdBy.name } : null, approvedBy: row.approvedBy ? { id: row.approvedBy.id, name: row.approvedBy.name } : null };
  }

  private include = { hotel: { select: { id: true, name: true } }, category: { select: { id: true, name: true, code: true } }, vendor: { select: { id: true, name: true } }, createdBy: { select: { id: true, name: true } }, approvedBy: { select: { id: true, name: true } } } as const;

  async list(userId: string, query: ExpenseListQueryDto) {
    const scope = await this.scope(userId);
    const hotelId = this.effectiveHotel(scope, query.hotelId);
    const where: Prisma.ExpenseWhereInput = { hotelId: hotelId ?? undefined, categoryId: query.categoryId, vendorId: query.vendorId, status: query.status, paymentMode: query.paymentMode, expenseDate: query.from || query.to ? { gte: query.from ? new Date(query.from) : undefined, lte: query.to ? new Date(query.to) : undefined } : undefined };
    const rows = await this.p.expense.findMany({ where, orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }], include: this.include });
    const reportable = rows.filter((row) => row.status !== ExpenseStatus.CANCELLED);
    const totals = reportable.reduce((result, row) => { result.total += money(row.totalAmount); if (row.status === ExpenseStatus.APPROVED) result.approved += money(row.totalAmount); if (row.status === ExpenseStatus.PAID) result.paid += money(row.totalAmount); if (row.status === ExpenseStatus.SUBMITTED) result.pendingApproval += money(row.totalAmount); return result; }, { total: 0, approved: 0, paid: 0, pendingApproval: 0 });
    return { expenses: rows.map((row) => this.view(row)), totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Number(value.toFixed(2))])) };
  }

  async detail(userId: string, id: string) {
    const scope = await this.scope(userId); const row = await this.p.expense.findUnique({ where: { id }, include: this.include });
    if (!row || (scope.hotelId && row.hotelId !== scope.hotelId)) throw new NotFoundException('Expense not found.');
    return this.view(row);
  }

  async create(userId: string, body: ExpenseCreateDto) {
    const scope = await this.scope(userId); await this.assertHotel(scope, body.hotelId); await this.validateReferences(body.hotelId, body.categoryId, body.vendorId);
    // expenseDate is a date-only business field, so its ISO calendar year is
    // already the hotel's operational year; it must not depend on server UTC.
    const year = Number(body.expenseDate.slice(0, 4));
    const expenseNo = await nextDocumentNumber(this.p, body.hotelId, DocumentSequenceType.EXPENSE, year, 'EXP');
    const totalAmount = totalFor(body.amount, body.taxAmount);
    const row = await this.p.expense.create({ data: { hotelId: body.hotelId, expenseNo, expenseDate: new Date(body.expenseDate), categoryId: body.categoryId, vendorId: body.vendorId || null, description: body.description.trim(), amount: body.amount, taxableAmount: body.taxableAmount ?? null, taxAmount: body.taxAmount ?? null, totalAmount, paymentMode: body.paymentMode, paymentReference: body.paymentReference?.trim() || null, notes: body.notes?.trim() || null, createdById: userId }, include: this.include });
    await this.audit.log({ actorUserId: userId, action: 'EXPENSE_CREATED', entityType: 'Expense', entityId: row.id, after: { hotelId: row.hotelId, expenseNo: row.expenseNo, totalAmount: row.totalAmount } });
    return this.view(row);
  }

  async update(userId: string, id: string, body: ExpenseUpdateDto) {
    const scope = await this.scope(userId); const current = await this.p.expense.findUnique({ where: { id } });
    if (!current || (scope.hotelId && current.hotelId !== scope.hotelId)) throw new NotFoundException('Expense not found.');
    if (current.status !== ExpenseStatus.DRAFT) throw new ConflictException('Only draft expenses can be edited.');
    if (body.categoryId || body.vendorId) await this.validateReferences(current.hotelId, body.categoryId ?? current.categoryId, body.vendorId ?? current.vendorId ?? undefined);
    const effectiveAmount = body.amount ?? money(current.amount);
    const effectiveTax = body.taxAmount ?? money(current.taxAmount);
    const data: Prisma.ExpenseUpdateInput = { expenseDate: body.expenseDate ? new Date(body.expenseDate) : undefined, category: body.categoryId ? { connect: { id: body.categoryId } } : undefined, vendor: body.vendorId === undefined ? undefined : body.vendorId ? { connect: { id: body.vendorId } } : { disconnect: true }, description: body.description?.trim(), amount: body.amount, taxableAmount: body.taxableAmount, taxAmount: body.taxAmount, totalAmount: totalFor(effectiveAmount, effectiveTax), paymentMode: body.paymentMode, paymentReference: body.paymentReference?.trim(), notes: body.notes?.trim() };
    const row = await this.p.expense.update({ where: { id }, data, include: this.include }); await this.audit.log({ actorUserId: userId, action: 'EXPENSE_UPDATED', entityType: 'Expense', entityId: id, after: { fields: Object.keys(body) } }); return this.view(row);
  }

  private async transition(userId: string, id: string, next: ExpenseStatus) {
    const scope = await this.scope(userId); const current = await this.p.expense.findUnique({ where: { id } });
    if (!current || (scope.hotelId && current.hotelId !== scope.hotelId)) throw new NotFoundException('Expense not found.');
    const allowed: Record<ExpenseStatus, ExpenseStatus[]> = { DRAFT: [ExpenseStatus.SUBMITTED, ExpenseStatus.CANCELLED], SUBMITTED: [ExpenseStatus.APPROVED, ExpenseStatus.CANCELLED], APPROVED: [ExpenseStatus.PAID, ExpenseStatus.CANCELLED], PAID: [], CANCELLED: [] };
    if (!allowed[current.status].includes(next)) throw new ConflictException(`Expense cannot move from ${current.status} to ${next}.`);
    if (next === ExpenseStatus.APPROVED || next === ExpenseStatus.CANCELLED && current.status === ExpenseStatus.APPROVED) { if (!MANAGEMENT.includes(scope.role)) throw new ForbiddenException('Management permission is required.'); }
    if (next === ExpenseStatus.PAID && !ACCESS.includes(scope.role)) throw new ForbiddenException('Accounts permission is required.');
    const action = `EXPENSE_${next}`; const row = await this.p.expense.update({ where: { id }, data: { status: next, ...(next === ExpenseStatus.APPROVED ? { approvedById: userId, approvedAt: new Date() } : {}) }, include: this.include }); await this.audit.log({ actorUserId: userId, action, entityType: 'Expense', entityId: id, before: { status: current.status }, after: { status: next } }); return this.view(row);
  }

  submit(userId: string, id: string) { return this.transition(userId, id, ExpenseStatus.SUBMITTED); }
  approve(userId: string, id: string) { return this.transition(userId, id, ExpenseStatus.APPROVED); }
  markPaid(userId: string, id: string) { return this.transition(userId, id, ExpenseStatus.PAID); }
  cancel(userId: string, id: string) { return this.transition(userId, id, ExpenseStatus.CANCELLED); }

  async categories(userId: string, hotelId?: string) { const scope = await this.scope(userId); const effective = this.effectiveHotel(scope, hotelId); return this.p.expenseCategory.findMany({ where: { active: true, OR: [{ hotelId: null }, { hotelId: effective ?? undefined }] }, orderBy: [{ hotelId: 'asc' }, { name: 'asc' }] }); }
  async createCategory(userId: string, body: ExpenseCategoryDto) { const scope = await this.managementScope(userId); const hotelId = body.hotelId ?? null; if (hotelId) await this.assertHotel(scope, hotelId); const row = await this.p.expenseCategory.create({ data: { name: body.name.trim(), code: body.code?.trim() || null, description: body.description?.trim() || null, hotelId, active: body.active ?? true } }); return row; }
  async updateCategory(userId: string, id: string, body: ExpenseCategoryDto) { const scope = await this.managementScope(userId); const current = await this.p.expenseCategory.findUnique({ where: { id } }); if (!current || (current.hotelId && scope.hotelId !== null && current.hotelId !== scope.hotelId)) throw new NotFoundException('Category not found.'); return this.p.expenseCategory.update({ where: { id }, data: { name: body.name?.trim(), code: body.code?.trim(), description: body.description?.trim(), active: body.active } }); }
  async vendors(userId: string, hotelId?: string) { const scope = await this.scope(userId); const effective = this.effectiveHotel(scope, hotelId); return this.p.vendor.findMany({ where: { active: true, OR: [{ hotelId: null }, { hotelId: effective ?? undefined }] }, orderBy: { name: 'asc' } }); }
  async createVendor(userId: string, body: VendorDto) { const scope = await this.managementScope(userId); const hotelId = body.hotelId ?? null; if (hotelId) await this.assertHotel(scope, hotelId); return this.p.vendor.create({ data: { hotelId, name: body.name.trim(), legalName: body.legalName?.trim(), gstin: body.gstin?.trim(), pan: body.pan?.trim(), email: body.email?.trim(), mobile: body.mobile?.trim(), address: body.address?.trim(), paymentTermsDays: body.paymentTermsDays, active: body.active ?? true } }); }
  async updateVendor(userId: string, id: string, body: VendorDto) { const scope = await this.managementScope(userId); const current = await this.p.vendor.findUnique({ where: { id } }); if (!current || (current.hotelId && scope.hotelId !== null && current.hotelId !== scope.hotelId)) throw new NotFoundException('Vendor not found.'); return this.p.vendor.update({ where: { id }, data: { name: body.name?.trim(), legalName: body.legalName?.trim(), gstin: body.gstin?.trim(), pan: body.pan?.trim(), email: body.email?.trim(), mobile: body.mobile?.trim(), address: body.address?.trim(), paymentTermsDays: body.paymentTermsDays, active: body.active } }); }
  async report(userId: string, query: ExpenseListQueryDto) { const result = await this.list(userId, query); const reportable = result.expenses.filter((row: any) => row.status !== ExpenseStatus.CANCELLED); const grouped = (key: (row: any) => string) => reportable.reduce((map: Record<string, number>, row: any) => { const name = key(row); map[name] = Number(((map[name] ?? 0) + row.totalAmount).toFixed(2)); return map; }, {}); return { ...result.totals, byCategory: grouped((row) => row.category?.name ?? 'Uncategorised'), byVendor: grouped((row) => row.vendor?.name ?? 'Direct'), byHotel: grouped((row) => row.hotel?.name ?? 'Unknown'), byPaymentMode: grouped((row) => row.paymentMode) }; }
}

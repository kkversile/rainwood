import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ExpenseStatus, UserRole } from '@prisma/client';
import { ExpensesService } from './expenses.service';

const actor = (role: UserRole = UserRole.ADMIN, hotelId: string | null = 'hotel-a') => ({ id: 'user-1', role, staffHotelId: hotelId, staffDepartment: null, staffHotel: { id: hotelId, active: true } });

describe('ExpensesService', () => {
  const p: any = { user: { findUnique: jest.fn() }, hotel: { findUnique: jest.fn() }, documentSequence: { upsert: jest.fn() }, expenseCategory: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() }, vendor: { findUnique: jest.fn(), findMany: jest.fn(), create: jest.fn(), update: jest.fn() }, expense: { count: jest.fn(), create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() } };
  const audit = { log: jest.fn() } as any;
  let service: ExpensesService;

  beforeEach(() => { jest.clearAllMocks(); service = new ExpensesService(p, audit); p.user.findUnique.mockResolvedValue(actor()); p.hotel.findUnique.mockResolvedValue({ id: 'hotel-a', name: 'A', active: true }); p.documentSequence.upsert.mockResolvedValue({ lastNumber: 1 }); p.expenseCategory.findUnique.mockResolvedValue({ id: 'cat', hotelId: null }); p.vendor.findUnique.mockResolvedValue({ id: 'vendor', hotelId: null }); p.expense.count.mockResolvedValue(0); p.expense.create.mockImplementation(async ({ data }: any) => ({ ...data, id: 'expense-1', category: { id: 'cat', name: 'Maintenance', code: 'MAINTENANCE' }, vendor: null, hotel: { id: 'hotel-a', name: 'A' }, createdBy: { id: 'user-1', name: 'Admin' }, approvedBy: null })); });

  it('creates a hotel-scoped draft with a human-readable number', async () => {
    const result = await service.create('user-1', { hotelId: 'hotel-a', expenseDate: '2026-09-30', categoryId: 'cat', description: 'Demo repair', amount: 100, taxAmount: 18, paymentMode: 'CASH' as any });
    expect(result.expenseNo).toBe('EXP-2026-000001'); expect(result.totalAmount).toBe(118); expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'EXPENSE_CREATED' }));
  });

  it('rejects an admin creating in another hotel', async () => { await expect(service.create('user-1', { hotelId: 'hotel-b', expenseDate: '2026-09-30', categoryId: 'cat', description: 'Nope', amount: 1, paymentMode: 'CASH' as any })).rejects.toBeInstanceOf(ForbiddenException); });

  it('allows corporate users to list multiple hotels', async () => { p.user.findUnique.mockResolvedValue(actor(UserRole.CORPORATE_ADMIN, null)); p.expense.findMany.mockResolvedValue([]); const result = await service.list('user-1', {}); expect(p.expense.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hotelId: undefined }) })); expect(result.expenses).toEqual([]); });

  it('enforces the draft to submitted to approved to paid lifecycle', async () => {
    const row: any = { id: 'expense-1', hotelId: 'hotel-a', status: ExpenseStatus.DRAFT, totalAmount: 10 }; p.expense.findUnique.mockResolvedValue(row); p.expense.update.mockImplementation(async ({ data }: any) => ({ ...row, ...data, category: null, vendor: null, hotel: null, createdBy: null, approvedBy: null }));
    await service.submit('user-1', row.id); expect(p.expense.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: ExpenseStatus.SUBMITTED } }));
    row.status = ExpenseStatus.SUBMITTED; await service.approve('user-1', row.id); expect(p.expense.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ExpenseStatus.APPROVED, approvedById: 'user-1' }) }));
    row.status = ExpenseStatus.APPROVED; await service.markPaid('user-1', row.id); expect(p.expense.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { status: ExpenseStatus.PAID } }));
  });

  it('rejects an illegal transition', async () => { p.expense.findUnique.mockResolvedValue({ id: 'expense-1', hotelId: 'hotel-a', status: ExpenseStatus.PAID }); await expect(service.cancel('user-1', 'expense-1')).rejects.toBeInstanceOf(ConflictException); });

  it('recalculates totals when only tax changes and ignores an inconsistent client total', async () => {
    p.expense.findUnique.mockResolvedValue({ id: 'expense-1', hotelId: 'hotel-a', status: ExpenseStatus.DRAFT, amount: 100, taxAmount: 10, categoryId: 'cat', vendorId: null });
    p.expense.update.mockImplementation(async ({ data }: any) => ({ id: 'expense-1', ...data, category: null, vendor: null, hotel: null, createdBy: null, approvedBy: null }));
    const result = await service.update('user-1', 'expense-1', { taxAmount: 25 });
    expect(result.totalAmount).toBe(125);
    expect(p.expense.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ totalAmount: 125 }) }));
  });

  it('requires management approval and excludes cancelled totals', async () => { p.user.findUnique.mockResolvedValue(actor(UserRole.ACCOUNTS)); p.expense.findMany.mockResolvedValue([{ id: 'a', totalAmount: 25, status: ExpenseStatus.CANCELLED, category: null, vendor: null, hotel: null, createdBy: null, approvedBy: null }]); const result = await service.list('user-1', {}); expect(result.totals.total).toBe(0); p.expense.findUnique.mockResolvedValue({ id: 'a', hotelId: 'hotel-a', status: ExpenseStatus.SUBMITTED }); await expect(service.approve('user-1', 'a')).rejects.toBeInstanceOf(ForbiddenException); });
});

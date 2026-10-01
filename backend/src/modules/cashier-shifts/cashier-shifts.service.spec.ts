import { BadRequestException, ConflictException } from '@nestjs/common';
import { CashierShiftStatus, UserRole } from '@prisma/client';
import { CashierShiftsService } from './cashier-shifts.service';

describe('CashierShiftsService', () => {
  const actor = { id: 'admin-1', role: UserRole.ADMIN, staffHotelId: 'hotel-a', staffHotel: { id: 'hotel-a', active: true }, staffDepartment: null };
  const hotel = { id: 'hotel-a', name: 'RainWood A', timezoneName: 'Asia/Kolkata', active: true };
  const make = () => {
    const p: any = {
      user: { findUnique: jest.fn().mockResolvedValue(actor) },
      hotel: { findUnique: jest.fn().mockResolvedValue(hotel) },
      cashierShift: { findFirst: jest.fn().mockResolvedValue(null), findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      documentSequence: { upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }) },
      auditLog: { create: jest.fn() },
      $transaction: jest.fn(async (work: any) => work(p)),
    };
    const service = new CashierShiftsService(p, { log: jest.fn() } as any);
    return { p, service };
  };

  it('opens one hotel-local, sequenced shift', async () => {
    const { p, service } = make();
    p.cashierShift.create.mockResolvedValue({ id: 'shift-1', hotelId: 'hotel-a', shiftNo: 'CSH-2026-000001', status: CashierShiftStatus.OPEN, businessDate: new Date('2026-10-01'), openingCash: 10000 });
    const result: any = await service.open('admin-1', { hotelId: 'hotel-a', openingCash: 10000 });
    expect(result.shiftNo).toBe('CSH-2026-000001');
    expect(p.documentSequence.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { hotelId_type_year: { hotelId: 'hotel-a', type: 'CASHIER_SHIFT', year: 2026 } } }));
    expect(p.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'CASHIER_SHIFT_OPENED' }) }));
  });

  it('rejects a duplicate open drawer', async () => {
    const { p, service } = make(); p.cashierShift.findFirst.mockResolvedValue({ shiftNo: 'CSH-2026-000001' });
    await expect(service.open('admin-1', { hotelId: 'hotel-a', openingCash: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('calculates and snapshots balanced cash on close', async () => {
    const { p, service } = make();
    p.cashierShift.findUnique.mockResolvedValue({ id: 'shift-1', hotelId: 'hotel-a', status: CashierShiftStatus.OPEN, shiftNo: 'CSH-2026-000001', businessDate: new Date('2026-10-01'), openingCash: 10000, hotel });
    p.payment.findMany.mockResolvedValue([{ amount: 34000, mode: 'CASH' }, { amount: 5000, mode: 'UPI' }, { amount: 2000, mode: 'CARD' }]);
    p.cashierShift.update.mockImplementation(async ({ data }: any) => ({ id: 'shift-1', ...data, status: CashierShiftStatus.CLOSED, hotel, openedBy: { id: 'admin-1', name: 'Admin' }, closedBy: { id: 'admin-1', name: 'Admin' }, businessDate: new Date('2026-10-01'), shiftNo: 'CSH-2026-000001' }));
    const result: any = await service.close('admin-1', 'shift-1', { actualCash: 44000 });
    expect(result.expectedCash).toBe(44000); expect(result.cashVariance).toBe(0); expect(result.paymentTotals.byMode.UPI).toBe(5000); expect(p.cashierShift.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: CashierShiftStatus.CLOSED, expectedCash: 44000, actualCash: 44000, cashVariance: 0 }) }));
  });

  it('requires a note for a short or over drawer', async () => {
    const { p, service } = make(); p.cashierShift.findUnique.mockResolvedValue({ id: 'shift-1', hotelId: 'hotel-a', status: CashierShiftStatus.OPEN, shiftNo: 'CSH-2026-000001', businessDate: new Date('2026-10-01'), openingCash: 10000, hotel }); p.payment.findMany.mockResolvedValue([]);
    await expect(service.close('admin-1', 'shift-1', { actualCash: 9999 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not reopen a closed shift', async () => {
    const { p, service } = make(); p.cashierShift.findUnique.mockResolvedValue({ id: 'shift-1', hotelId: 'hotel-a', status: CashierShiftStatus.CLOSED, hotel });
    await expect(service.close('admin-1', 'shift-1', { actualCash: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it('uses closed snapshots and queries live payments only for open history', async () => {
    const { p, service } = make();
    const closed = Array.from({ length: 20 }, (_, index) => ({ id: `closed-${index}`, hotelId: 'hotel-a', status: CashierShiftStatus.CLOSED, shiftNo: `CSH-2026-${String(index + 1).padStart(6, '0')}`, businessDate: new Date('2026-10-01'), openedAt: new Date('2026-10-01T01:00:00Z'), openingCash: 10000, expectedCash: 44000, actualCash: 44000, cashVariance: 0, paymentTotalsSnapshot: { byMode: { CASH: 34000, UPI: 5000, CARD: 2000 }, cash: 34000, total: 41000 }, hotel, openedBy: { name: 'Admin' }, closedBy: { name: 'Admin' } }));
    const open = { id: 'open-1', hotelId: 'hotel-a', status: CashierShiftStatus.OPEN, shiftNo: 'CSH-2026-000021', businessDate: new Date('2026-10-01'), openedAt: new Date('2026-10-01T02:00:00Z'), openingCash: 10000, paymentTotalsSnapshot: null, hotel, openedBy: { name: 'Admin' }, closedBy: null };
    p.cashierShift.findMany.mockResolvedValue([...closed, open]);
    p.payment.findMany.mockResolvedValue([{ amount: 100, mode: 'CASH' }]);
    const rows: any[] = await service.list('admin-1', { hotelId: 'hotel-a' });
    expect(rows).toHaveLength(21);
    expect(rows[0].paymentTotals.cash).toBe(34000);
    expect(rows[20].paymentTotals.cash).toBe(100);
    expect(p.payment.findMany).toHaveBeenCalledTimes(1);
  });

  it('keeps pending recorded payments in cashier totals by policy', async () => {
    const { p, service } = make();
    p.cashierShift.findUnique.mockResolvedValue({ id: 'shift-1', hotelId: 'hotel-a', status: CashierShiftStatus.OPEN, shiftNo: 'CSH-2026-000001', businessDate: new Date('2026-10-01'), openingCash: 0, hotel });
    p.payment.findMany.mockResolvedValue([{ amount: 100, mode: 'CASH', verified: false }]);
    p.cashierShift.update.mockImplementation(async ({ data }: any) => ({ id: 'shift-1', ...data, status: CashierShiftStatus.CLOSED, hotel, openedBy: { name: 'Admin' }, closedBy: { name: 'Admin' }, businessDate: new Date('2026-10-01'), shiftNo: 'CSH-2026-000001' }));
    const result: any = await service.close('admin-1', 'shift-1', { actualCash: 100 });
    expect(result.paymentTotals.cash).toBe(100);
  });
});

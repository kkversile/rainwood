import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentMode, UserRole } from '@prisma/client';
import { PaymentsService } from './payments.service';

describe('PaymentsService cashier shift attribution', () => {
  const make = (openShift: any) => {
    const tx: any = { payment: { create: jest.fn().mockResolvedValue({ id: 'payment-1', cashierShiftId: openShift?.id ?? null }) }, reservation: { update: jest.fn() } };
    const p: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'front-1', role: UserRole.RESERVATION, staffHotelId: 'hotel-a', staffHotel: { id: 'hotel-a', active: true }, staffDepartment: null }) }, reservation: { findUnique: jest.fn().mockResolvedValue({ id: 'reservation-1', hotelId: 'hotel-a', balanceAmount: 5000 }) }, $transaction: jest.fn(async (work: any) => work(tx)) };
    const service = new PaymentsService(p, new ConfigService(), { log: jest.fn() } as any, { findOpenForHotel: jest.fn().mockResolvedValue(openShift) } as any);
    return { p, tx, service };
  };

  it('requires an open shift for cash', async () => { const { service } = make(null); await expect(service.manual('RW-1', { amount: 100, mode: PaymentMode.CASH }, 'front-1')).rejects.toBeInstanceOf(BadRequestException); });
  it('links cash and non-cash manual payments to the current open shift', async () => { const { tx, service } = make({ id: 'shift-1' }); await service.manual('RW-1', { amount: 100, mode: PaymentMode.CASH }, 'front-1'); expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cashierShiftId: 'shift-1', mode: PaymentMode.CASH }) })); });
  it('does not attach a non-cash payment after the shift is closed', async () => { const { tx, service } = make(null); await service.manual('RW-1', { amount: 100, mode: PaymentMode.CARD }, 'front-1'); expect(tx.payment.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cashierShiftId: undefined, mode: PaymentMode.CARD }) })); });
});

import { ReservationsService } from './reservations.service';
import { CreateReservationDto } from './reservations.dto';

describe('offline agent hold replay', () => {
  const body: CreateReservationDto = { guestName: 'Demo Guest', email: 'demo@rainwood.demo', mobile: '0000000088', source: 'AGENT', offlinePayment: true };
  function setup() {
    const booking = { id: 'reservation-1', reference: 'RW-1', createdById: 'agent-1', source: 'AGENT', ...body, status: 'PENDING_PAYMENT' };
    const hold = { id: 'hold-1', hotelId: 'hotel-1', agentId: 'agent-1', status: 'CONVERTED', convertedReservationId: booking.id, lines: [] };
    const tx: any = { inventoryHold: { findUnique: jest.fn().mockResolvedValue(hold), updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, reservation: { findUniqueOrThrow: jest.fn().mockResolvedValue(booking), create: jest.fn() } };
    const p: any = { inventoryHold: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-1' }) }, $transaction: jest.fn((work) => work(tx)) };
    const holds: any = { lockInventoryForLines: jest.fn() };
    return { service: new ReservationsService(p, holds, {} as any, {} as any), tx, holds, booking };
  }
  it('returns the existing owned booking without consuming inventory twice', async () => {
    const { service, tx, holds, booking } = setup();
    expect(await service.createFromHold('token', body, { id: 'agent-1', role: 'AGENT' })).toEqual(booking);
    expect(holds.lockInventoryForLines).not.toHaveBeenCalled(); expect(tx.reservation.create).not.toHaveBeenCalled();
  });
  it.each([{ guestName: 'Changed Guest' }, { email: 'other@rainwood.demo' }, { address: 'different' }, { source: 'WEBSITE' }])('rejects changed guest or booking details', async (patch) => {
    const { service, tx } = setup(); await expect(service.createFromHold('token', { ...body, ...patch } as CreateReservationDto, { id: 'agent-1', role: 'AGENT' })).rejects.toThrow('different booking'); expect(tx.reservation.create).not.toHaveBeenCalled();
  });
  it('does not replay another agent hold', async () => {
    const { service } = setup(); await expect(service.createFromHold('token', body, { id: 'agent-2', role: 'AGENT' })).rejects.toThrow('another agent');
  });
});

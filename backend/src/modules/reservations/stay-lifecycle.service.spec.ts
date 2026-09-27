import { BadRequestException, ConflictException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

const today = new Date(); today.setUTCHours(0, 0, 0, 0);
const checkout = new Date(today); checkout.setUTCDate(checkout.getUTCDate() + 3);

function serviceSetup() {
  const reservation = { id: 'reservation-1', reference: 'RW-ARRIVAL-001', hotelId: 'hotel-1', hotel: { id: 'hotel-1', name: 'RainWood Demo' }, status: 'CONFIRMED', stayStatus: 'EXPECTED', checkIn: today, checkOut: checkout, lines: [{ id: 'line-1', rooms: 1, roomTypeId: 'type-1', roomType: { id: 'type-1', name: 'Deluxe' } }], roomAssignments: [] };
  const room = { id: 'room-203', hotelId: 'hotel-1', roomTypeId: 'type-1', roomNumber: '203', floor: '2', wing: null, status: 'AVAILABLE', active: true, assignments: [] };
  const updated = { reference: reservation.reference, stayStatus: 'CHECKED_IN', checkedInAt: new Date(), checkedInBy: { id: 'admin-1', name: 'Front Desk' }, roomAssignments: [{ room }] };
  const tx: any = {
    reservation: { findUnique: jest.fn().mockResolvedValue(reservation), update: jest.fn().mockResolvedValue(updated) },
    room: { findMany: jest.fn().mockResolvedValue([room]), update: jest.fn().mockResolvedValue(room), findUnique: jest.fn() },
    reservationRoomAssignment: { create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = { ...tx, $transaction: jest.fn(async (fn: any) => fn(tx)), room: { findMany: jest.fn().mockResolvedValue([room]) }, reservation: { findUnique: jest.fn().mockResolvedValue({ ...reservation, roomAssignments: [] }) } };
  return { service: new ReservationsService(prisma, {} as any, {} as any, {} as any), prisma, tx, reservation, room };
}

describe('stay lifecycle operations', () => {
  it('returns only matching available physical rooms', async () => {
    const { service, prisma } = serviceSetup();
    await expect(service.availableRooms('RW-ARRIVAL-001')).resolves.toEqual(expect.objectContaining({ requirements: [expect.objectContaining({ availableRooms: [expect.objectContaining({ roomNumber: '203' })] })] }));
    expect(prisma.room.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hotelId: 'hotel-1', roomTypeId: 'type-1', status: 'AVAILABLE' }) }));
  });

  it('checks in atomically, assigns the room, updates occupancy, and audits', async () => {
    const { service, tx } = serviceSetup();
    await expect(service.checkIn('RW-ARRIVAL-001', { assignments: [{ reservationLineId: 'line-1', roomId: 'room-203' }] }, { id: 'admin-1', role: 'ADMIN' })).resolves.toEqual(expect.objectContaining({ stayStatus: 'CHECKED_IN' }));
    expect(tx.reservationRoomAssignment.create).toHaveBeenCalled();
    expect(tx.room.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'room-203' }, data: { status: 'OCCUPIED' } }));
    expect(tx.auditLog.create).toHaveBeenCalledTimes(2);
  });

  it('rejects incomplete assignment selection and non-operational checkout', async () => {
    const setup = serviceSetup();
    await expect(setup.service.checkIn('RW-ARRIVAL-001', { assignments: [] }, { id: 'admin-1', role: 'ADMIN' })).rejects.toBeInstanceOf(BadRequestException);
    setup.tx.reservation.findUnique.mockResolvedValue({ ...setup.reservation, stayStatus: 'EXPECTED' });
    await expect(setup.service.checkOut('RW-ARRIVAL-001', {}, { id: 'admin-1', role: 'ADMIN' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires explicit checkout override when money remains outstanding', async () => {
    const { service, tx, reservation } = serviceSetup();
    tx.reservation.findUnique.mockResolvedValue({ ...reservation, stayStatus: 'CHECKED_IN', balanceAmount: 2500, folioCharges: [] });
    await expect(service.checkOut('RW-ARRIVAL-001', {}, { id: 'admin-1', role: 'ADMIN' })).rejects.toBeInstanceOf(ConflictException);
  });
});

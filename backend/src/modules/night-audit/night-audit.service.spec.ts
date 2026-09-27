import { Prisma } from '@prisma/client';
import { NightAuditService } from './night-audit.service';

function setup(overrides: Record<string, any> = {}) {
  const hotel = { id: 'hotel-1', name: 'RainWood Demo', timezoneName: 'Asia/Kolkata', active: true };
  const admin = { id: 'admin-1', name: 'RainWood Admin', role: 'ADMIN', staffHotelId: null };
  const rooms = [
    { id: 'room-101', roomNumber: '101', status: 'AVAILABLE' },
    { id: 'room-102', roomNumber: '102', status: 'OCCUPIED' },
    { id: 'room-103', roomNumber: '103', status: 'DIRTY' },
    { id: 'room-104', roomNumber: '104', status: 'OUT_OF_ORDER' },
  ];
  const checkedIn = { id: 'stay-1', reference: 'RW-IN-1', guestName: 'In House Guest', checkIn: new Date('2026-09-27'), checkOut: new Date('2026-09-29'), roomAssignments: [{ roomId: 'room-102' }], totalAmount: new Prisma.Decimal(10000), folioCharges: [{ totalAmount: new Prisma.Decimal(150) }], payments: [{ amount: new Prisma.Decimal(5000) }] };
  const p: any = {
    user: { findUnique: jest.fn().mockResolvedValue(admin) },
    hotel: { findUnique: jest.fn().mockResolvedValue(hotel) },
    room: { findMany: jest.fn().mockResolvedValue(rooms) },
    reservation: { findMany: jest.fn().mockImplementation(async (args: any) => args.where.checkIn ? [{ id: 'arrival-1', stayStatus: 'EXPECTED' }] : args.where.checkOut ? [{ id: 'departure-1', stayStatus: 'CHECKED_OUT' }] : args.where.stayStatus === 'CHECKED_IN' ? [checkedIn] : [{ id: checkedIn.id, reference: checkedIn.reference, guestName: checkedIn.guestName, stayStatus: 'CHECKED_IN', totalAmount: checkedIn.totalAmount, folioCharges: checkedIn.folioCharges, payments: checkedIn.payments }]), count: jest.fn().mockResolvedValue(0) },
    reservationRoomNight: { findMany: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(5000), totalAmount: new Prisma.Decimal(5500), rooms: 1 }]) },
    reservationFolioCharge: { findMany: jest.fn().mockResolvedValue([{ totalAmount: new Prisma.Decimal(250) }]) },
    payment: { findMany: jest.fn().mockResolvedValue([{ amount: new Prisma.Decimal(300), mode: 'UPI', paidAt: new Date('2026-09-28T04:00:00Z'), createdAt: new Date('2026-09-28T04:00:00Z') }]) },
    reservationRoomAssignment: { findMany: jest.fn().mockResolvedValue([{ id: 'assignment-1', roomId: 'room-102', reservationId: 'stay-1', room: { id: 'room-102', roomNumber: '102', hotelId: 'hotel-1', active: true, status: 'OCCUPIED' }, reservation: { id: 'stay-1', stayStatus: 'CHECKED_IN' } }]) },
    housekeepingTask: { findMany: jest.fn().mockResolvedValue([{ id: 'task-1', roomId: 'room-103', status: 'PENDING', room: { roomNumber: '103', status: 'DIRTY' } }]) },
    maintenanceTicket: { findMany: jest.fn().mockResolvedValue([]) },
    hotelBusinessDay: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data, include }: any) => ({ ...data, id: 'day-1', closedBy: include ? admin : undefined })) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(async (work: any) => work(p)),
  };
  Object.assign(p, overrides);
  return { service: new NightAuditService(p), p, hotel, admin, rooms };
}

describe('NightAuditService', () => {
  it('previews local business date, selected-night revenue, posted incidentals and verified payments', async () => {
    const { service } = setup();
    const result: any = await service.preview('admin-1', { hotelId: 'hotel-1', date: '2026-09-28' });
    expect(result.businessDate).toBe('2026-09-28');
    expect(result.summary.revenue.roomRevenue).toBe(5500);
    expect(result.summary.revenue.incidentalRevenue).toBe(250);
    expect(result.summary.payments).toEqual(expect.objectContaining({ upi: 300, total: 300 }));
    expect(result.summary.occupancy).toEqual(expect.objectContaining({ totalRooms: 4, occupiedRooms: 1, outOfOrderRooms: 1, sellableRooms: 3 }));
    expect(result.blockers).toEqual([]);
    expect(result.warnings.map((item: any) => item.code)).toEqual(expect.arrayContaining(['DIRTY_ROOMS', 'OUT_OF_ORDER_ROOMS', 'OUTSTANDING_GUEST_BALANCE']));
  });

  it('blocks close on invalid occupied-room integrity but does not mutate stays', async () => {
    const { service, p } = setup({ room: { findMany: jest.fn().mockResolvedValue([{ id: 'room-102', roomNumber: '102', status: 'OCCUPIED' }]) }, reservationRoomAssignment: { findMany: jest.fn().mockResolvedValue([]) } });
    await expect(service.close('admin-1', { hotelId: 'hotel-1', businessDate: '2026-09-28' })).rejects.toThrow('blockers');
    expect(p.hotelBusinessDay.create).not.toHaveBeenCalled();
    expect(p.reservation.update).toBeUndefined();
  });

  it('creates a closed snapshot and returns the same closed record on retry', async () => {
    const { service, p } = setup();
    const first: any = await service.close('admin-1', { hotelId: 'hotel-1', businessDate: '2026-09-28' });
    expect(first.alreadyClosed).toBe(true);
    expect(first.closed.closedBy.name).toBe('RainWood Admin');
    expect(p.hotelBusinessDay.create).toHaveBeenCalledTimes(1);
    p.hotelBusinessDay.findUnique.mockResolvedValue({ id: 'day-1', status: 'CLOSED', summary: first.summary, exceptions: { warnings: first.warnings }, closedAt: new Date(), closedBy: p.user.findUnique.mock.results[0]?.value ?? { id: 'admin-1', name: 'RainWood Admin' } });
    const second: any = await service.close('admin-1', { hotelId: 'hotel-1', businessDate: '2026-09-28' });
    expect(second.alreadyClosed).toBe(true);
    expect(p.hotelBusinessDay.create).toHaveBeenCalledTimes(1);
  });

  it('forces a scoped Admin to its assigned hotel', async () => {
    const { service } = setup({ user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', name: 'Hotel Admin', role: 'ADMIN', staffHotelId: 'hotel-own' }) } });
    await expect(service.preview('admin-1', { hotelId: 'hotel-other', date: '2026-09-28' })).rejects.toThrow('Hotel not found');
  });
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StaffService } from './staff.service';

const today = new Date();
today.setUTCHours(0, 0, 0, 0);
const tomorrow = new Date(today);
tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);

function profile(overrides: Record<string, unknown> = {}) {
  return { id: 'staff-1', name: 'Demo Staff', role: 'SERVICE_STAFF', active: true, staffDepartment: 'FOOD_BEVERAGE', jobTitle: 'Restaurant captain', staffHotelId: 'hotel-1', staffHotel: { id: 'hotel-1', name: 'RainWood Demo', active: true }, ...overrides };
}

function stay(overrides: Record<string, unknown> = {}) {
  return { reference: 'RW-STAFF-1', guestName: 'Demo Guest', checkIn: today, checkOut: tomorrow, status: 'CONFIRMED', hotelId: 'hotel-1', hotel: { id: 'hotel-1', name: 'RainWood Demo' }, lines: [{ rooms: 1, adults: 2, children: 1, roomType: { id: 'room-1', name: 'Valley Room' } }], ...overrides };
}

function setup(row: any = stay(), user: any = profile()) {
  const prisma: any = { user: { findUnique: jest.fn().mockResolvedValue(user) }, reservation: { findUnique: jest.fn().mockResolvedValue(row), findMany: jest.fn().mockResolvedValue([row]) } };
  const reservations: any = { getFolio: jest.fn().mockResolvedValue({ reference: row.reference, charges: [], totals: { incidentalCharges: 0, incidentalBalance: 0, totalOutstanding: 100 } }), postFolioCharge: jest.fn().mockResolvedValue({ reference: row.reference, charges: [] }) };
  return { service: new StaffService(prisma, reservations), prisma, reservations };
}

describe('StaffService', () => {
  it('returns only the assigned hotel and permitted department categories', async () => {
    const { service } = setup();
    await expect(service.getMe('staff-1')).resolves.toEqual(expect.objectContaining({ hotel: { id: 'hotel-1', name: 'RainWood Demo' }, allowedCategories: ['FOOD_AND_BEVERAGE', 'ROOM_SERVICE', 'MINIBAR', 'OTHER'] }));
  });

  it('scopes the stay list to the assigned hotel and active stay date window', async () => {
    const { service, prisma } = setup();
    await service.listStays('staff-1', {} as any);
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ hotelId: 'hotel-1', status: { in: ['CONFIRMED', 'MODIFIED'] }, checkIn: { lte: today }, checkOut: { gt: today } }) }));
  });

  it('summarizes multi-room line occupancy without multiplying guest totals by rooms', async () => {
    const { service } = setup(stay({ lines: [{ rooms: 2, adults: 3, children: 1, roomType: { id: 'room-1', name: 'Valley Room' } }] }));
    await expect(service.getStay('staff-1', 'RW-STAFF-1')).resolves.toEqual(expect.objectContaining({ rooms: 2, adults: 3, children: 1, pax: 4 }));
  });

  it('rejects a cross-hotel stay and non-operational statuses', async () => {
    const crossHotel = setup(stay({ hotelId: 'hotel-2', hotel: { id: 'hotel-2', name: 'Other Hotel' } }));
    await expect(crossHotel.service.getStay('staff-1', 'RW-STAFF-1')).rejects.toBeInstanceOf(NotFoundException);
    for (const status of ['DRAFT', 'PENDING_PAYMENT', 'TENTATIVE', 'COMPLETED']) {
      const invalid = setup(stay({ status }));
      await expect(invalid.service.getStay('staff-1', 'RW-STAFF-1')).rejects.toBeInstanceOf(NotFoundException);
    }
  });

  it('allows same-day arrival and blocks departed stays', async () => {
    const current = setup();
    await expect(current.service.getStay('staff-1', 'RW-STAFF-1')).resolves.toEqual(expect.objectContaining({ reference: 'RW-STAFF-1' }));
    const departed = setup(stay({ checkOut: today }));
    await expect(departed.service.getStay('staff-1', 'RW-STAFF-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('enforces department categories before posting and delegates server-controlled posting', async () => {
    const { service, reservations } = setup();
    await expect(service.postCharge('staff-1', 'RW-STAFF-1', { category: 'LAUNDRY', description: 'Laundry', quantity: 1, unitAmount: 100, idempotencyKey: 'staff-key-001' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(reservations.postFolioCharge).not.toHaveBeenCalled();
    await service.postCharge('staff-1', 'RW-STAFF-1', { category: 'ROOM_SERVICE', description: 'Dinner', quantity: 1, unitAmount: 500, idempotencyKey: 'staff-key-001' } as any);
    expect(reservations.postFolioCharge).toHaveBeenCalledWith('RW-STAFF-1', expect.objectContaining({ category: 'ROOM_SERVICE', description: 'Dinner' }), { id: 'staff-1' }, expect.objectContaining({ staffOnly: true, idempotencyKey: 'staff-key-001', allowedCategories: expect.arrayContaining(['ROOM_SERVICE']) }));
  });

  it('returns the same folio history and active totals for GET and POST', async () => {
    const voided = { id: 'charge-voided', category: 'ROOM_SERVICE', description: 'Voided dinner', quantity: 1, unitAmount: 500, totalAmount: 500, postingDate: today, note: null, status: 'VOIDED', postedBy: { name: 'Demo Staff' }, voidedAt: today, voidedBy: { name: 'Admin' }, voidReason: 'Duplicate', createdAt: today };
    const posted = { id: 'charge-posted', category: 'ROOM_SERVICE', description: 'Dinner', quantity: 1, unitAmount: 300, totalAmount: 300, postingDate: today, note: null, status: 'POSTED', postedBy: { name: 'Demo Staff' }, voidedAt: null, voidedBy: null, voidReason: null, createdAt: today };
    const { service, reservations } = setup();
    reservations.getFolio.mockResolvedValue({ reference: 'RW-STAFF-1', charges: [voided, posted], totals: { incidentalCharges: 300, incidentalBalance: 300, totalOutstanding: 400 } });
    const expected = { reference: 'RW-STAFF-1', charges: expect.arrayContaining([expect.objectContaining({ id: 'charge-voided', status: 'VOIDED', voidReason: 'Duplicate' }), expect.objectContaining({ id: 'charge-posted', status: 'POSTED' })]), totals: { incidentalCharges: 300, incidentalBalance: 300, totalOutstanding: 400 } };
    await expect(service.getFolio('staff-1', 'RW-STAFF-1')).resolves.toEqual(expected);
    await expect(service.postCharge('staff-1', 'RW-STAFF-1', { category: 'ROOM_SERVICE', description: 'Dinner', quantity: 1, unitAmount: 300, idempotencyKey: 'staff-key-002' } as any)).resolves.toEqual(expected);
    expect(reservations.getFolio).toHaveBeenCalledTimes(2);
  });
});

import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { GuestsService } from './guests.service';

function setup(user: any = { role: 'ADMIN', staffHotelId: 'hotel-a' }, guestInScope = true) {
  const p: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    guestProfile: {
      findFirst: jest.fn().mockResolvedValue(guestInScope ? { id: 'guest-1' } : null),
      findUnique: jest.fn().mockResolvedValue({ id: 'guest-1' }),
      update: jest.fn().mockResolvedValue({ id: 'guest-1' }),
      create: jest.fn(),
    },
    roomType: { findFirst: jest.fn().mockResolvedValue({ id: 'room-a' }) },
    guestNote: { create: jest.fn().mockResolvedValue({ id: 'note-1' }) },
  };
  return { service: new GuestsService(p), p };
}

describe('GuestsService scoped edit authority', () => {
  it('allows a scoped Admin to edit a guest with a reservation at the assigned hotel', async () => {
    const { service, p } = setup();
    await expect(service.update('admin-a', 'guest-1', { displayName: 'Updated Guest' })).resolves.toEqual({ id: 'guest-1' });
    expect(p.guestProfile.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'guest-1', reservations: { some: { hotelId: 'hotel-a' } } }) }));
  });

  it('rejects a scoped user editing a guest who only belongs to another hotel', async () => {
    const { service } = setup({ role: 'RESERVATION', staffHotelId: 'hotel-a' }, false);
    await expect(service.update('reservation-a', 'guest-b', { displayName: 'Nope' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addNote('reservation-a', 'guest-b', { category: 'PREFERENCE', visibility: 'FRONT_OFFICE', note: 'Nope', hotelId: 'hotel-b' } as any)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('allows global Super Admin management and keeps management notes restricted', async () => {
    const { service, p } = setup({ role: 'SUPER_ADMIN', staffHotelId: null });
    await expect(service.update('super-1', 'guest-1', { blacklisted: true })).resolves.toEqual({ id: 'guest-1' });
    await service.addNote('super-1', 'guest-1', { category: 'MANAGEMENT', visibility: 'MANAGEMENT_ONLY', note: 'Internal note', hotelId: 'hotel-a' });
    expect(p.guestNote.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ hotelId: 'hotel-a' }) }));
  });

  it('blocks Reservation users from changing global flags and validates room-type hotel scope', async () => {
    const reservation = setup({ role: 'RESERVATION', staffHotelId: 'hotel-a' });
    await expect(reservation.service.update('reservation-a', 'guest-1', { blacklisted: true })).rejects.toBeInstanceOf(ForbiddenException);
    reservation.p.roomType.findFirst.mockResolvedValue(null);
    await expect(reservation.service.update('reservation-a', 'guest-1', { preferredRoomTypeId: 'room-b' })).rejects.toThrow('outside the current hotel scope');
  });

  it('does not allow Service Staff to reach CRM edit APIs', async () => {
    const { service } = setup({ role: 'SERVICE_STAFF', staffHotelId: 'hotel-a' });
    await expect(service.update('staff-a', 'guest-1', { displayName: 'Nope' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

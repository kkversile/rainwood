import { ConflictException } from '@nestjs/common';
import { RoomOperationalStatus } from '@prisma/client';
import { HotelsService } from './hotels.service';
import { allowedAdminRoomStatusTransitions, assertAdminRoomStatusTransition } from './room-operational-status';

function setup(status: RoomOperationalStatus = RoomOperationalStatus.OCCUPIED, assignments: unknown[] = [{ id: 'assignment-1' }]) {
  const current = { id: 'room-203', hotelId: 'hotel-1', roomTypeId: 'type-deluxe', roomNumber: '203', floor: '2', wing: 'East', status, active: true, assignments };
  const prisma: any = {
    room: { findUnique: jest.fn().mockResolvedValue(current), update: jest.fn().mockResolvedValue(current) },
    roomType: { findFirst: jest.fn().mockResolvedValue({ id: 'type-deluxe', hotelId: 'hotel-1' }) },
  };
  return { service: new HotelsService(prisma, {} as any), prisma, current };
}

describe('physical room admin integrity', () => {
  it.each([
    [{ roomTypeId: 'type-standard' }, 'room type'],
    [{ active: false }, 'deactivation'],
    [{ status: RoomOperationalStatus.AVAILABLE }, 'available'],
    [{ status: RoomOperationalStatus.DIRTY }, 'dirty'],
    [{ status: RoomOperationalStatus.CLEANING }, 'cleaning'],
    [{ status: RoomOperationalStatus.OUT_OF_ORDER }, 'out of order'],
  ])('rejects occupied-room %s edit', async (changes: any, _label: string) => {
    const { service, prisma } = setup();
    await expect(service.updatePhysicalRoom('room-203', changes as any)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.room.update).not.toHaveBeenCalled();
  });

  it('allows harmless metadata edits while occupied', async () => {
    const { service, prisma } = setup();
    await expect(service.updatePhysicalRoom('room-203', { floor: '3', wing: 'West' })).resolves.toBeDefined();
    expect(prisma.room.update).toHaveBeenCalled();
  });

  it('rejects room-number change while room has active assignment', async () => {
    const { service, prisma } = setup();
    await expect(service.updatePhysicalRoom('room-203', { roomNumber: '205' })).rejects.toThrow(
      'Room 203 is currently assigned to an in-house guest and cannot be renumbered.',
    );
    expect(prisma.room.update).not.toHaveBeenCalled();
  });

  it.each(['203', ' 203 '])('allows occupied room-number update when normalized value is unchanged: %s', async (roomNumber) => {
    const { service, prisma } = setup();
    await expect(service.updatePhysicalRoom('room-203', { roomNumber })).resolves.toBeDefined();
    expect(prisma.room.update).toHaveBeenCalled();
  });

  it('allows room-number change when there is no active assignment', async () => {
    const { service, prisma } = setup(RoomOperationalStatus.AVAILABLE, []);
    await expect(service.updatePhysicalRoom('room-203', { roomNumber: '205' })).resolves.toBeDefined();
    expect(prisma.room.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ roomNumber: '205' }),
    }));
  });

  it('keeps duplicate room-number conflicts mapped to ConflictException', async () => {
    const { service, prisma } = setup(RoomOperationalStatus.AVAILABLE, []);
    prisma.room.update.mockRejectedValue({ code: 'P2002' });
    await expect(service.updatePhysicalRoom('room-203', { roomNumber: '205' })).rejects.toThrow(
      'That room number already exists at this hotel.',
    );
  });

  it('allows only the canonical management transitions', () => {
    expect(allowedAdminRoomStatusTransitions(RoomOperationalStatus.AVAILABLE)).toEqual([RoomOperationalStatus.AVAILABLE, RoomOperationalStatus.OUT_OF_ORDER]);
    expect(allowedAdminRoomStatusTransitions(RoomOperationalStatus.DIRTY)).toEqual([RoomOperationalStatus.DIRTY, RoomOperationalStatus.CLEANING, RoomOperationalStatus.OUT_OF_ORDER]);
    expect(() => assertAdminRoomStatusTransition(RoomOperationalStatus.OCCUPIED, RoomOperationalStatus.DIRTY, '203')).toThrow(ConflictException);
    expect(() => assertAdminRoomStatusTransition(RoomOperationalStatus.DIRTY, RoomOperationalStatus.OCCUPIED, '203')).toThrow(ConflictException);
    expect(() => assertAdminRoomStatusTransition(RoomOperationalStatus.AVAILABLE, RoomOperationalStatus.OUT_OF_ORDER, '203')).not.toThrow();
    expect(() => assertAdminRoomStatusTransition(RoomOperationalStatus.CLEANING, RoomOperationalStatus.AVAILABLE, '203')).not.toThrow();
  });

  it('does not block a room-type validation query when the room is unassigned', async () => {
    const { service, prisma } = setup(RoomOperationalStatus.AVAILABLE, []);
    await service.updatePhysicalRoom('room-203', { roomTypeId: 'type-standard' });
    expect(prisma.roomType.findFirst).toHaveBeenCalledWith({ where: { id: 'type-standard', hotelId: 'hotel-1' } });
  });
});

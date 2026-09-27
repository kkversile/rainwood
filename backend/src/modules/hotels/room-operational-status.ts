import { ConflictException } from '@nestjs/common';
import { RoomOperationalStatus } from '@prisma/client';

const ADMIN_TRANSITIONS: Record<RoomOperationalStatus, readonly RoomOperationalStatus[]> = {
  [RoomOperationalStatus.AVAILABLE]: [RoomOperationalStatus.AVAILABLE, RoomOperationalStatus.OUT_OF_ORDER],
  [RoomOperationalStatus.OCCUPIED]: [RoomOperationalStatus.OCCUPIED],
  [RoomOperationalStatus.DIRTY]: [RoomOperationalStatus.DIRTY, RoomOperationalStatus.CLEANING, RoomOperationalStatus.OUT_OF_ORDER],
  [RoomOperationalStatus.CLEANING]: [RoomOperationalStatus.CLEANING, RoomOperationalStatus.AVAILABLE, RoomOperationalStatus.OUT_OF_ORDER],
  [RoomOperationalStatus.OUT_OF_ORDER]: [RoomOperationalStatus.OUT_OF_ORDER, RoomOperationalStatus.DIRTY, RoomOperationalStatus.AVAILABLE],
};

export function allowedAdminRoomStatusTransitions(status: RoomOperationalStatus): readonly RoomOperationalStatus[] {
  return ADMIN_TRANSITIONS[status] ?? [status];
}

export function assertAdminRoomStatusTransition(current: RoomOperationalStatus, next: RoomOperationalStatus, roomNumber?: string): void {
  if (current === next) return;
  if (!allowedAdminRoomStatusTransitions(current).includes(next)) {
    if (current === RoomOperationalStatus.OCCUPIED) {
      throw new ConflictException(`Room ${roomNumber ?? ''}`.trim() + ' is occupied and its status can only change through Room Change or Checkout.');
    }
    throw new ConflictException(`Room status cannot change from ${current} to ${next} through room administration.`);
  }
}

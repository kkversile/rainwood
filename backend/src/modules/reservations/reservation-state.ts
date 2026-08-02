import { BadRequestException } from '@nestjs/common';
import { ReservationStatus } from '@prisma/client';

const transitions: Record<ReservationStatus, ReservationStatus[]> = {
  DRAFT: ['HELD', 'PENDING_PAYMENT', 'TENTATIVE', 'CANCELLED'],
  HELD: ['PENDING_PAYMENT', 'EXPIRED', 'CANCELLED'],
  PENDING_PAYMENT: ['CONFIRMED', 'TENTATIVE', 'CANCELLED', 'EXPIRED'],
  TENTATIVE: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['MODIFIED', 'CANCELLED', 'NO_SHOW', 'COMPLETED'],
  MODIFIED: ['MODIFIED', 'CANCELLED', 'NO_SHOW', 'COMPLETED'],
  CANCELLED: [],
  NO_SHOW: [],
  COMPLETED: [],
  EXPIRED: [],
};

export function canTransition(from: ReservationStatus, to: ReservationStatus) { return from === to || transitions[from].includes(to); }

export function assertReservationTransition(from: ReservationStatus, to: ReservationStatus) {
  if (!canTransition(from, to)) throw new BadRequestException(`Invalid reservation transition ${from} -> ${to}`);
}

export { transitions as reservationTransitions };

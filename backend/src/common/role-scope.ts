import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';

type Database = PrismaServiceLike | Prisma.TransactionClient;
type PrismaServiceLike = {
  user: { findUnique(args: any): Promise<any> };
  hotel: { findUnique(args: any): Promise<any> };
};

export type ActorScope = {
  userId: string;
  role: UserRole;
  hotelId: string | null;
  isGlobal: boolean;
  staffDepartment: string | null;
};

export const GLOBAL_ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN];
export const HOTEL_SCOPED_ROLES: UserRole[] = [UserRole.ADMIN, UserRole.RESERVATION, UserRole.SERVICE_STAFF];

export function isGlobalRole(role: UserRole | string | null | undefined) {
  return role === UserRole.SUPER_ADMIN || role === UserRole.CORPORATE_ADMIN;
}

export function validateUserRoleScope(role: UserRole, staffHotelId: string | null | undefined, staffDepartment?: string | null, jobTitle?: string | null) {
  const requiresHotel = role === UserRole.ADMIN || role === UserRole.RESERVATION || role === UserRole.SERVICE_STAFF;
  if ((role === UserRole.SUPER_ADMIN || role === UserRole.CORPORATE_ADMIN || role === UserRole.ACCOUNTS || role === UserRole.VIEWER) && staffHotelId) {
    throw new BadRequestException(`${role} users must not have an assigned hotel.`);
  }
  if (requiresHotel && !staffHotelId) {
    throw new BadRequestException(`${role} users require an assigned active hotel.`);
  }
  if (role === UserRole.SERVICE_STAFF && (!staffDepartment || !jobTitle?.trim())) {
    throw new BadRequestException('Service staff require department and job title.');
  }
}

export async function getActorScope(db: Database, userId: string): Promise<ActorScope> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, staffHotelId: true, staffDepartment: true, staffHotel: { select: { id: true, active: true } } } });
  if (!user) throw new NotFoundException('Actor user not found.');
  if (isGlobalRole(user.role)) {
    if (user.staffHotelId) throw new ForbiddenException('Global users cannot carry a hotel scope.');
    return { userId: user.id, role: user.role, hotelId: null, isGlobal: true, staffDepartment: user.staffDepartment ?? null };
  }
  if (HOTEL_SCOPED_ROLES.includes(user.role) && (!user.staffHotelId || !user.staffHotel?.active)) {
    throw new ForbiddenException('This account has no valid active hotel scope.');
  }
  return { userId: user.id, role: user.role, hotelId: user.staffHotelId ?? null, isGlobal: false, staffDepartment: user.staffDepartment ?? null };
}

export async function assertActorCanManageHotel(db: Database, userId: string, requestedHotelId: string) {
  const scope = await getActorScope(db, userId);
  const hotel = await db.hotel.findUnique({ where: { id: requestedHotelId }, select: { id: true, active: true } });
  if (!hotel?.active) throw new NotFoundException('Hotel not found.');
  if (!scope.isGlobal && scope.hotelId !== requestedHotelId) throw new ForbiddenException('You cannot access another hotel.');
  return { ...scope, hotelId: requestedHotelId };
}

export function resolveRequestedHotel(scope: ActorScope, requestedHotelId?: string | null) {
  if (scope.isGlobal) return requestedHotelId ?? null;
  if (!scope.hotelId) throw new ForbiddenException('This account has no hotel scope.');
  if (requestedHotelId && requestedHotelId !== scope.hotelId) throw new ForbiddenException('Hotel not found.');
  return scope.hotelId;
}

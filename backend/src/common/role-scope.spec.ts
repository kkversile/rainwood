import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { getActorScope, resolveRequestedHotel, validateUserRoleScope } from './role-scope';

describe('role scope rules', () => {
  it('requires a hotel for property roles and metadata for service staff', () => {
    expect(() => validateUserRoleScope(UserRole.ADMIN, null)).toThrow(BadRequestException);
    expect(() => validateUserRoleScope(UserRole.SERVICE_STAFF, 'hotel-1', 'HOUSEKEEPING', null)).toThrow(BadRequestException);
    expect(() => validateUserRoleScope(UserRole.CORPORATE_ADMIN, 'hotel-1')).toThrow(BadRequestException);
    expect(() => validateUserRoleScope(UserRole.ACCOUNTS, 'hotel-1')).toThrow(BadRequestException);
    expect(() => validateUserRoleScope(UserRole.VIEWER, 'hotel-1')).toThrow(BadRequestException);
  });

  it('resolves global and property hotel scope explicitly', () => {
    expect(resolveRequestedHotel({ userId: 'u', role: UserRole.CORPORATE_ADMIN, hotelId: null, isGlobal: true, staffDepartment: null }, 'hotel-b')).toBe('hotel-b');
    expect(resolveRequestedHotel({ userId: 'u', role: UserRole.ADMIN, hotelId: 'hotel-a', isGlobal: false, staffDepartment: null }, undefined)).toBe('hotel-a');
    expect(() => resolveRequestedHotel({ userId: 'u', role: UserRole.ADMIN, hotelId: 'hotel-a', isGlobal: false, staffDepartment: null }, 'hotel-b')).toThrow(ForbiddenException);
  });

  it('rejects a scoped actor whose hotel is inactive', async () => {
    const db: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', role: UserRole.ADMIN, staffHotelId: 'hotel-a', staffDepartment: null, staffHotel: { id: 'hotel-a', active: false } }) } };
    await expect(getActorScope(db, 'u')).rejects.toThrow(ForbiddenException);
  });

  it('fails closed when the staff-hotel relation is missing', async () => {
    const db: any = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'u', role: UserRole.ADMIN, staffHotelId: 'hotel-a', staffDepartment: null }) } };
    await expect(getActorScope(db, 'u')).rejects.toThrow(ForbiddenException);
  });

  it('fails closed when authorization Prisma methods are unavailable', async () => {
    await expect(getActorScope({ user: {} } as any, 'u')).rejects.toThrow();
    await expect((async () => {
      const { assertActorCanManageHotel } = await import('./role-scope');
      return assertActorCanManageHotel({ user: { findUnique: jest.fn() }, hotel: {} } as any, 'u', 'hotel-a');
    })()).rejects.toThrow();
  });
});

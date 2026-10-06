import { HotelScopeGuard } from './hotel-scope.guard';

const requestContext = (request: any) => ({ switchToHttp: () => ({ getRequest: () => request }) }) as any;

describe('HotelScopeGuard route normalization', () => {
  it('resolves a bank account PATCH to the owning hotel before applying scope', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-a', role: 'ADMIN', staffHotelId: 'hotel-a', staffDepartment: null, staffHotel: { id: 'hotel-a', active: true } }) },
      hotelBankAccount: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-b' }) },
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-b', active: true }) },
    };
    const guard = new HotelScopeGuard(prisma);
    await expect(guard.canActivate(requestContext({ method: 'PATCH', baseUrl: '/api/v1/hotels', route: { path: '/bank-accounts/:id' }, params: { id: 'bank-b' }, user: { id: 'admin-a', role: 'ADMIN' } }))).rejects.toThrow('hotel');
    expect(prisma.hotelBankAccount.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bank-b' }, select: { hotelId: true } }));
  });

  it.each([
    ['/physical-rooms/:id', 'room'],
    ['/rate-plan-masters/:id', 'ratePlanMaster'],
    ['/promotions/:id', 'promotion'],
    ['/rate-seasons/:id', 'rateSeason'],
    ['/yield-rules/:id', 'yieldRule'],
  ])('resolves %s from a controller-relative route', async (relativeRoute, delegate) => {
    const resource = { hotelId: 'hotel-b' };
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'corporate', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-b', active: true }) },
      [delegate]: { findUnique: jest.fn().mockResolvedValue(resource) },
    };
    const guard = new HotelScopeGuard(prisma);
    await expect(guard.canActivate(requestContext({ method: 'PATCH', baseUrl: '/api/v1/hotels', route: { path: relativeRoute }, params: { id: 'entity-b' }, user: { id: 'corporate', role: 'CORPORATE_ADMIN' } }))).resolves.toBe(true);
    expect(prisma[delegate].findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'entity-b' } }));
  });
});

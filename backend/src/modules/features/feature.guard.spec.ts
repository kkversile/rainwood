import { ForbiddenException } from '@nestjs/common';
import { FeatureGuard } from './feature.guard';
import { FEATURE_ENFORCEMENT } from './features.catalog';

const context = (user: any, request: any = {}) => ({ getHandler: () => 'handler', getClass: () => 'class', switchToHttp: () => ({ getRequest: () => ({ user, params: {}, query: {}, body: {}, ...request }) }) }) as any;

describe('FeatureGuard', () => {
  it('allows SUPER_ADMIN even when the feature is disabled', async () => {
    const guard = new FeatureGuard({ getAllAndOverride: () => 'banquets' } as any, {} as any, { isEnabled: jest.fn().mockResolvedValue(false) } as any);
    await expect(guard.canActivate(context({ id: 'admin', role: 'SUPER_ADMIN' }))).resolves.toBe(true);
  });

  it('denies a disabled feature for a scoped admin', async () => {
    const prisma = { user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'ADMIN', staffHotelId: 'hotel-1', staffDepartment: null, staffHotel: { id: 'hotel-1', active: true } }) } } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'banquets' } as any, prisma, { isEnabled: jest.fn().mockResolvedValue(false) } as any);
    await expect(guard.canActivate(context({ id: 'staff', role: 'ADMIN' }))).rejects.toMatchObject({ response: { code: 'FEATURE_NOT_ENABLED' } });
  });

  it('uses the protected entity hotel instead of a conflicting request hotel', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      banquetEvent: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-1' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'banquets' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'ADMIN' }, { params: { id: 'event-1' }, query: { hotelId: 'hotel-2' } })).then(() => true)).resolves.toBe(true);
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-1', 'banquets');
  });

  it('resolves reservation scope from the reference, not a client hotel id', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      reservation: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'reservations' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { params: { reference: 'RW-REFERENCE' }, query: { hotelId: 'hotel-1' } }))).resolves.toBe(true);
    expect(prisma.reservation.findUnique).toHaveBeenCalledWith({ where: { reference: 'RW-REFERENCE' }, select: { hotelId: true } });
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', 'reservations');
  });

  it('resolves housekeeping task scope from taskId, not a generic id', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      housekeepingTask: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'housekeeping' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { params: { taskId: 'task-1' }, body: { hotelId: 'hotel-1' } }))).resolves.toBe(true);
    expect(prisma.housekeepingTask.findUnique).toHaveBeenCalledWith({ where: { id: 'task-1' }, select: { hotelId: true } });
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', 'housekeeping');
  });

  it('resolves housekeeping room scope from roomId', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      room: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'housekeeping' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { params: { roomId: 'room-1' } }))).resolves.toBe(true);
    expect(prisma.room.findUnique).toHaveBeenCalledWith({ where: { id: 'room-1' }, select: { hotelId: true } });
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', 'housekeeping');
  });

  it('resolves maintenance scope from ticketId', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      maintenanceTicket: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'maintenance' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { params: { ticketId: 'ticket-1' } }))).resolves.toBe(true);
    expect(prisma.maintenanceTicket.findUnique).toHaveBeenCalledWith({ where: { id: 'ticket-1' }, select: { hotelId: true } });
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', 'maintenance');
  });

  it('resolves payments from the reservation reference and verifies payment ownership', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      payment: { findUnique: jest.fn().mockResolvedValue({ reservation: { reference: 'RW-REFERENCE', hotelId: 'hotel-2' } }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'payments' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { params: { reference: 'RW-REFERENCE', paymentId: 'payment-1' } }))).resolves.toBe(true);
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', 'payments');
  });

  it('keeps room, rate-plan and master resource scopes authoritative', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      room: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
      ratePlanMaster: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
      ratePlan: { findUnique: jest.fn().mockResolvedValue({ roomType: { hotelId: 'hotel-2' } }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const resolver = (key: string, params: any) => new FeatureGuard({ getAllAndOverride: () => key } as any, prisma, features).canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { params }));
    await expect(resolver('physicalRooms', { id: 'room-1' })).resolves.toBe(true);
    await expect(resolver('ratePlans', { masterId: 'master-1' })).resolves.toBe(true);
    await expect(resolver('ratePlans', { id: 'rate-plan-1' })).resolves.toBe(true);
    expect(features.isEnabled).toHaveBeenNthCalledWith(1, 'hotel-2', 'physicalRooms');
    expect(features.isEnabled).toHaveBeenNthCalledWith(2, 'hotel-2', 'ratePlans');
    expect(features.isEnabled).toHaveBeenNthCalledWith(3, 'hotel-2', 'ratePlans');
  });

  it.each([
    ['promotions', 'promotion'],
    ['rateSeasons', 'rateSeason'],
    ['yieldRules', 'yieldRule'],
    ['serviceItems', 'serviceItem'],
    ['lostFound', 'lostFoundItem'],
    ['cashier', 'cashierShift'],
  ])('resolves %s direct resource scope from %s.hotelId', async (key, model) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      [model]: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => key } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { params: { id: 'entity-1' } }))).resolves.toBe(true);
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', key);
  });

  it('resolves service-order scope through the shared serviceItems feature', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      guestServiceOrder: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'serviceItems' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { path: '/api/v1/service-orders/entity-1', params: { id: 'entity-1' } }))).resolves.toBe(true);
    expect(prisma.guestServiceOrder.findUnique).toHaveBeenCalledWith({ where: { id: 'entity-1' }, select: { hotelId: true } });
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', 'serviceItems');
  });

  it.each([
    ['taxInvoices', 'taxInvoice', '/api/v1/tax-invoices/:id'],
    ['creditNotes', 'taxCreditNote', '/api/v1/tax-credit-notes/:id'],
    ['tds', 'tdsDeduction', '/api/v1/tds/:id/certificate'],
    ['taxSettings', 'taxRule', '/api/v1/tax-settings/rules/:id'],
  ])('resolves %s direct statutory scope from the actual route entity', async (key, model, routePath) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      [model]: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => key } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { route: { path: routePath }, params: { id: 'statutory-1' } }))).resolves.toBe(true);
    expect(prisma[model].findUnique).toHaveBeenCalledWith({ where: { id: 'statutory-1' }, select: { hotelId: true } });
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', key);
  });

  it.each([
    ['creditNotes', '/api/v1/tax-invoices/:id/credit-notes'],
    ['tds', '/api/v1/tax-invoices/:id/tds'],
  ])('resolves %s creation from the parent tax invoice', async (key, routePath) => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      taxInvoice: { findUnique: jest.fn().mockResolvedValue({ hotelId: 'hotel-2' }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => key } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { route: { path: routePath }, params: { id: 'invoice-1' } }))).resolves.toBe(true);
    expect(prisma.taxInvoice.findUnique).toHaveBeenCalledWith({ where: { id: 'invoice-1' }, select: { hotelId: true } });
    expect(features.isEnabled).toHaveBeenCalledWith('hotel-2', key);
  });

  it('uses the group feature contract for a global tax rule', async () => {
    const prisma = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'staff', role: 'CORPORATE_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
      taxRule: { findUnique: jest.fn().mockResolvedValue({ hotelId: null }) },
    } as any;
    const features = { isEnabled: jest.fn().mockResolvedValue(true) } as any;
    const guard = new FeatureGuard({ getAllAndOverride: () => 'taxSettings' } as any, prisma, features);
    await expect(guard.canActivate(context({ id: 'staff', role: 'CORPORATE_ADMIN' }, { route: { path: '/api/v1/tax-settings/rules/:id' }, params: { id: 'global-tax-rule' }, body: { hotelId: 'hotel-2' } }))).resolves.toBe(true);
    expect(features.isEnabled).toHaveBeenCalledWith(null, 'taxSettings');
  });

  it('keeps Agent self-service routes outside the admin Agents feature gate', async () => {
    const guard = new FeatureGuard({ getAllAndOverride: () => undefined } as any, {} as any, {} as any);
    await expect(guard.canActivate(context({ id: 'agent', role: 'AGENT' }, { route: { path: '/me/profile' }, baseUrl: '/api/v1/agents' }))).resolves.toBe(true);
  });

  it('keeps backend-guarded jobs out of ROUTE_UI classification', () => {
    expect(FEATURE_ENFORCEMENT.jobs).toBe('DOMAIN_API');
    expect(FEATURE_ENFORCEMENT.jobs).not.toBe('ROUTE_UI');
    expect(FEATURE_ENFORCEMENT.axisRooms).toBe('ROUTE_UI');
  });

  it('does not infer ordinary room APIs as physical rooms', () => {
    const guard = new FeatureGuard({ getAllAndOverride: () => undefined } as any, {} as any, {} as any);
    expect((guard as any).routeFeature({ baseUrl: '/api/v1/hotels', route: { path: '/:hotelId/rooms' } })).toBe('roomsInventory');
    expect((guard as any).routeFeature({ baseUrl: '/api/v1/hotels', route: { path: '/rooms/:roomId/rate-plans' } })).toBe('ratePlans');
    expect((guard as any).routeFeature({ baseUrl: '/api/v1/hotels', route: { path: '/physical-rooms/:id' } })).toBe('physicalRooms');
  });

  it('allows only the shared Agent manual booking path to bypass the admin reservations switch', async () => {
    const guard = new FeatureGuard({ getAllAndOverride: () => 'reservations' } as any, {} as any, {} as any);
    await expect(guard.canActivate(context({ id: 'agent', role: 'AGENT' }, { route: { path: '/manual' }, params: {} }))).resolves.toBe(true);
  });

  it('fails closed when a feature-protected route has no authenticated user', async () => {
    const guard = new FeatureGuard({ getAllAndOverride: () => 'banquets' } as any, {} as any, {} as any);
    await expect(guard.canActivate(context(undefined))).rejects.toThrow('Authentication required');
  });
});

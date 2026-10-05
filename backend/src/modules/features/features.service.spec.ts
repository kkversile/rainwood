import { ForbiddenException } from '@nestjs/common';
import { FeaturesService } from './features.service';
import { FEATURE_KEYS } from './features.catalog';

function database() {
  const defaults = new Map(FEATURE_KEYS.map((key) => [key, true]));
  const overrides = new Map<string, boolean>();
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue({ id: 'admin-1', role: 'SUPER_ADMIN', staffHotelId: null, staffDepartment: null, staffHotel: null }) },
    hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', name: 'Demo Hotel', code: 'DEMO', active: true }) },
    featureSetting: {
      upsert: jest.fn(({ create, update }: any) => { defaults.set(create.featureKey, update?.enabled ?? create.enabled); return Promise.resolve({ featureKey: create.featureKey, enabled: defaults.get(create.featureKey) }); }),
      findMany: jest.fn(() => Promise.resolve([...defaults].map(([featureKey, enabled]) => ({ featureKey, enabled })))),
      findUnique: jest.fn(({ where }: any) => Promise.resolve({ featureKey: where.featureKey, enabled: defaults.get(where.featureKey) ?? true })),
    },
    hotelFeatureOverride: {
      findMany: jest.fn(({ where }: any) => Promise.resolve([...overrides].filter(([key]) => key.startsWith(`${where.hotelId}:`)).map(([compound, enabled]) => ({ hotelId: where.hotelId, featureKey: compound.split(':')[1], enabled })))),
      findUnique: jest.fn(({ where }: any) => Promise.resolve(overrides.has(`${where.hotelId_featureKey.hotelId}:${where.hotelId_featureKey.featureKey}`) ? { enabled: overrides.get(`${where.hotelId_featureKey.hotelId}:${where.hotelId_featureKey.featureKey}`) } : null)),
      upsert: jest.fn(({ where, create, update }: any) => { const key = `${where.hotelId_featureKey.hotelId}:${where.hotelId_featureKey.featureKey}`; overrides.set(key, update.enabled ?? create.enabled); return Promise.resolve({}); }),
      deleteMany: jest.fn(({ where }: any) => { overrides.delete(`${where.hotelId}:${where.featureKey}`); return Promise.resolve({ count: 1 }); }),
    },
  };
  return { prisma, defaults, overrides };
}

describe('FeaturesService', () => {
  it('keeps all catalog defaults enabled initially and resolves group defaults', async () => {
    const { prisma } = database(); const service = new FeaturesService(prisma, { log: jest.fn() } as any);
    const result = await service.groupSettings();
    expect(result.features).toHaveLength(FEATURE_KEYS.length);
    expect(result.features.every((feature) => feature.enabled && feature.source === 'GROUP_DEFAULT')).toBe(true);
  });

  it('resolves hotel override OFF and reset back to group default', async () => {
    const { prisma } = database(); const service = new FeaturesService(prisma, { log: jest.fn() } as any);
    await service.updateHotel('admin-1', 'hotel-1', { banquets: false });
    expect(await service.isEnabled('hotel-1', 'banquets')).toBe(false);
    await service.resetHotel('admin-1', 'hotel-1', 'banquets');
    expect(await service.isEnabled('hotel-1', 'banquets')).toBe(true);
  });

  it('does not write defaults while reading and supports a selected hotel for global read roles', async () => {
    const { prisma } = database(); const service = new FeaturesService(prisma, { log: jest.fn() } as any);
    await service.groupSettings(); await service.forHotel('hotel-1');
    expect(prisma.featureSetting.upsert).not.toHaveBeenCalled();
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'viewer-1', role: 'VIEWER', staffHotelId: null, staffDepartment: null, staffHotel: null });
    const effective = await service.effectiveForActor('viewer-1', 'hotel-1');
    expect(effective.scope).toBe('HOTEL');
  });

  it('rejects unknown keys and non-super-admin updates', async () => {
    const { prisma } = database(); const service = new FeaturesService(prisma, { log: jest.fn() } as any);
    await expect(service.updateGroup('admin-1', { doesNotExist: false })).rejects.toThrow('Unknown feature key');
    prisma.user.findUnique.mockResolvedValueOnce({ id: 'property-1', role: 'ADMIN', staffHotelId: 'hotel-1', staffDepartment: null, staffHotel: { id: 'hotel-1', active: true } });
    await expect(service.updateGroup('property-1', { banquets: false })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('records distinct before and after snapshots for group updates and hotel resets', async () => {
    const { prisma } = database();
    const audit = { log: jest.fn() };
    const service = new FeaturesService(prisma, audit as any);
    await service.updateGroup('admin-1', { banquets: false });
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({
      action: 'GROUP_FEATURE_SETTINGS_UPDATED',
      before: expect.objectContaining({ banquets: true }),
      after: expect.objectContaining({ banquets: false }),
    }));
    await service.updateHotel('admin-1', 'hotel-1', { banquets: false });
    await service.resetHotel('admin-1', 'hotel-1', 'banquets');
    expect(audit.log).toHaveBeenLastCalledWith(expect.objectContaining({
      action: 'HOTEL_FEATURE_OVERRIDE_RESET',
      before: { banquets: { enabled: false, source: 'HOTEL_OVERRIDE' } },
      after: { banquets: { enabled: false, source: 'GROUP_DEFAULT' } },
    }));
  });
});

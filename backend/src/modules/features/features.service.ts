import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { assertActorCanManageHotel, getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { FEATURE_CATALOG, FEATURE_ENFORCEMENT, FEATURE_KEYS, isKnownFeatureKey } from './features.catalog';

type FeatureMap = Record<string, boolean>;

@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly legacyAudit?: AuditService) {}

  private transaction<T>(callback: (db: any) => Promise<T>) { return typeof (this.prisma as any).$transaction === 'function' ? (this.prisma as any).$transaction(callback) : callback(this.prisma); }
  private async audit(db: any, data: any) { if (db.auditLog?.create) return db.auditLog.create({ data }); if (this.legacyAudit) return this.legacyAudit.log(data); return undefined; }

  private validateMap(features: unknown): FeatureMap {
    if (!features || typeof features !== 'object' || Array.isArray(features)) throw new BadRequestException('features must be an object of feature keys and boolean values.');
    const input = features as Record<string, unknown>;
    for (const [key, value] of Object.entries(input)) {
      if (!isKnownFeatureKey(key)) throw new BadRequestException(`Unknown feature key: ${key}`);
      if (typeof value !== 'boolean') throw new BadRequestException(`Feature ${key} must be boolean.`);
    }
    return input as FeatureMap;
  }

  private catalog() { return FEATURE_CATALOG.map(([key, label, group]) => ({ key, label, group, enforcementType: FEATURE_ENFORCEMENT[key as keyof typeof FEATURE_ENFORCEMENT] })); }

  private async groupSettingsFrom(db: any) {
    const rows = await db.featureSetting.findMany({ where: { featureKey: { in: [...FEATURE_KEYS] } } });
    const values = new Map(rows.map((row: any) => [row.featureKey, row.enabled]));
    return { scope: 'GROUP_DEFAULT', features: this.catalog().map((item) => ({ ...item, enabled: values.get(item.key) ?? true, source: 'GROUP_DEFAULT' })) };
  }

  private async hotelSettingsFrom(db: any, hotelId: string) {
    const hotel = await db.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, code: true, active: true } });
    if (!hotel?.active) throw new BadRequestException('Hotel not found.');
    const [defaults, overrides] = await Promise.all([
      db.featureSetting.findMany({ where: { featureKey: { in: [...FEATURE_KEYS] } } }),
      db.hotelFeatureOverride.findMany({ where: { hotelId, featureKey: { in: [...FEATURE_KEYS] } } }),
    ]);
    const defaultMap = new Map(defaults.map((row: any) => [row.featureKey, row.enabled]));
    const overrideMap = new Map(overrides.map((row: any) => [row.featureKey, row.enabled]));
    return { hotel, scope: 'HOTEL', features: this.catalog().map((item) => ({ ...item, enabled: overrideMap.get(item.key) ?? defaultMap.get(item.key) ?? true, source: overrideMap.has(item.key) ? 'HOTEL_OVERRIDE' : 'GROUP_DEFAULT', override: overrideMap.get(item.key) ?? null })) };
  }

  async groupSettings() { return this.groupSettingsFrom(this.prisma); }
  async forHotel(hotelId: string) { return this.hotelSettingsFrom(this.prisma, hotelId); }

  async effectiveForActor(userId: string, requestedHotelId?: string) {
    const scope = await getActorScope(this.prisma, userId);
    const hotelId = scope.isGlobal || scope.hotelId ? resolveRequestedHotel(scope, requestedHotelId) : (requestedHotelId ?? null);
    return hotelId ? this.forHotel(hotelId) : this.groupSettings();
  }

  async isEnabled(hotelId: string | null | undefined, key: string) {
    if (!isKnownFeatureKey(key)) return false;
    const group = await this.prisma.featureSetting.findUnique({ where: { featureKey: key } });
    if (!hotelId) return group?.enabled ?? true;
    const override = await this.prisma.hotelFeatureOverride.findUnique({ where: { hotelId_featureKey: { hotelId, featureKey: key } } });
    return override?.enabled ?? group?.enabled ?? true;
  }

  async updateGroup(userId: string, features: unknown) {
    const scope = await getActorScope(this.prisma, userId);
    if (scope.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only SUPER_ADMIN can update feature settings.');
    const next = this.validateMap(features);
    return this.transaction(async (tx) => {
      const before = await this.groupSettingsFrom(tx);
      const beforeMap = Object.fromEntries(before.features.map((row: any) => [row.key, row.enabled]));
      for (const [featureKey, enabled] of Object.entries(next)) await tx.featureSetting.upsert({ where: { featureKey }, update: { enabled, updatedById: userId }, create: { featureKey, enabled, updatedById: userId } });
      const after = await this.groupSettingsFrom(tx);
      const changedKeys = Object.keys(next).filter((key) => beforeMap[key] !== next[key]);
      const beforeSnapshot = Object.fromEntries(changedKeys.map((key) => [key, beforeMap[key]]));
      const afterSnapshot = Object.fromEntries(changedKeys.map((key) => [key, after.features.find((row: any) => row.key === key)?.enabled]));
      if (changedKeys.length) await this.audit(tx, { actorUserId: userId, action: 'GROUP_FEATURE_SETTINGS_UPDATED', entityType: 'FeatureSetting', before: beforeSnapshot as Prisma.InputJsonValue, after: afterSnapshot as Prisma.InputJsonValue });
      return after;
    });
  }

  async updateHotel(userId: string, hotelId: string, features: unknown) {
    const scope = await getActorScope(this.prisma, userId);
    if (scope.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only SUPER_ADMIN can update hotel feature overrides.');
    await assertActorCanManageHotel(this.prisma, userId, hotelId);
    const next = this.validateMap(features);
    return this.transaction(async (tx) => {
      const before = await this.hotelSettingsFrom(tx, hotelId);
      const beforeMap = Object.fromEntries(before.features.map((row: any) => [row.key, row.enabled]));
      for (const [featureKey, enabled] of Object.entries(next)) await tx.hotelFeatureOverride.upsert({ where: { hotelId_featureKey: { hotelId, featureKey } }, update: { enabled, updatedById: userId }, create: { hotelId, featureKey, enabled, updatedById: userId } });
      const after = await this.hotelSettingsFrom(tx, hotelId);
      const changedKeys = Object.keys(next).filter((key) => beforeMap[key] !== next[key]);
      const beforeSnapshot = Object.fromEntries(changedKeys.map((key) => {
        const row = before.features.find((item: any) => item.key === key);
        return [key, { enabled: row?.enabled, source: row?.source }];
      }));
      const afterSnapshot = Object.fromEntries(changedKeys.map((key) => {
        const row = after.features.find((item: any) => item.key === key);
        return [key, { enabled: row?.enabled, source: row?.source }];
      }));
      if (changedKeys.length) await this.audit(tx, { actorUserId: userId, action: 'HOTEL_FEATURE_OVERRIDE_UPDATED', entityType: 'HotelFeatureOverride', entityId: hotelId, before: beforeSnapshot as Prisma.InputJsonValue, after: afterSnapshot as Prisma.InputJsonValue });
      return after;
    });
  }

  async resetHotel(userId: string, hotelId: string, featureKey: string) {
    const scope = await getActorScope(this.prisma, userId);
    if (scope.role !== 'SUPER_ADMIN') throw new ForbiddenException('Only SUPER_ADMIN can reset hotel feature overrides.');
    await assertActorCanManageHotel(this.prisma, userId, hotelId);
    if (!isKnownFeatureKey(featureKey)) throw new BadRequestException(`Unknown feature key: ${featureKey}`);
    return this.transaction(async (tx) => {
      const existing = await tx.hotelFeatureOverride.findUnique({ where: { hotelId_featureKey: { hotelId, featureKey } } });
      const before = await this.hotelSettingsFrom(tx, hotelId);
      if (existing) {
        if (tx.hotelFeatureOverride.delete) await tx.hotelFeatureOverride.delete({ where: { hotelId_featureKey: { hotelId, featureKey } } });
        else await tx.hotelFeatureOverride.deleteMany({ where: { hotelId, featureKey } });
      }
      const after = await this.hotelSettingsFrom(tx, hotelId);
      if (existing) {
        const afterRow = after.features.find((row: any) => row.key === featureKey);
        const beforeSnapshot = { [featureKey]: { enabled: existing.enabled, source: 'HOTEL_OVERRIDE' } };
        const afterSnapshot = { [featureKey]: { enabled: afterRow?.enabled, source: afterRow?.source } };
        await this.audit(tx, { actorUserId: userId, action: 'HOTEL_FEATURE_OVERRIDE_RESET', entityType: 'HotelFeatureOverride', entityId: hotelId, before: beforeSnapshot as Prisma.InputJsonValue, after: afterSnapshot as Prisma.InputJsonValue });
      }
      return after;
    });
  }
}

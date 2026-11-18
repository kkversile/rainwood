import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Prisma, RateDay } from '@prisma/client';
import { copyRateDay, HOTEL_ID, repairLakeshore, SOURCES } from './repair-lakeshore-rate-master';

test('copies all dated prices, taxes, occupancy, and restrictions without identities', () => {
  const source = { id: 'old-row', ratePlanId: 'old-plan', date: new Date('2026-10-01'), amount: new Prisma.Decimal('4800.10'), baseAmount: null, overrideAmount: new Prisma.Decimal('4700.25'), taxAmount: new Prisma.Decimal('576.01'), childAmount: new Prisma.Decimal(1000), childWithoutBedAmount: new Prisma.Decimal(720), extraAdultAmount: new Prisma.Decimal(1500), occupancyPrices: { single: 4300, double: 4800 }, cta: true, ctd: false, minLos: 2, maxLos: 30, updatedFromAxisAt: new Date('2026-09-01') } as RateDay;
  const copied = copyRateDay(source, 'new-plan');
  const { id, ratePlanId, ...expected } = source;
  assert.deepEqual(copied, { ...expected, ratePlanId: 'new-plan' });
  assert.equal('id' in copied, false);
  assert.equal(source.ratePlanId, ratePlanId);
  assert.equal(source.id, id);
  assert.equal(copyRateDay({ ...source, occupancyPrices: null }, 'new').occupancyPrices, Prisma.DbNull);
});

function fixture(existing = false) {
  const writes: unknown[] = [];
  const masters = SOURCES.map((s) => ({ id: `master-${s.meal}`, code: s.meal, mealPlan: s.meal, kind: 'CANONICAL_MEAL', active: true, name: s.name }));
  const tx = {
    hotel: { findUniqueOrThrow: async () => ({ id: HOTEL_ID, code: 'RW-ALLEPPEY-DEMO', active: true, name: 'Lakeshore' }) },
    user: { findUniqueOrThrow: async () => ({ id: 'admin', role: 'SUPER_ADMIN', active: true }) },
    ratePlan: {
      findUniqueOrThrow: async ({ where }: any) => { const s = SOURCES.find((s) => s.id === where.id)!; return { id: s.id, roomTypeId: s.roomTypeId, mealPlan: s.meal, active: true, roomType: { hotelId: HOTEL_ID, active: true, name: s.meal }, master: { hotelId: HOTEL_ID, kind: 'LEGACY', active: true }, rates: [{ id: 'source-rate', ratePlanId: s.id, date: new Date('2026-10-01'), amount: new Prisma.Decimal(4800), occupancyPrices: null }], _count: { agentCategoryBands: 0, agentCategoryRateDays: 0 } }; },
      findUnique: async ({ where }: any) => existing ? { id: 'existing', masterId: `master-${where.roomTypeId_code.code}`, mealPlan: where.roomTypeId_code.code, active: true } : null,
      create: async ({ data }: any) => { writes.push(data); return { ...data, id: `new-${data.code}` }; },
    },
    ratePlanMaster: { findMany: async ({ where }: any) => masters.filter((m) => m.code === where.OR[0].code) },
    rateDay: { createMany: async (data: unknown) => { writes.push(data); } },
    auditLog: { create: async (data: unknown) => { writes.push(data); } },
  };
  return { tx: tx as unknown as Prisma.TransactionClient, writes, masters };
}

test('preview makes no writes and retains historical validity', async () => {
  const { tx, writes } = fixture();
  const result = await repairLakeshore(tx, false);
  assert.equal(writes.length, 0);
  assert.equal(result.actions.length, 2);
  assert.ok(result.actions.every((a) => a.copiedDays === 1 && a.to === '2026-10-01'));
});
test('existing canonical assignments and their edited prices are never overwritten', async () => {
  const { tx, writes } = fixture(true);
  const result = await repairLakeshore(tx, true);
  assert.equal(writes.length, 0);
  assert.ok(result.actions.every((a) => a.action === 'preserve-existing' && a.copiedDays === 0));
});
test('creates additive assignments and dated rates, with an audit record', async () => {
  const { tx, writes } = fixture();
  await repairLakeshore(tx, true);
  assert.equal(writes.length, 5);
  assert.ok(writes.every((w: any) => !w.axisRatePlanId));
});
test('rejects canonical collisions before any write', async () => {
  const { tx, writes, masters } = fixture();
  masters[1].kind = 'LEGACY';
  await assert.rejects(repairLakeshore(tx, true));
  assert.equal(writes.length, 0);
});

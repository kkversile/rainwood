import assert from 'node:assert/strict';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Prisma, RateDay } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';

// Explicitly scoped additive demo repair. Never reclassify negotiated legacy
// plans, extend their validity, or overwrite an existing canonical assignment.
export const HOTEL_ID = 'cmu8wnks500a65swmdg4mqrfi';
export const SOURCES = [
  { id: 'cmu8wnkun00a95swmxi98bi1b', roomTypeId: 'cmu8wnksz00a75swm9tf74lqy', meal: 'CP', name: 'CP - Breakfast' },
  { id: 'cmucguxgj002rcl2ssl56ic58', roomTypeId: 'cmucgsldo002hcl2s9by6vqyf', meal: 'EP', name: 'EP - Room Only' },
] as const;

export function copyRateDay(row: RateDay, ratePlanId: string): Prisma.RateDayCreateManyInput {
  // Copy every commercial field, including explicit nulls and restrictions.
  const { id: _id, ratePlanId: _sourceId, occupancyPrices, ...fields } = row;
  return { ...fields, ratePlanId, occupancyPrices: occupancyPrices === null ? Prisma.DbNull : occupancyPrices as Prisma.InputJsonValue };
}

export async function repairLakeshore(tx: Prisma.TransactionClient, apply: boolean) {
  const hotel = await tx.hotel.findUniqueOrThrow({ where: { id: HOTEL_ID } });
  assert.equal(hotel.code, 'RW-ALLEPPEY-DEMO', 'Refusing to modify a different hotel.');
  assert.ok(hotel.active, 'Demo hotel must be active.');
  const actor = await tx.user.findUniqueOrThrow({ where: { email: 'admin@rainwood.demo' } });
  assert.equal(actor.role, 'SUPER_ADMIN');
  assert.ok(actor.active);
  // Validate the complete plan before writing anything, even in preview mode.
  const prepared = await Promise.all(SOURCES.map(async (spec) => {
    const source = await tx.ratePlan.findUniqueOrThrow({
      where: { id: spec.id },
      include: { roomType: true, master: true, rates: { orderBy: { date: 'asc' } }, _count: { select: { agentCategoryBands: true, agentCategoryRateDays: true } } },
    });
    assert.equal(source.roomTypeId, spec.roomTypeId);
    assert.equal(source.roomType.hotelId, HOTEL_ID);
    assert.equal(source.master.hotelId, HOTEL_ID);
    assert.equal(source.master.kind, 'LEGACY');
    assert.equal(source.mealPlan, spec.meal);
    assert.ok(source.active && source.roomType.active && source.master.active);
    assert.ok(source.rates.length, 'No authoritative dated rates to copy.');
    assert.equal(source._count.agentCategoryBands + source._count.agentCategoryRateDays, 0, 'Category contracts require a separate commercial review.');
    const candidates = await tx.ratePlanMaster.findMany({ where: { hotelId: HOTEL_ID, OR: [{ code: spec.meal }, { active: true, kind: 'CANONICAL_MEAL', mealPlan: spec.meal }] } });
    assert.ok(candidates.length <= 1, 'Ambiguous canonical master.');
    const master = candidates[0];
    if (master) {
      assert.equal(master.code, spec.meal);
      assert.equal(master.mealPlan, spec.meal);
      assert.equal(master.kind, 'CANONICAL_MEAL');
      assert.ok(master.active);
    }
    const assignment = await tx.ratePlan.findUnique({ where: { roomTypeId_code: { roomTypeId: spec.roomTypeId, code: spec.meal } } });
    if (assignment) {
      assert.ok(master && assignment.masterId === master.id && assignment.active && assignment.mealPlan === spec.meal, 'Conflicting canonical room assignment.');
    }
    return { spec, source, master, assignment };
  }));
  const actions = [];
  for (const item of prepared) {
    const { spec, source } = item;
    let { master, assignment } = item;
    const action = { sourcePlanId: source.id, room: source.roomType.name, mealPlan: spec.meal, action: assignment ? 'preserve-existing' : 'create-assignment', copiedDays: assignment ? 0 : source.rates.length, from: source.rates[0].date.toISOString().slice(0, 10), to: source.rates.at(-1)!.date.toISOString().slice(0, 10), canonicalPlanId: assignment?.id };
    if (apply && !assignment) {
      master ??= await tx.ratePlanMaster.create({ data: { hotelId: HOTEL_ID, code: spec.meal, mealPlan: spec.meal, name: spec.name, kind: 'CANONICAL_MEAL', active: true } });
      assignment = await tx.ratePlan.create({ data: { roomTypeId: spec.roomTypeId, masterId: master.id, code: spec.meal, mealPlan: spec.meal, name: master.name, active: true, description: 'Canonical demo rates copied from existing dated hotel prices; legacy contract retained.' } });
      await tx.rateDay.createMany({ data: source.rates.map((rate) => copyRateDay(rate, assignment!.id)) });
      action.canonicalPlanId = assignment.id;
    }
    actions.push(action);
  }
  if (apply && actions.some((action) => action.action === 'create-assignment')) {
    await tx.auditLog.create({ data: { actorUserId: actor.id, action: 'REPAIR_LAKESHORE_CANONICAL_DEMO_RATES', entityType: 'Hotel', entityId: HOTEL_ID, after: actions } });
  }
  return { hotel: hotel.name, apply, actions };
}

async function main() {
  config({ path: join(__dirname, '../.env'), quiet: true });
  const prisma = new PrismaService();
  try {
    const result = await prisma.$transaction((tx) => repairLakeshore(tx, process.argv.includes('--apply')), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.onModuleDestroy(); }
}

if (require.main === module) void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });

import assert from 'node:assert/strict';
import { join } from 'node:path';
import { config } from 'dotenv';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';
import { HOTEL_ID } from './repair-lakeshore-rate-master';

// User-authorized current demo tariffs. Do not extend or modify legacy contracts.
const FROM = '2026-11-18';
const TO = '2027-03-17';
const ROOM_ID = 'cmucgsldo002hcl2s9by6vqyf';
const occupancyPrices = { single: 4200, double: 4800, triple: 6200, quad: 7200 };

async function main() {
  config({ path: join(__dirname, '../.env'), quiet: true });
  const prisma = new PrismaService();
  const apply = process.argv.includes('--apply');
  try {
    const result = await prisma.$transaction(async (tx) => {
      const hotel = await tx.hotel.findUniqueOrThrow({ where: { id: HOTEL_ID } });
      assert.equal(hotel.code, 'RW-ALLEPPEY-DEMO');
      assert.ok(hotel.active);
      const actor = await tx.user.findUniqueOrThrow({ where: { email: 'admin@rainwood.demo' } });
      assert.ok(actor.active && actor.role === 'SUPER_ADMIN');
      const plan = await tx.ratePlan.findUniqueOrThrow({ where: { roomTypeId_code: { roomTypeId: ROOM_ID, code: 'EP' } }, include: { roomType: true, master: true } });
      assert.equal(plan.roomType.hotelId, HOTEL_ID);
      assert.equal(plan.master.hotelId, HOTEL_ID);
      assert.equal(plan.master.kind, 'CANONICAL_MEAL');
      assert.equal(plan.master.mealPlan, 'EP');
      assert.equal(plan.mealPlan, 'EP');
      assert.ok(plan.active && plan.roomType.active && plan.master.active);
      const existing = await tx.rateDay.findMany({ where: { ratePlanId: plan.id, date: { gte: new Date(FROM), lte: new Date(TO) } }, select: { date: true } });
      const occupied = new Set(existing.map((row) => row.date.toISOString().slice(0, 10)));
      const dates: Date[] = [];
      for (let time = Date.parse(FROM); time <= Date.parse(TO); time += 86400000) {
        const date = new Date(time);
        if (!occupied.has(date.toISOString().slice(0, 10))) dates.push(date);
      }
      const summary = { hotel: hotel.name, room: plan.roomType.name, planId: plan.id, mealPlan: 'EP', from: FROM, to: TO, apply, newDays: dates.length, preservedExistingDays: existing.length, occupancyPrices, extraAdult: 900, childWithBed: 600, childWithoutBed: 0, rackDoubleTax: 576 };
      if (apply && dates.length) {
        await tx.rateDay.createMany({ data: dates.map((date) => ({
          ratePlanId: plan.id, date, amount: 4800, baseAmount: 4800,
          // Historical tariff implies 12%; tax is normalized to the double rack.
          taxAmount: 576, childAmount: 600, childWithoutBedAmount: 0,
          extraAdultAmount: 900, occupancyPrices, cta: false, ctd: false, minLos: 1,
        })) });
        await tx.auditLog.create({ data: { actorUserId: actor.id, action: 'SEED_LAKESHORE_GARDEN_CURRENT_DEMO_RATES', entityType: 'RatePlan', entityId: plan.id, after: summary } });
      }
      return summary;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await prisma.onModuleDestroy(); }
}

void main().catch((error: Error) => { console.error(error.message); process.exitCode = 1; });

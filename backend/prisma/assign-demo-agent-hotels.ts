import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? '';
const requiresTls = /(?:\?|&)sslmode=require(?:&|$)/i.test(connectionString);
const pool = new Pool({ connectionString, ...(requiresTls ? { ssl: { rejectUnauthorized: true } } : {}) });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const today = new Date();
today.setUTCHours(0, 0, 0, 0);

const demoHotels = [
  {
    code: 'RW-MUNNAR-DEMO',
    slug: 'rainwood-misty-hills-munnar',
    name: 'RainWood Misty Hills Munnar',
    city: 'Munnar',
    roomCode: 'DMR',
    roomName: 'Misty Deluxe Room',
    roomDescription: 'A comfortable demo room overlooking the Munnar hills.',
    planCode: 'MUNNAR-PARTNER',
    planName: 'Munnar Partner Rate',
    amount: 5200,
    taxAmount: 624,
  },
  {
    code: 'RW-ALLEPPEY-DEMO',
    slug: 'rainwood-lakeshore-alleppey',
    name: 'RainWood Lakeshore Alleppey',
    city: 'Alleppey',
    roomCode: 'DLR',
    roomName: 'Lakeshore Deluxe Room',
    roomDescription: 'A calm demo room close to the Alleppey backwaters.',
    planCode: 'ALLEPPEY-PARTNER',
    planName: 'Alleppey Partner Rate',
    amount: 4800,
    taxAmount: 576,
  },
] as const;

async function main() {
  const agent = await prisma.user.findUniqueOrThrow({ where: { email: 'agent@rainwood.demo' }, select: { id: true, email: true } });
  const created: { hotel: string; ratePlanId: string }[] = [];

  for (const item of demoHotels) {
    const hotel = await prisma.hotel.upsert({
      where: { code: item.code },
      update: { active: true, name: item.name, slug: item.slug, city: item.city, description: `${item.name} is a development demo property for agent hotel assignment.`, seoTitle: `${item.name} | RainWood Hotels`, seoDescription: `Development demo listing for ${item.name}.`, canonicalPath: `/hotels/${item.slug}` },
      create: { code: item.code, name: item.name, slug: item.slug, city: item.city, description: `${item.name} is a development demo property for agent hotel assignment.`, seoTitle: `${item.name} | RainWood Hotels`, seoDescription: `Development demo listing for ${item.name}.`, canonicalPath: `/hotels/${item.slug}` },
    });
    const room = await prisma.roomType.upsert({
      where: { hotelId_code: { hotelId: hotel.id, code: item.roomCode } },
      update: { active: true, name: item.roomName, description: item.roomDescription, roomsAvailable: 10, maxAdults: 3, maxChildren: 2, maxOccupancy: 4, breakfastIncluded: true },
      create: { hotelId: hotel.id, code: item.roomCode, name: item.roomName, description: item.roomDescription, roomsAvailable: 10, maxAdults: 3, maxChildren: 2, maxOccupancy: 4, breakfastIncluded: true },
    });
    const master = await prisma.ratePlanMaster.upsert({
      where: { hotelId_code: { hotelId: hotel.id, code: item.planCode } },
      update: { active: true, name: item.planName, mealPlan: 'CP', description: 'Development demo partner rate with breakfast.' },
      create: { hotelId: hotel.id, code: item.planCode, name: item.planName, mealPlan: 'CP', description: 'Development demo partner rate with breakfast.' },
    });
    const ratePlan = await prisma.ratePlan.upsert({
      where: { roomTypeId_masterId: { roomTypeId: room.id, masterId: master.id } },
      update: { active: true, code: item.planCode, name: item.planName, mealPlan: 'CP', description: master.description, axisRatePlanId: `${item.code}-RATE` },
      create: { roomTypeId: room.id, masterId: master.id, code: item.planCode, name: item.planName, mealPlan: 'CP', description: master.description, axisRatePlanId: `${item.code}-RATE` },
    });
    await prisma.hotelImage.upsert({ where: { id: `${item.code}-hotel-image` }, update: { hotelId: hotel.id, url: '/rainwood-placeholder.svg', altText: `${item.name} demo property`, published: true }, create: { id: `${item.code}-hotel-image`, hotelId: hotel.id, url: '/rainwood-placeholder.svg', altText: `${item.name} demo property`, published: true } });
    await prisma.roomImage.upsert({ where: { id: `${item.code}-room-image` }, update: { roomTypeId: room.id, url: '/rainwood-placeholder.svg', altText: item.roomName, published: true }, create: { id: `${item.code}-room-image`, roomTypeId: room.id, url: '/rainwood-placeholder.svg', altText: item.roomName, published: true } });
    await prisma.cancellationRule.upsert({ where: { hotelId_ratePlanId_type: { hotelId: hotel.id, ratePlanId: ratePlan.id, type: 'FREE_CANCELLATION' } }, update: { cutoffHours: 48, value: 0, active: true }, create: { hotelId: hotel.id, ratePlanId: ratePlan.id, type: 'FREE_CANCELLATION', cutoffHours: 48, value: 0 } });
    await prisma.agentRatePlan.upsert({ where: { agentId_ratePlanId: { agentId: agent.id, ratePlanId: ratePlan.id } }, update: { active: true }, create: { agentId: agent.id, ratePlanId: ratePlan.id, active: true } });
    for (let offset = 0; offset < 180; offset += 1) {
      const date = new Date(today.getTime() + offset * 86_400_000);
      await prisma.inventoryDay.upsert({ where: { roomTypeId_date: { roomTypeId: room.id, date } }, update: { available: 10, stopSell: false }, create: { roomTypeId: room.id, date, available: 10 } });
      await prisma.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: ratePlan.id, date } }, update: { amount: item.amount, taxAmount: item.taxAmount, childAmount: 1000, extraAdultAmount: 1500, occupancyPrices: { single: item.amount - 500, double: item.amount, triple: item.amount + 1000, quad: item.amount + 2000 }, minLos: 1, maxLos: 30 }, create: { ratePlanId: ratePlan.id, date, amount: item.amount, taxAmount: item.taxAmount, childAmount: 1000, extraAdultAmount: 1500, occupancyPrices: { single: item.amount - 500, double: item.amount, triple: item.amount + 1000, quad: item.amount + 2000 }, minLos: 1, maxLos: 30 } });
    }
    created.push({ hotel: hotel.name, ratePlanId: ratePlan.id });
  }

  console.log(JSON.stringify({ agent: agent.email, assignedHotels: created }, null, 2));
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });

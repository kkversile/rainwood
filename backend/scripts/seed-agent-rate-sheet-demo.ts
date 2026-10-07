import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { AgentRateSheetRenderer } from '../src/modules/agent-rate-slabs/agent-rate-sheet-renderer';

const VALID_FROM = '2026-10-01';
const VALID_TO = '2027-03-31';
const ROOM_TAX_RATE = 0.12;
const SLAB_CODE = 'SLAB-DEMO-SOURCE-2026-27';
const SOURCE_FILE = 'COR-SEASON RATES2 6-27.html';

type SourceSupplement = { name: string; startDate: string; endDate: string; amount: number };
type SourceRoom = { name: string; cp: number; map: number };
type SourceHotel = {
  destination: string;
  code: string;
  slug: string;
  name: string;
  city: string;
  description: string;
  link: string;
  rooms: SourceRoom[];
  extras: { adult: number; childWithBed: number; childWithoutBed: number };
  supplements: SourceSupplement[];
  inclusions: string[];
  bank: { accountName: string; bankName: string; branch: string; accountNumber: string; ifsc: string; accountType: string };
};

// Audited from COR-SEASON RATES2 6-27.html. The downloaded HTML is intentionally
// not deployed; this audited fixture makes the seed reproducible on the server.
const SOURCE_HOTELS: SourceHotel[] = [
  {
    destination: 'Thekkady', code: 'RW-DEMO-CASA-BELLA-THEKKADY', slug: 'casa-bella-thekkady', name: 'Casa Bella Thekkady', city: 'Thekkady',
    description: 'Sanctuary where time stands still, offering simplicity and natural beauty.', link: 'https://rainwoodhotels.com/hotels/casa-bella-thekkady/',
    rooms: [{ name: 'Premium Cottage', cp: 5000, map: 6700 }, { name: 'Duplex Cottage (For 4 Pax)', cp: 9500, map: 12900 }],
    extras: { adult: 1500, childWithBed: 1000, childWithoutBed: 800 },
    supplements: [
      { name: 'Diwali Hike (05 Nov 2026 - 15 Nov 2026)', startDate: '2026-11-05', endDate: '2026-11-15', amount: 1000 },
      { name: 'Peak Season Hike (20 Dec 2026 - 05 Jan 2027)', startDate: '2026-12-20', endDate: '2027-01-05', amount: 1500 },
    ],
    inclusions: ['Welcome Drink', 'Swimming Pool (Till 6:30 PM)', 'WiFi Access', 'Parking'],
    bank: { accountName: 'Rain Wood Hotels', bankName: 'ICICI Bank', branch: 'Ravipuram Branch, Ernakulam', accountNumber: '1162-0500-0866', ifsc: 'ICIC0001162', accountType: 'Current Account' },
  },
  {
    destination: 'Thekkady', code: 'RW-DEMO-THE-PATIO-THEKKADY', slug: 'the-patio-thekkady', name: 'The Patio Thekkady', city: 'Thekkady',
    description: 'Exquisite resort near Periyar Wildlife Sanctuary offering serenity and natural beauty.', link: 'https://rainwoodhotels.com/hotels/the-patio-thekkady/',
    rooms: [{ name: 'Deluxe Room', cp: 3000, map: 4300 }, { name: 'Deluxe AC', cp: 3700, map: 5000 }, { name: 'Suite Room AC', cp: 4500, map: 5800 }],
    extras: { adult: 1000, childWithBed: 800, childWithoutBed: 500 },
    supplements: [
      { name: 'Diwali Hike (05 Nov 2026 - 15 Nov 2026)', startDate: '2026-11-05', endDate: '2026-11-15', amount: 500 },
      { name: 'Peak Season Hike (20 Dec 2026 - 05 Jan 2027)', startDate: '2026-12-20', endDate: '2027-01-05', amount: 1000 },
    ],
    inclusions: ['Welcome Drink', 'WiFi Access', 'Parking'],
    bank: { accountName: 'The Patio', bankName: 'SBI', branch: 'SBI Kumily', accountNumber: '3859-9911-464', ifsc: 'SBIN0070132', accountType: 'Current Account' },
  },
];

const connectionString = process.env.DATABASE_URL ?? '';
const requiresTls = /(?:\?|&)sslmode=require(?:&|$)/i.test(connectionString);
const pool = new Pool({ connectionString, ...(requiresTls ? { ssl: { rejectUnauthorized: true } } : {}) });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function date(value: string) { return new Date(`${value}T00:00:00.000Z`); }
function masked(value: string) { return value.length < 5 ? '****' : `${value.slice(0, 2)}****${value.slice(-2)}`; }
function formattedMoney(value: number) { return `INR ${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function money(value: unknown) {
  const match = String(value ?? '').match(/(?:â‚¹|₹)\s*([0-9][0-9,]*)/);
  return match ? Number(match[1].replace(/,/g, '')) : null;
}
function normalizeRoomName(value: string) {
  return String(value).replace(/(?:🔑|ðŸ|â).*$/u, '').replace(/[\s-]*\d+\s*$/u, '').replace(/\s+/g, ' ').trim();
}
function parseSourceHtml(filePath: string): SourceHotel[] {
  const html = fs.readFileSync(filePath, 'utf8');
  const start = html.indexOf('const hotelsData =');
  const listener = html.indexOf('document.addEventListener', start);
  const end = html.lastIndexOf('};', listener);
  if (start < 0 || listener < 0 || end < 0) throw new Error(`Could not locate hotelsData in ${filePath}`);
  const objectSource = html.slice(start + 'const hotelsData ='.length, end + 1)
    .replace(/]\s*(?=(?:cochin|munnar|thekkady|alleppey|houseboat|kovalam|masanagudi|vagamon|ramakkalmedu):)/g, '],');
  const data = vm.runInNewContext(`(${objectSource})`) as Record<string, any[]>;
  const selected = ['Casa Bella Thekkady', 'The Patio Thekkady'];
  return selected.map((name) => {
    const raw = Object.values(data).flat().find((item) => item.name === name);
    if (!raw) throw new Error(`Source hotel not found: ${name}`);
    const sourceSupplements = (raw.supplementary ?? []).map((item: any) => `${item.item} ${item.details ?? ''}`);
    const supplements: SourceSupplement[] = [];
    for (const text of sourceSupplements) {
      const amountMatches = [...text.matchAll(/(?:â‚¹|₹)\s*([0-9][0-9,]*)/g)];
      if (/Diwali/i.test(text)) supplements.push({ name: 'Diwali Hike (05 Nov 2026 - 15 Nov 2026)', startDate: '2026-11-05', endDate: '2026-11-15', amount: Number(amountMatches.at(-1)?.[1]?.replace(/,/g, '') ?? 0) });
      if (/Peak/i.test(text)) supplements.push({ name: 'Peak Season Hike (20 Dec 2026 - 05 Jan 2027)', startDate: '2026-12-20', endDate: '2027-01-05', amount: Number(amountMatches.at(-1)?.[1]?.replace(/,/g, '') ?? 0) });
    }
    const extras = Object.fromEntries((raw.extras ?? []).map((item: any) => [String(item.type).toLowerCase().includes('adult') ? 'adult' : String(item.type).toLowerCase().includes('without') ? 'childWithoutBed' : 'childWithBed', money(item.cpai)]));
    return {
      destination: raw.location, code: '', slug: '', name: raw.name, city: raw.location, description: raw.description, link: raw.link,
      rooms: (raw.rates ?? []).map((item: any) => ({ name: normalizeRoomName(item.category), cp: money(item.cpai) ?? 0, map: money(item.map) ?? 0 })),
      extras: { adult: Number(extras.adult ?? 0), childWithBed: Number(extras.childWithBed ?? 0), childWithoutBed: Number(extras.childWithoutBed ?? 0) }, supplements,
      inclusions: (raw.inclusions ?? []).map((item: any) => String(item.item).replace(/[ðâ].*?/u, '').trim()).filter(Boolean),
      bank: { accountName: raw.bank.name, bankName: raw.bank.bankName, branch: raw.bank.branch, accountNumber: raw.bank.account, ifsc: raw.bank.ifsc, accountType: raw.bank.type },
    };
  });
}
function assertSourceFixture(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const parsed = parseSourceHtml(filePath);
  for (const expected of SOURCE_HOTELS) {
    const actual = parsed.find((item) => item.name === expected.name);
    if (!actual || JSON.stringify({ rooms: actual.rooms, extras: actual.extras, supplements: actual.supplements }) !== JSON.stringify({ rooms: expected.rooms, extras: expected.extras, supplements: expected.supplements })) {
      throw new Error(`Source audit mismatch for ${expected.name}; refusing to seed unverified values.`);
    }
  }
}

async function upsertHotel(source: SourceHotel) {
  const existing = await prisma.hotel.findFirst({ where: { OR: [{ name: { equals: source.name, mode: 'insensitive' } }, { slug: source.slug }] } });
  const hotel = existing
    ? await prisma.hotel.update({ where: { id: existing.id }, data: { active: true, city: source.city, canonicalPath: new URL(source.link).pathname.replace(/\/$/, ''), description: existing.description || source.description } })
    : await prisma.hotel.create({ data: { code: source.code, slug: source.slug, name: source.name, city: source.city, description: source.description, canonicalPath: new URL(source.link).pathname.replace(/\/$/, ''), active: true } });

  const amenityValues = source.inclusions.filter((item) => /WiFi|Parking|Swimming Pool|Welcome Drink/i.test(item)).map((item) => {
    if (/WiFi/i.test(item)) return ['WIFI', 'High-speed Wi-Fi'];
    if (/Parking/i.test(item)) return ['PARKING', 'On-site parking'];
    if (/Swimming/i.test(item)) return ['SWIMMING_POOL', item];
    return ['WELCOME_DRINK', item];
  });
  for (const [code, name] of amenityValues) {
    const amenity = await prisma.amenity.upsert({ where: { code }, update: { name }, create: { code, name } });
    await prisma.hotelAmenity.upsert({ where: { hotelId_amenityId: { hotelId: hotel.id, amenityId: amenity.id } }, update: { active: true }, create: { hotelId: hotel.id, amenityId: amenity.id, active: true } });
  }
  await prisma.hotelPolicy.upsert({ where: { hotelId: hotel.id }, update: {}, create: { hotelId: hotel.id, houseRules: 'Subject to property availability and the published seasonal contract terms.' } });
  const masters: Record<string, any> = {};
  for (const item of [{ code: 'CP', name: 'CP - Breakfast', description: 'Room with breakfast included.' }, { code: 'MAP', name: 'MAP - Breakfast + Dinner', description: 'Room with breakfast and dinner included.' }]) {
    masters[item.code] = await prisma.ratePlanMaster.upsert({ where: { hotelId_code: { hotelId: hotel.id, code: item.code } }, update: { active: true, name: item.name, mealPlan: item.code, kind: 'CANONICAL_MEAL', description: item.description }, create: { hotelId: hotel.id, code: item.code, name: item.name, mealPlan: item.code, kind: 'CANONICAL_MEAL', description: item.description } });
  }
  const roomPlans: { room: any; cp: any; map: any; source: SourceRoom }[] = [];
  for (let index = 0; index < source.rooms.length; index += 1) {
    const sourceRoom = source.rooms[index];
    const code = `SRC-${String(index + 1).padStart(2, '0')}`;
    const room = await prisma.roomType.upsert({ where: { hotelId_code: { hotelId: hotel.id, code } }, update: { name: sourceRoom.name, active: true, roomsAvailable: 3, maxAdults: /4 Pax/i.test(sourceRoom.name) ? 4 : 2, maxChildren: 2, maxOccupancy: /4 Pax/i.test(sourceRoom.name) ? 4 : 3, acAvailable: /AC|Suite|Cottage/i.test(sourceRoom.name) }, create: { hotelId: hotel.id, code, name: sourceRoom.name, roomsAvailable: 3, maxAdults: /4 Pax/i.test(sourceRoom.name) ? 4 : 2, maxChildren: 2, maxOccupancy: /4 Pax/i.test(sourceRoom.name) ? 4 : 3, acAvailable: /AC|Suite|Cottage/i.test(sourceRoom.name) } });
    const cp = await prisma.ratePlan.upsert({ where: { roomTypeId_masterId: { roomTypeId: room.id, masterId: masters.CP.id } }, update: { active: true, code: 'CP', name: masters.CP.name, mealPlan: 'CP', description: masters.CP.description }, create: { roomTypeId: room.id, masterId: masters.CP.id, code: 'CP', name: masters.CP.name, mealPlan: 'CP', description: masters.CP.description } });
    const map = await prisma.ratePlan.upsert({ where: { roomTypeId_masterId: { roomTypeId: room.id, masterId: masters.MAP.id } }, update: { active: true, code: 'MAP', name: masters.MAP.name, mealPlan: 'MAP', description: masters.MAP.description }, create: { roomTypeId: room.id, masterId: masters.MAP.id, code: 'MAP', name: masters.MAP.name, mealPlan: 'MAP', description: masters.MAP.description } });
    roomPlans.push({ room, cp, map, source: sourceRoom });
    for (let cursor = date(VALID_FROM); cursor <= date(VALID_TO); cursor = new Date(cursor.getTime() + 86_400_000)) {
      const day = new Date(cursor);
      await prisma.inventoryDay.upsert({ where: { roomTypeId_date: { roomTypeId: room.id, date: day } }, update: { available: 3, stopSell: false }, create: { roomTypeId: room.id, date: day, available: 3, stopSell: false } });
      for (const [plan, amount] of [[cp, sourceRoom.cp], [map, sourceRoom.map]] as const) await prisma.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: plan.id, date: day } }, update: { amount, baseAmount: amount, taxAmount: Math.round(amount * ROOM_TAX_RATE * 100) / 100, minLos: 1, maxLos: 30 }, create: { ratePlanId: plan.id, date: day, amount, baseAmount: amount, taxAmount: Math.round(amount * ROOM_TAX_RATE * 100) / 100, minLos: 1, maxLos: 30 } });
    }
  }
  for (const supplement of source.supplements) {
    const existingCharge = await prisma.hotelSupplementaryCharge.findFirst({ where: { hotelId: hotel.id, name: supplement.name, startDate: date(supplement.startDate), endDate: date(supplement.endDate) } });
    if (existingCharge) await prisma.hotelSupplementaryCharge.update({ where: { id: existingCharge.id }, data: { amountPerRoomNight: supplement.amount, scope: 'AGENTS', active: true } });
    else await prisma.hotelSupplementaryCharge.create({ data: { hotelId: hotel.id, name: supplement.name, startDate: date(supplement.startDate), endDate: date(supplement.endDate), amountPerRoomNight: supplement.amount, scope: 'AGENTS', active: true } });
  }
  const existingBank = await prisma.hotelBankAccount.findFirst({ where: { hotelId: hotel.id, accountNumber: source.bank.accountNumber } });
  if (existingBank) await prisma.hotelBankAccount.update({ where: { id: existingBank.id }, data: { accountName: source.bank.accountName, bankName: source.bank.bankName, branch: source.bank.branch, ifsc: source.bank.ifsc, accountType: source.bank.accountType, active: true, displayOnAgentRateSheet: true } });
  else await prisma.hotelBankAccount.create({ data: { hotelId: hotel.id, ...source.bank, displayOnAgentRateSheet: true, active: true } });
  return { hotel, roomPlans };
}

async function main() {
  const sourcePath = path.resolve(__dirname, '../..', SOURCE_FILE);
  assertSourceFixture(sourcePath);
  const sourceRecords = [] as { source: SourceHotel; hotel: any; roomPlans: { room: any; cp: any; map: any; source: SourceRoom }[] }[];
  for (const source of SOURCE_HOTELS) sourceRecords.push({ source, ...(await upsertHotel(source)) });
  const admin = await prisma.user.findFirst({ where: { role: 'SUPER_ADMIN', active: true }, orderBy: { createdAt: 'asc' } });
  if (!admin) throw new Error('No active SUPER_ADMIN exists; refusing to create demo contract without an owner.');
  const slabExisting = await prisma.agentRateSlab.findUnique({ where: { code_version: { code: SLAB_CODE, version: 1 } }, include: { rates: true } });
  let slab = slabExisting ?? await prisma.agentRateSlab.create({ data: { code: SLAB_CODE, name: '2026-27 Seasonal Contract', description: 'Audited source rates from COR-SEASON RATES2 6-27.html. Contract amounts are before statutory tax.', validFrom: date(VALID_FROM), validTo: date(VALID_TO), version: 1, status: 'DRAFT', active: true, createdById: admin.id, updatedById: admin.id } });
  const expectedRates = sourceRecords.flatMap(({ roomPlans, source }) => roomPlans.flatMap(({ cp, map, source: room }) => [
    { ratePlanId: cp.id, amount: room.cp, extras: source.extras }, { ratePlanId: map.id, amount: room.map, extras: source.extras },
  ]));
  if (slab.status === 'PUBLISHED') {
    const matches = expectedRates.every((expected) => slab.rates.some((actual) => actual.ratePlanId === expected.ratePlanId && Number(actual.amount) === expected.amount && Number(actual.extraAdultAmount) === expected.extras.adult && Number(actual.extraChildWithBedAmount) === expected.extras.childWithBed && Number(actual.childWithoutBedAmount) === expected.extras.childWithoutBed));
    if (!matches || slab.rates.length !== expectedRates.length) throw new Error(`Published ${SLAB_CODE} does not match the audited source; refusing to mutate it.`);
  } else {
    await prisma.agentRateSlabRate.deleteMany({ where: { slabId: slab.id } });
    const rows = sourceRecords.flatMap(({ roomPlans, source }) => roomPlans.flatMap(({ cp, map, source: room }) => [
      { slabId: slab.id, ratePlanId: cp.id, validFrom: date(VALID_FROM), validTo: date(VALID_TO), amount: room.cp, extraAdultAmount: source.extras.adult, extraChildWithBedAmount: source.extras.childWithBed, childWithoutBedAmount: source.extras.childWithoutBed, active: true },
      { slabId: slab.id, ratePlanId: map.id, validFrom: date(VALID_FROM), validTo: date(VALID_TO), amount: room.map, extraAdultAmount: source.extras.adult, extraChildWithBedAmount: source.extras.childWithBed, childWithoutBedAmount: source.extras.childWithoutBed, active: true },
    ]));
    await prisma.agentRateSlabRate.createMany({ data: rows });
    slab = await prisma.agentRateSlab.update({ where: { id: slab.id }, data: { status: 'PUBLISHED', active: true, updatedById: admin.id }, include: { rates: true } });
  }
  const candidates = await prisma.user.findMany({ where: { role: 'AGENT', active: true, email: { in: ['agent@rainwood.demo', 'munnar.agent@rainwood.demo', 'south.agent@rainwood.demo'] } }, orderBy: { email: 'asc' } });
  const existingAssignment = await prisma.agentRateSlabAssignment.findFirst({ where: { slabId: slab.id, active: true }, include: { agent: true } });
  let agent: (typeof candidates)[number] | undefined = existingAssignment?.agent;
  if (!agent) {
    for (const candidate of candidates) {
      const overlap = await prisma.agentRateSlabAssignment.findFirst({ where: { agentId: candidate.id, active: true, validFrom: { lte: date(VALID_TO) }, validTo: { gte: date(VALID_FROM) } } });
      if (!overlap) { agent = candidate; break; }
    }
  }
  if (!agent) throw new Error('No existing demo Agent account found; refusing to create a new commercial account.');
  const assignment = await prisma.agentRateSlabAssignment.findFirst({ where: { agentId: agent.id, slabId: slab.id, validFrom: date(VALID_FROM) } });
  if (!assignment) {
    await prisma.agentRateSlabAssignment.create({ data: { agentId: agent.id, slabId: slab.id, validFrom: date(VALID_FROM), validTo: date(VALID_TO), active: true, createdById: admin.id } });
  }
  // Seed the canonical Agent -> Hotel -> Category path alongside the legacy
  // slab so the demo exercises precedence, dated mappings, and guest supplements.
  for (const { source, hotel, roomPlans } of sourceRecords) {
    await prisma.agentHotelRateCategoryAssignment.upsert({
      where: { agentId_hotelId_validFrom: { agentId: agent.id, hotelId: hotel.id, validFrom: date(VALID_FROM) } },
      update: { category: 'B', validTo: date(VALID_TO), active: true, updatedById: admin.id },
      create: { agentId: agent.id, hotelId: hotel.id, category: 'B', validFrom: date(VALID_FROM), validTo: date(VALID_TO), active: true, createdById: admin.id, updatedById: admin.id },
    });
    for (const { cp, map, source } of roomPlans) {
      for (const [plan, amount] of [[cp, source.cp], [map, source.map]] as const) {
        await prisma.agentCategoryRateBand.upsert({
          where: { ratePlanId_validFrom_validTo: { ratePlanId: plan.id, validFrom: date(VALID_FROM), validTo: date(VALID_TO) } },
          update: { categoryAAmount: amount * 1.15, categoryBAmount: amount * 1.05, categoryCAmount: amount, categoryDAmount: amount * 0.95, categoryEAmount: amount * 0.9, active: true, updatedById: admin.id },
          create: { ratePlanId: plan.id, validFrom: date(VALID_FROM), validTo: date(VALID_TO), categoryAAmount: amount * 1.15, categoryBAmount: amount * 1.05, categoryCAmount: amount, categoryDAmount: amount * 0.95, categoryEAmount: amount * 0.9, active: true, createdById: admin.id, updatedById: admin.id },
        });
      }
    }
    for (const [mealPlan, extras] of [['CP', source.extras], ['MAP', source.extras]] as const) {
      await prisma.mealPlanGuestSupplementBand.upsert({
        where: { hotelId_mealPlan_validFrom_validTo: { hotelId: hotel.id, mealPlan, validFrom: date(VALID_FROM), validTo: date(VALID_TO) } },
        update: { extraAdultAmount: extras.adult, childWithBedAmount: extras.childWithBed, childWithoutBedAmount: extras.childWithoutBed, active: true, updatedById: admin.id },
        create: { hotelId: hotel.id, mealPlan, validFrom: date(VALID_FROM), validTo: date(VALID_TO), extraAdultAmount: extras.adult, childWithBedAmount: extras.childWithBed, childWithoutBedAmount: extras.childWithoutBed, active: true, createdById: admin.id, updatedById: admin.id },
      });
    }
  }
  const stored = await prisma.agentRateSlabRate.findMany({ where: { slabId: slab.id }, include: { ratePlan: { include: { roomType: { include: { hotel: true } }, master: true } } }, orderBy: { ratePlanId: 'asc' } });
  const commercialMismatches = expectedRates.filter((expected) => !stored.some((actual) => actual.ratePlanId === expected.ratePlanId && Number(actual.amount) === expected.amount));
  const supplementMismatches: string[] = [];
  const bankMismatches: string[] = [];
  const hotelsSnapshot = [] as any[];
  for (const { source, hotel } of sourceRecords) {
    const supplements = await prisma.hotelSupplementaryCharge.findMany({ where: { hotelId: hotel.id, active: true, scope: 'AGENTS' }, orderBy: { startDate: 'asc' } });
    for (const expected of source.supplements) if (!supplements.some((actual) => actual.name === expected.name && actual.startDate.getTime() === date(expected.startDate).getTime() && actual.endDate.getTime() === date(expected.endDate).getTime() && Number(actual.amountPerRoomNight) === expected.amount)) supplementMismatches.push(`${source.name}:${expected.name}`);
    const bank = await prisma.hotelBankAccount.findFirst({ where: { hotelId: hotel.id, active: true, displayOnAgentRateSheet: true }, orderBy: { createdAt: 'asc' } });
    if (!bank || bank.accountName !== source.bank.accountName || bank.bankName !== source.bank.bankName || bank.branch !== source.bank.branch || bank.accountNumber !== source.bank.accountNumber || bank.ifsc !== source.bank.ifsc || bank.accountType !== source.bank.accountType) bankMismatches.push(source.name);
    const rooms = source.rooms.map((room) => {
      const storedRoom = stored.filter((item) => item.ratePlan.roomType.hotelId === hotel.id && item.ratePlan.roomType.name === room.name);
      return { name: room.name, rates: storedRoom.map((item) => ({ id: item.id, mealPlan: item.ratePlan.mealPlan, code: item.ratePlan.master.code, name: item.ratePlan.master.name, ratePlanId: item.ratePlanId, validFrom: VALID_FROM, validTo: VALID_TO, amount: Number(item.amount), extraAdultAmount: Number(item.extraAdultAmount), extraChildWithBedAmount: Number(item.extraChildWithBedAmount), childWithoutBedAmount: Number(item.childWithoutBedAmount), occupancyPrices: null })) };
    });
    hotelsSnapshot.push({ name: hotel.name, city: hotel.city, description: hotel.description, canonicalLink: hotel.canonicalPath, rooms, supplements: supplements.map((item) => ({ name: item.name, startDate: item.startDate.toISOString().slice(0, 10), endDate: item.endDate.toISOString().slice(0, 10), amountPerRoomNight: Number(item.amountPerRoomNight), scope: item.scope })), inclusions: 'CP — Breakfast included; MAP — Breakfast + Dinner. Configured property amenities: ' + source.inclusions.join(', '), guidelines: 'Subject to property availability and the published booking terms.', bankAccounts: bank ? [{ accountName: bank.accountName, bankName: bank.bankName, branch: bank.branch, accountNumber: bank.accountNumber, ifsc: bank.ifsc, accountType: bank.accountType }] : [] });
  }
  const generatedHtml = new AgentRateSheetRenderer().render({ agent: { name: agent.name, email: agent.email }, slab: { code: slab.code, name: slab.name, version: slab.version, validFrom: VALID_FROM, validTo: VALID_TO }, hotels: hotelsSnapshot });
  const sheetMismatches = sourceRecords.flatMap(({ source }) => [source.name, ...source.rooms.flatMap((room) => [room.name, formattedMoney(room.cp), formattedMoney(room.map)]), ...source.supplements.map((item) => item.name), VALID_FROM, VALID_TO]).filter((needle) => !generatedHtml.includes(needle));
  const summary = sourceRecords.map(({ source, hotel, roomPlans }) => ({ hotel: hotel.name, rooms: roomPlans.length, rateRows: roomPlans.length * 2, supplements: source.supplements.length, bank: `${source.bank.bankName} ${masked(source.bank.accountNumber)}` }));
  const verification = { rates: commercialMismatches.length, supplements: supplementMismatches.length, banks: bankMismatches.length, generatedSheet: sheetMismatches.length };
  console.log(JSON.stringify({ source: SOURCE_FILE, validity: [VALID_FROM, VALID_TO], slab: { code: slab.code, version: slab.version, status: slab.status }, agent: { name: agent.name, email: agent.email }, hotels: summary, verification, mappings: { CPAI: 'CP', MAP: 'MAP', APAI: 'not present in selected source hotels', tax: 'RateDay statutory tax uses the existing 12% RainWood room-tax policy; slab amounts remain before tax' } }, null, 2));
  if (Object.values(verification).some((count) => count > 0)) throw new Error(`Source verification failed: ${JSON.stringify(verification)}`);
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });

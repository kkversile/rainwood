import { PrismaClient, UserRole } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: true } });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD ?? 'change_me_after_seed';
  const passwordHash = await bcrypt.hash(seedPassword, 12);
  const admin = await prisma.user.upsert({ where: { email: 'admin@rainwood.demo' }, update: { active: true, role: 'SUPER_ADMIN' }, create: { email: 'admin@rainwood.demo', name: 'RainWood Admin', passwordHash, role: 'SUPER_ADMIN' } });
  await prisma.user.upsert({ where: { email: 'reservation@rainwood.demo' }, update: { active: true, role: 'RESERVATION' }, create: { email: 'reservation@rainwood.demo', name: 'Reservation Desk', passwordHash, role: 'RESERVATION' } });
  await prisma.user.upsert({ where: { email: 'accounts@rainwood.demo' }, update: { active: true, role: 'ACCOUNTS' }, create: { email: 'accounts@rainwood.demo', name: 'Accounts Team', passwordHash, role: 'ACCOUNTS' } });

  const permissions = [
    ['RESERVATION_READ', 'Read reservations'],
    ['RESERVATION_WRITE', 'Create and modify reservations'],
    ['PAYMENT_RECORD', 'Record manual payments'],
    ['PAYMENT_VERIFY', 'Verify manual payments'],
    ['CONTENT_MANAGE', 'Manage public hotel content'],
    ['REPORT_READ', 'Read operational reports'],
  ] as const;
  for (const [code, description] of permissions) await prisma.permission.upsert({ where: { code }, update: { description }, create: { code, description } });
  const roleCodes: Record<string, string[]> = { SUPER_ADMIN: permissions.map(([code]) => code), ADMIN: permissions.map(([code]) => code), RESERVATION: ['RESERVATION_READ', 'RESERVATION_WRITE', 'REPORT_READ'], ACCOUNTS: ['RESERVATION_READ', 'PAYMENT_RECORD', 'PAYMENT_VERIFY', 'REPORT_READ'], VIEWER: ['RESERVATION_READ', 'REPORT_READ'], AGENT: ['RESERVATION_READ', 'RESERVATION_WRITE'] };
  for (const role of Object.keys(roleCodes) as UserRole[]) for (const code of roleCodes[role]) {
    const permission = await prisma.permission.findUniqueOrThrow({ where: { code } });
    await prisma.rolePermission.upsert({ where: { role_permissionId: { role, permissionId: permission.id } }, update: {}, create: { role, permissionId: permission.id } });
  }

  const hotel = await prisma.hotel.upsert({ where: { code: 'RW-KODAI' }, update: { active: true, name: 'RainWood Aurum Kodaikanal', city: 'Kodaikanal', description: 'A calm RainWood property with valley views and direct reservation support.', seoTitle: 'RainWood Aurum Kodaikanal | Direct Booking', seoDescription: 'Book RainWood Aurum Kodaikanal directly for transparent rates and secure confirmation.', canonicalPath: '/hotels/rainwood-aurum-kodaikanal', axisPropertyId: 'AXIS-RW-KODAI' }, create: { code: 'RW-KODAI', name: 'RainWood Aurum Kodaikanal', slug: 'rainwood-aurum-kodaikanal', city: 'Kodaikanal', description: 'A calm RainWood property with valley views and direct reservation support.', seoTitle: 'RainWood Aurum Kodaikanal | Direct Booking', seoDescription: 'Book RainWood Aurum Kodaikanal directly for transparent rates and secure confirmation.', canonicalPath: '/hotels/rainwood-aurum-kodaikanal', axisPropertyId: 'AXIS-RW-KODAI' } });
  for (const amenityValue of [['WIFI', 'High-speed Wi-Fi'], ['BREAKFAST', 'Breakfast available'], ['PARKING', 'On-site parking']] as const) {
    const amenity = await prisma.amenity.upsert({ where: { code: amenityValue[0] }, update: { name: amenityValue[1] }, create: { code: amenityValue[0], name: amenityValue[1] } });
    await prisma.hotelAmenity.upsert({ where: { hotelId_amenityId: { hotelId: hotel.id, amenityId: amenity.id } }, update: {}, create: { hotelId: hotel.id, amenityId: amenity.id } });
  }
  const room = await prisma.roomType.upsert({ where: { hotelId_code: { hotelId: hotel.id, code: 'PVR' } }, update: { active: true, name: 'Premium Valley Room', maxAdults: 3, maxChildren: 2, maxOccupancy: 4, axisRoomId: 'AXIS-ROOM-PVR' }, create: { hotelId: hotel.id, code: 'PVR', name: 'Premium Valley Room', description: 'A bright room with valley views.', maxAdults: 3, maxChildren: 2, maxOccupancy: 4, axisRoomId: 'AXIS-ROOM-PVR' } });
  const plan = await prisma.ratePlan.upsert({ where: { roomTypeId_code: { roomTypeId: room.id, code: 'CP' } }, update: { active: true, name: 'CP - Breakfast', mealPlan: 'CP', axisRatePlanId: 'AXIS-RATE-CP' }, create: { roomTypeId: room.id, code: 'CP', name: 'CP - Breakfast', mealPlan: 'CP', description: 'Room with breakfast included.', axisRatePlanId: 'AXIS-RATE-CP' } });
  const masterPlans = [
    { code: 'A', name: 'Preferred Partner Rate', mealPlan: 'EP', description: 'Plan A - Nett contract', amount: 4800, taxAmount: 576 },
    { code: 'B', name: 'Contracted Nett Rate', mealPlan: 'EP', description: 'Plan B - Nett contract', amount: 5000, taxAmount: 600 },
    { code: 'C', name: 'Premium Meal Rate', mealPlan: 'CP', description: 'Plan C - Premium meal inclusion', amount: 6000, taxAmount: 720 },
    { code: 'D', name: 'Standard B2B Rate', mealPlan: 'CP', description: 'Plan D - Standard B2B contract', amount: 5200, taxAmount: 624 },
    { code: 'E', name: 'Standard Public Rate', mealPlan: 'MAP', description: 'Plan E - Public flexible rate', amount: 6500, taxAmount: 780 },
  ] as const;
  const seededMasterPlans = [] as { id: string; code: string; amount: number; taxAmount: number }[];
  for (const item of masterPlans) {
    const masterPlan = await prisma.ratePlan.upsert({ where: { roomTypeId_code: { roomTypeId: room.id, code: item.code } }, update: { active: true, name: item.name, mealPlan: item.mealPlan, description: item.description, axisRatePlanId: `AXIS-RATE-${item.code}` }, create: { roomTypeId: room.id, code: item.code, name: item.name, mealPlan: item.mealPlan, description: item.description, axisRatePlanId: `AXIS-RATE-${item.code}` } });
    seededMasterPlans.push({ id: masterPlan.id, code: item.code, amount: item.amount, taxAmount: item.taxAmount });
    await prisma.cancellationRule.upsert({ where: { hotelId_ratePlanId_type: { hotelId: hotel.id, ratePlanId: masterPlan.id, type: 'FREE_CANCELLATION' } }, update: { cutoffHours: 48, value: 0, active: true }, create: { hotelId: hotel.id, ratePlanId: masterPlan.id, type: 'FREE_CANCELLATION', cutoffHours: 48, value: 0 } });
  }
  const agentPasswordHash = await bcrypt.hash(process.env.SEED_AGENT_PASSWORD ?? 'Agent@Rainwood2026!', 12);
  const seededAgents = [
    { email: 'agent@rainwood.demo', name: 'RainWood Existing Agent' },
    { email: 'munnar.agent@rainwood.demo', name: 'Munnar Travel Partner' },
    { email: 'south.agent@rainwood.demo', name: 'South India Holidays' },
  ];
  const agentUsers = [] as { id: string; email: string }[];
  for (const item of seededAgents) {
    const agentUser = await prisma.user.upsert({ where: { email: item.email }, update: { name: item.name, passwordHash: agentPasswordHash, role: 'AGENT', active: true }, create: { email: item.email, name: item.name, passwordHash: agentPasswordHash, role: 'AGENT', active: true } });
    agentUsers.push({ id: agentUser.id, email: agentUser.email });
    await prisma.agentWallet.upsert({ where: { agentId: agentUser.id }, update: {}, create: { agentId: agentUser.id, balance: 0 } });
  }
  const planByCode = Object.fromEntries(seededMasterPlans.map((item) => [item.code, item.id]));
  const agentAssignments = [[agentUsers[0].id, ['A', 'B']], [agentUsers[1].id, ['C', 'D']], [agentUsers[2].id, ['B', 'E']]] as const;
  for (const [agentId, codes] of agentAssignments) {
    await prisma.agentRatePlan.deleteMany({ where: { agentId } });
    for (const code of codes) await prisma.agentRatePlan.create({ data: { agentId, ratePlanId: planByCode[code] } });
  }
  await prisma.cancellationRule.upsert({ where: { hotelId_ratePlanId_type: { hotelId: hotel.id, ratePlanId: plan.id, type: 'FREE_CANCELLATION' } }, update: { cutoffHours: 48, value: 0, active: true }, create: { hotelId: hotel.id, ratePlanId: plan.id, type: 'FREE_CANCELLATION', cutoffHours: 48, value: 0 } });
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let offset = 0; offset < 120; offset += 1) {
    const date = new Date(start.getTime() + offset * 86_400_000);
    await prisma.inventoryDay.upsert({ where: { roomTypeId_date: { roomTypeId: room.id, date } }, update: { available: 8, stopSell: false }, create: { roomTypeId: room.id, date, available: 8, updatedFromAxisAt: new Date() } });
    await prisma.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: plan.id, date } }, update: { amount: 5500, taxAmount: 660, childAmount: 1000, extraAdultAmount: 1500, occupancyPrices: { single: 5000, double: 5500, triple: 6500, quad: 7500, extrabed: 1200, extraadult: 1500, extrachild: 1000, extraadult2: 1600, extrachild2: 1100, extraadult3: 1700, extrachild3: 1200, extrainfant: 500 }, cta: false, ctd: false, minLos: 1, maxLos: 30 }, create: { ratePlanId: plan.id, date, amount: 5500, taxAmount: 660, childAmount: 1000, extraAdultAmount: 1500, occupancyPrices: { single: 5000, double: 5500, triple: 6500, quad: 7500, extrabed: 1200, extraadult: 1500, extrachild: 1000, extraadult2: 1600, extrachild2: 1100, extraadult3: 1700, extrachild3: 1200, extrainfant: 500 }, minLos: 1, maxLos: 30, updatedFromAxisAt: new Date() } });
  }
  for (const masterPlan of seededMasterPlans) for (let offset = 0; offset < 120; offset += 1) {
    const date = new Date(start.getTime() + offset * 86_400_000);
    const occupancyPrices = { single: masterPlan.amount - 500, double: masterPlan.amount, triple: masterPlan.amount + 1000, quad: masterPlan.amount + 2000, extrabed: 1200, extraadult: 1500, extrachild: 1000, extraadult2: 1600, extrachild2: 1100, extraadult3: 1700, extrachild3: 1200, extrainfant: 500 };
    await prisma.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: masterPlan.id, date } }, update: { amount: masterPlan.amount, taxAmount: masterPlan.taxAmount, childAmount: 1000, extraAdultAmount: 1500, occupancyPrices, cta: false, ctd: false, minLos: 1, maxLos: 30 }, create: { ratePlanId: masterPlan.id, date, amount: masterPlan.amount, taxAmount: masterPlan.taxAmount, childAmount: 1000, extraAdultAmount: 1500, occupancyPrices, minLos: 1, maxLos: 30, updatedFromAxisAt: new Date() } });
  }
  await prisma.hotelImage.upsert({ where: { id: 'seed-hotel-image' }, update: { published: true }, create: { id: 'seed-hotel-image', hotelId: hotel.id, url: '/rainwood-placeholder.svg', altText: 'RainWood Aurum Kodaikanal exterior', sortOrder: 0 } });
  await prisma.roomImage.upsert({ where: { id: 'seed-room-image' }, update: { published: true }, create: { id: 'seed-room-image', roomTypeId: room.id, url: '/rainwood-placeholder.svg', altText: 'Premium Valley Room at RainWood Aurum', sortOrder: 0 } });
  const demoDate = (offset: number) => new Date(start.getTime() + offset * 86_400_000);
  const demoReservations = [
    { reference: 'RW-DEMO-001', guestName: 'Ananya Rao', email: 'ananya.rao@example.com', mobile: '+91 90000 10001', source: 'WEBSITE' as const, status: 'CONFIRMED' as const, paymentStatus: 'PARTIALLY_PAID' as const, syncStatus: 'SYNCED' as const, checkIn: demoDate(3), checkOut: demoDate(5), total: 12320, tax: 1320, advance: 6000, balance: 6320, adults: 2, children: 0 },
    { reference: 'RW-DEMO-002', guestName: 'Vikram Menon', email: 'vikram.menon@example.com', mobile: '+91 90000 10002', source: 'DIRECT' as const, status: 'PENDING_PAYMENT' as const, paymentStatus: 'PENDING' as const, syncStatus: 'PENDING' as const, checkIn: demoDate(10), checkOut: demoDate(12), total: 12320, tax: 1320, advance: 0, balance: 12320, adults: 2, children: 1 },
    { reference: 'RW-DEMO-003', guestName: 'Meera Shah', email: 'meera.shah@example.com', mobile: '+91 90000 10003', source: 'PHONE' as const, status: 'COMPLETED' as const, paymentStatus: 'PAID' as const, syncStatus: 'SYNCED' as const, checkIn: demoDate(-20), checkOut: demoDate(-18), total: 12320, tax: 1320, advance: 12320, balance: 0, adults: 2, children: 0 },
    { reference: 'RW-DEMO-004', guestName: 'Arjun Kapoor', email: 'arjun.kapoor@example.com', mobile: '+91 90000 10004', source: 'AGENT' as const, status: 'CANCELLED' as const, paymentStatus: 'REFUNDED' as const, syncStatus: 'PENDING' as const, checkIn: demoDate(18), checkOut: demoDate(20), total: 12320, tax: 1320, advance: 5000, balance: 7320, adults: 2, children: 0 },
  ];
  for (const item of demoReservations) {
    const existing = await prisma.reservation.findUnique({ where: { reference: item.reference } });
    const reservation = existing ?? await prisma.reservation.create({ data: { reference: item.reference, hotelId: hotel.id, source: item.source, sourceName: 'RainWood demo seed', status: item.status, paymentStatus: item.paymentStatus, syncStatus: item.syncStatus, guestName: item.guestName, email: item.email, mobile: item.mobile, checkIn: item.checkIn, checkOut: item.checkOut, currency: 'INR', totalAmount: item.total, taxAmount: item.tax, advanceAmount: item.advance, balanceAmount: item.balance, priceSnapshot: [{ roomTypeId: room.id, ratePlanId: plan.id, amount: 5500, taxAmount: 660 }], policySnapshot: { freeCancellationHours: 48, firstNightPenalty: true, seeded: true }, internalRemark: 'Development seed record', createdById: admin.id, lines: { create: { roomTypeId: room.id, ratePlanId: plan.id, checkIn: item.checkIn, checkOut: item.checkOut, rooms: 1, adults: item.adults, children: item.children, nightlyRate: 5500, taxAmount: 1320, lineTotal: 12320, priceSnapshot: { amount: 5500, taxAmount: 660 }, nights: { create: [3, 4].map((nightOffset) => ({ date: demoDate(item.reference === 'RW-DEMO-003' ? -20 + nightOffset - 3 : item.reference === 'RW-DEMO-004' ? 18 + nightOffset - 3 : item.reference === 'RW-DEMO-002' ? 10 + nightOffset - 3 : 3 + nightOffset - 3), rooms: 1, amount: 5500, taxAmount: 660, totalAmount: 6160 })) } } } } });
    const paymentAmount = item.reference === 'RW-DEMO-001' ? 6000 : item.reference === 'RW-DEMO-003' ? 12320 : item.reference === 'RW-DEMO-004' ? 5000 : 0;
    if (paymentAmount) await prisma.payment.upsert({ where: { id: `seed-payment-${item.reference}` }, update: { amount: paymentAmount, verified: true, verifiedById: admin.id, paidAt: demoDate(-1) }, create: { id: `seed-payment-${item.reference}`, reservationId: reservation.id, amount: paymentAmount, mode: item.reference === 'RW-DEMO-004' ? 'BANK_TRANSFER' : 'UPI', provider: 'MANUAL', reference: `DEMO-PAY-${item.reference.slice(-3)}`, verified: true, verifiedById: admin.id, paidAt: demoDate(-1) } });
    await prisma.axisSyncLog.upsert({ where: { idempotencyKey: `seed-sync-${item.reference}` }, update: { status: item.syncStatus, response: { seeded: true } }, create: { reservationId: reservation.id, idempotencyKey: `seed-sync-${item.reference}`, direction: 'OUTBOUND', entityType: 'RESERVATION', externalReference: `AXIS-${item.reference}`, status: item.syncStatus, payload: { reference: item.reference, seeded: true }, response: item.syncStatus === 'SYNCED' ? { accepted: true } : undefined } });
    await prisma.outboxJob.upsert({ where: { idempotencyKey: `seed-job-${item.reference}` }, update: { status: item.syncStatus === 'SYNCED' ? 'SUCCEEDED' : 'PENDING' }, create: { type: 'AXIS_BOOKING_PUSH', aggregateType: 'Reservation', aggregateId: reservation.id, idempotencyKey: `seed-job-${item.reference}`, payload: { reservationId: reservation.id, reference: item.reference }, status: item.syncStatus === 'SYNCED' ? 'SUCCEEDED' : 'PENDING', completedAt: item.syncStatus === 'SYNCED' ? demoDate(-1) : undefined } });
    await prisma.auditLog.create({ data: { actorUserId: admin.id, action: 'SEED_RESERVATION', entityType: 'Reservation', entityId: reservation.id, after: { reference: item.reference, status: item.status, seeded: true } } });
  }
  await prisma.paymentAttempt.upsert({ where: { idempotencyKey: 'seed-payment-attempt-pending' }, update: { status: 'PENDING' }, create: { reservationId: (await prisma.reservation.findUniqueOrThrow({ where: { reference: 'RW-DEMO-002' } })).id, provider: 'RAZORPAY', providerOrderId: 'seed-order-rw-demo-002', idempotencyKey: 'seed-payment-attempt-pending', amount: 12320, currency: 'INR', status: 'PENDING', expiresAt: demoDate(10) } });
  const holdReservation = await prisma.reservation.findUniqueOrThrow({ where: { reference: 'RW-DEMO-002' } });
  await prisma.inventoryHold.upsert({ where: { tokenHash: 'seed-active-hold-token-hash' }, update: { status: 'ACTIVE', expiresAt: new Date(Date.now() + 1_800_000) }, create: { tokenHash: 'seed-active-hold-token-hash', hotelId: hotel.id, status: 'ACTIVE', guestEmail: 'vikram.menon@example.com', expiresAt: new Date(Date.now() + 1_800_000), lines: { create: { roomTypeId: room.id, ratePlanId: plan.id, checkIn: demoDate(10), checkOut: demoDate(12), rooms: 1, adults: 2, children: 1, quotedTotal: 12320, quotedTax: 1320, quotedBreakdown: { seeded: true, amount: 5500 }, nights: { create: [10, 11].map((offset) => ({ date: demoDate(offset), rooms: 1 })) } } } } });
  console.log(`Seeded development data for ${admin.email}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => { await prisma.$disconnect(); await pool.end(); });

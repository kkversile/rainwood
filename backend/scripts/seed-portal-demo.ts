import { config } from 'dotenv';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { StaffDepartment, UserRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';
import { getHotelOperationalDate } from '../src/common/hotel-dates';

config({ path: join(__dirname, '../.env'), quiet: true });
const prisma = new PrismaService();

// Additive deployment seed. Only --sync-demo-passwords can update credentials,
// and only for the fixed demo identities below. Preview is the default.
async function main() {
  const apply = process.argv.includes('--apply');
  const syncPasswords = process.argv.includes('--sync-demo-passwords');
  const password = process.env.SEED_PORTAL_DEMO_PASSWORD;
  const agentPassword = process.env.SEED_PORTAL_AGENT_PASSWORD;
  assert.ok(password && agentPassword, 'Set SEED_PORTAL_DEMO_PASSWORD and SEED_PORTAL_AGENT_PASSWORD.');
  const hotel = await prisma.hotel.findUniqueOrThrow({ where: { code: process.env.SEED_PORTAL_HOTEL_CODE ?? 'RW-KODAI' }, select: { id: true, name: true, active: true, timezoneName: true } });
  assert.ok(hotel.active, 'The selected demo hotel must be active.');
  const specs = [
    { email: 'admin@rainwood.demo', name: 'RainWood Admin', role: UserRole.SUPER_ADMIN },
    { email: 'agent@rainwood.demo', name: 'RainWood Existing Agent', role: UserRole.AGENT },
    { email: 'service.staff.test@rainwood.demo', name: 'RainWood Demo Housekeeper', role: UserRole.SERVICE_STAFF, staffDepartment: StaffDepartment.HOUSEKEEPING, jobTitle: 'Room Attendant' },
    { email: 'maintenance.staff.test@rainwood.demo', name: 'RainWood Demo Maintenance Technician', role: UserRole.SERVICE_STAFF, staffDepartment: StaffDepartment.MAINTENANCE, jobTitle: 'Maintenance Technician' },
    { email: 'fnb.staff.test@rainwood.demo', name: 'RainWood Demo F&B Attendant', role: UserRole.SERVICE_STAFF, staffDepartment: StaffDepartment.FOOD_BEVERAGE, jobTitle: 'F&B Attendant' },
    { email: 'roomservice.staff.test@rainwood.demo', name: 'RainWood Demo Room Service Attendant', role: UserRole.SERVICE_STAFF, staffDepartment: StaffDepartment.ROOM_SERVICE, jobTitle: 'Room Service Attendant' },
  ];
  const items = [
    { code: 'CODEX-DEMO-MEAL', name: 'Codex Demo F&B Meal', type: 'FOOD' as const, unitPrice: 100, taxRate: 5 },
    { code: 'CODEX-DEMO-DRINK', name: 'Codex Demo F&B Beverage', type: 'BEVERAGE' as const, unitPrice: 40, taxRate: 5 },
    { code: 'CODEX-DEMO-TRAY', name: 'Codex Demo Room Service Tray', type: 'ROOM_SERVICE' as const, unitPrice: 60, taxRate: 5 },
  ];
  const existing = await prisma.user.findMany({ where: { email: { in: specs.map((spec) => spec.email) } } });
  const mismatched = new Set<string>();
  // Validate every existing identity before allowing any writes.
  for (const spec of specs) {
    const user = existing.find((row) => row.email === spec.email);
    if (!user) continue;
    assert.equal(user.role, spec.role, `Unexpected role for ${spec.email}; no account reset.`);
    assert.ok(user.active, `${spec.email} is inactive; no account reactivated.`);
    if (!await bcrypt.compare(spec.role === UserRole.AGENT ? agentPassword : password, user.passwordHash)) {
      assert.ok(syncPasswords, `${spec.email} password differs; use --sync-demo-passwords only on the authorized demo site.`);
      mismatched.add(spec.email);
    }
    if (spec.staffDepartment) { assert.equal(user.staffDepartment, spec.staffDepartment); assert.equal(user.staffHotelId, hotel.id); }
  }
  const missing = specs.filter((spec) => !existing.some((row) => row.email === spec.email));
  const before = await prisma.reservation.findMany({ where: { reference: { startsWith: 'RW-DEMO-SVC-' } }, select: { reference: true, stayStatus: true, settlement: { select: { snapshot: true } }, roomAssignments: { select: { roomId: true, unassignedAt: true, room: { select: { status: true } } } } }, orderBy: { reference: 'asc' } });
  if (apply) {
    const passwordHash = await bcrypt.hash(password, 12);
    const agentHash = await bcrypt.hash(agentPassword, 12);
    await prisma.$transaction(async (tx) => {
      for (const spec of missing) await tx.user.create({ data: { ...spec, passwordHash: spec.role === UserRole.AGENT ? agentHash : passwordHash, ...(spec.role === UserRole.AGENT ? { emailVerifiedAt: new Date(), agentPaymentPolicy: 'PERCENTAGE', bookingPaymentPercent: 100 } : {}), ...(spec.staffDepartment ? { staffHotelId: hotel.id } : {}) } });
      for (const spec of specs.filter((item) => mismatched.has(item.email))) await tx.user.update({ where: { email: spec.email }, data: { passwordHash: spec.role === UserRole.AGENT ? agentHash : passwordHash, tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
      for (const item of items) await tx.serviceItem.upsert({ where: { hotelId_code: { hotelId: hotel.id, code: item.code } }, create: { hotelId: hotel.id, ...item, description: 'Dedicated demo service item', active: true }, update: {} });
      const agent = await tx.user.findUniqueOrThrow({ where: { email: 'agent@rainwood.demo' } });
      await tx.agentWallet.upsert({ where: { agentId: agent.id }, create: { agentId: agent.id, balance: 0 }, update: {} });
      const admin = await tx.user.findUniqueOrThrow({ where: { email: 'admin@rainwood.demo' } });
      const today = getHotelOperationalDate(hotel.timezoneName);
      const mapping = await tx.agentHotelRateCategoryAssignment.findFirst({ where: { agentId: agent.id, hotelId: hotel.id, active: true, validTo: { gte: today } } });
      if (!mapping) {
        const coverage = await tx.rateDay.aggregate({ where: { date: { gte: today }, ratePlan: { active: true, master: { active: true, kind: 'CANONICAL_MEAL' }, roomType: { hotelId: hotel.id, active: true } } }, _min: { date: true }, _max: { date: true } });
        assert.ok(coverage._min.date && coverage._max.date, 'Publish canonical room rates before creating demo agent access.');
        const created = await tx.agentHotelRateCategoryAssignment.create({ data: { agentId: agent.id, hotelId: hotel.id, category: 'RACK', validFrom: coverage._min.date, validTo: coverage._max.date, createdById: admin.id } });
        await tx.auditLog.create({ data: { actorUserId: admin.id, action: 'DEMO_AGENT_ACCESS_CREATED', entityType: 'AgentHotelRateCategoryAssignment', entityId: created.id, after: { agentId: agent.id, hotelId: hotel.id, category: 'RACK', demo: true } } });
      }
      const roomType = await tx.roomType.upsert({ where: { hotelId_code: { hotelId: hotel.id, code: 'DEMO-PORTAL' } }, create: { hotelId: hotel.id, code: 'DEMO-PORTAL', name: 'Portal Demo Room - Not for sale', active: false, roomsAvailable: 0, maxAdults: 1, maxChildren: 0, maxOccupancy: 1 }, update: {} });
      const master = await tx.ratePlanMaster.upsert({ where: { hotelId_code: { hotelId: hotel.id, code: 'DEMO-PORTAL' } }, create: { hotelId: hotel.id, code: 'DEMO-PORTAL', name: 'Portal Demo Complimentary Stay', mealPlan: 'EP', active: false }, update: {} });
      const plan = await tx.ratePlan.upsert({ where: { roomTypeId_masterId: { roomTypeId: roomType.id, masterId: master.id } }, create: { roomTypeId: roomType.id, masterId: master.id, code: 'DEMO-PORTAL', name: 'Demo complimentary rate', mealPlan: 'EP', active: false }, update: {} });
      if (!await tx.room.findUnique({ where: { hotelId_roomNumber: { hotelId: hotel.id, roomNumber: 'DEMO-PORTAL-HK-001' } } })) {
        const room = await tx.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, roomNumber: 'DEMO-PORTAL-HK-001', wing: 'DEMO ONLY', status: 'DIRTY', active: true } });
        await tx.housekeepingTask.create({ data: { hotelId: hotel.id, roomId: room.id, status: 'PENDING', createdById: admin.id } });
      }
      if (!await tx.reservation.findUnique({ where: { reference: 'RW-DEMO-PORTAL-SERVICE' } })) {
        const date = getHotelOperationalDate(hotel.timezoneName); const departure = new Date(date); departure.setUTCDate(departure.getUTCDate() + 1);
        const room = await tx.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, roomNumber: 'DEMO-PORTAL-SVC-001', wing: 'DEMO ONLY', status: 'OCCUPIED', active: true } });
        const stay = await tx.reservation.create({ data: { reference: 'RW-DEMO-PORTAL-SERVICE', hotelId: hotel.id, source: 'DIRECT', sourceName: 'Portal deployment demo', status: 'CONFIRMED', stayStatus: 'CHECKED_IN', paymentStatus: 'PAID', syncStatus: 'SYNCED', guestName: 'Portal Demo Service Guest', email: 'portal.guest@rainwood.demo', mobile: '0000000000', checkIn: date, checkOut: departure, totalAmount: 0, taxAmount: 0, advanceAmount: 0, balanceAmount: 0, priceSnapshot: { demo: true, complimentary: true }, policySnapshot: { demo: true }, internalRemark: 'Synthetic deployment fixture. No real guest, payment or channel sync.', createdById: admin.id, checkedInAt: new Date(), checkedInById: admin.id, lines: { create: { roomTypeId: roomType.id, ratePlanId: plan.id, checkIn: date, checkOut: departure, rooms: 1, adults: 1, children: 0, nightlyRate: 0, taxAmount: 0, lineTotal: 0, priceSnapshot: { demo: true }, nights: { create: { date, rooms: 1, amount: 0, taxAmount: 0, totalAmount: 0 } } } } }, include: { lines: true } });
        await tx.reservationRoomAssignment.create({ data: { reservationId: stay.id, reservationLineId: stay.lines[0].id, roomId: room.id, assignedById: admin.id, reason: 'Dedicated portal demo fixture' } });
        await tx.auditLog.create({ data: { actorUserId: admin.id, action: 'DEMO_PORTAL_FIXTURE_CREATED', entityType: 'Reservation', entityId: stay.id, after: { reference: stay.reference, roomNumber: room.roomNumber, demo: true } } });
      }
      await tx.maintenanceTicket.upsert({ where: { id: 'seed-portal-maintenance-001' }, create: { id: 'seed-portal-maintenance-001', hotelId: hotel.id, source: 'ADMIN', category: 'GENERAL', priority: 'LOW', status: 'OPEN', title: 'Portal demo maintenance check', description: 'Synthetic hotel-wide demo task. No room or real guest impact.', requiresOutOfOrder: false }, update: {} });
    }, { timeout: 30000 });
  }
  const after = await prisma.reservation.findMany({ where: { reference: { startsWith: 'RW-DEMO-SVC-' } }, select: { reference: true, stayStatus: true, settlement: { select: { snapshot: true } }, roomAssignments: { select: { roomId: true, unassignedAt: true, room: { select: { status: true } } } } }, orderBy: { reference: 'asc' } });
  assert.deepEqual(after, before, 'The seed must preserve tested stay, room and final-folio states.');
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'preview', hotel: hotel.name, accounts: specs.map((spec) => ({ email: spec.email, role: spec.role, action: missing.includes(spec) ? (apply ? 'created' : 'would-create') : mismatched.has(spec.email) ? (apply ? 'demo-password-synced' : 'would-sync-demo-password') : 'reused' })), serviceItems: items.map((item) => item.code), demoFixtures: ['DEMO-PORTAL-HK-001', 'RW-DEMO-PORTAL-SERVICE', 'seed-portal-maintenance-001'], testedStaysPreserved: before.length, publicRatesAndInventoryUnchanged: true }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.onModuleDestroy());

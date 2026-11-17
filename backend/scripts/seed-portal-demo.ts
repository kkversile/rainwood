import { config } from 'dotenv';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import bcrypt from 'bcryptjs';
import { StaffDepartment, UserRole } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';

config({ path: join(__dirname, '../.env'), quiet: true });
const prisma = new PrismaService();

// Additive deployment seed: existing accounts, pricing, inventory, stays and
// financial records are never reset. Preview is the default; --apply writes.
async function main() {
  const apply = process.argv.includes('--apply');
  const password = process.env.SEED_PORTAL_DEMO_PASSWORD;
  const agentPassword = process.env.SEED_PORTAL_AGENT_PASSWORD;
  assert.ok(password && agentPassword, 'Set SEED_PORTAL_DEMO_PASSWORD and SEED_PORTAL_AGENT_PASSWORD.');
  const hotel = await prisma.hotel.findUniqueOrThrow({ where: { code: process.env.SEED_PORTAL_HOTEL_CODE ?? 'RW-KODAI' }, select: { id: true, name: true, active: true } });
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
  // Validate every existing identity before allowing any writes.
  for (const spec of specs) {
    const user = existing.find((row) => row.email === spec.email);
    if (!user) continue;
    assert.equal(user.role, spec.role, `Unexpected role for ${spec.email}; no account reset.`);
    assert.ok(user.active, `${spec.email} is inactive; no account reactivated.`);
    assert.ok(await bcrypt.compare(spec.role === UserRole.AGENT ? agentPassword : password, user.passwordHash), `${spec.email} password differs; no credential reset.`);
    if (spec.staffDepartment) { assert.equal(user.staffDepartment, spec.staffDepartment); assert.equal(user.staffHotelId, hotel.id); }
  }
  const missing = specs.filter((spec) => !existing.some((row) => row.email === spec.email));
  const before = await prisma.reservation.findMany({ where: { reference: { startsWith: 'RW-DEMO-SVC-' } }, select: { reference: true, stayStatus: true, settlement: { select: { snapshot: true } }, roomAssignments: { select: { roomId: true, unassignedAt: true, room: { select: { status: true } } } } }, orderBy: { reference: 'asc' } });
  if (apply) {
    const passwordHash = await bcrypt.hash(password, 12);
    const agentHash = await bcrypt.hash(agentPassword, 12);
    await prisma.$transaction(async (tx) => {
      for (const spec of missing) await tx.user.create({ data: { ...spec, passwordHash: spec.role === UserRole.AGENT ? agentHash : passwordHash, ...(spec.staffDepartment ? { staffHotelId: hotel.id } : {}) } });
      for (const item of items) await tx.serviceItem.upsert({ where: { hotelId_code: { hotelId: hotel.id, code: item.code } }, create: { hotelId: hotel.id, ...item, description: 'Dedicated demo service item', active: true }, update: {} });
    });
  }
  const after = await prisma.reservation.findMany({ where: { reference: { startsWith: 'RW-DEMO-SVC-' } }, select: { reference: true, stayStatus: true, settlement: { select: { snapshot: true } }, roomAssignments: { select: { roomId: true, unassignedAt: true, room: { select: { status: true } } } } }, orderBy: { reference: 'asc' } });
  assert.deepEqual(after, before, 'The seed must preserve tested stay, room and final-folio states.');
  console.log(JSON.stringify({ mode: apply ? 'applied' : 'preview', hotel: hotel.name, accounts: specs.map((spec) => ({ email: spec.email, role: spec.role, action: missing.includes(spec) ? (apply ? 'created' : 'would-create') : 'reused' })), serviceItems: items.map((item) => item.code), testedStaysPreserved: before.length, existingCredentialsPreserved: true, ratesAndInventoryUnchanged: true }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.onModuleDestroy());

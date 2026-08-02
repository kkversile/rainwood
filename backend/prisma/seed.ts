import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

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
  const roleCodes: Record<UserRole, string[]> = { SUPER_ADMIN: permissions.map(([code]) => code), ADMIN: permissions.map(([code]) => code), RESERVATION: ['RESERVATION_READ', 'RESERVATION_WRITE', 'REPORT_READ'], ACCOUNTS: ['RESERVATION_READ', 'PAYMENT_RECORD', 'PAYMENT_VERIFY', 'REPORT_READ'], VIEWER: ['RESERVATION_READ', 'REPORT_READ'] };
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
  await prisma.cancellationRule.upsert({ where: { hotelId_ratePlanId_type: { hotelId: hotel.id, ratePlanId: plan.id, type: 'FREE_CANCELLATION' } }, update: { cutoffHours: 48, value: 0, active: true }, create: { hotelId: hotel.id, ratePlanId: plan.id, type: 'FREE_CANCELLATION', cutoffHours: 48, value: 0 } });
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  for (let offset = 0; offset < 120; offset += 1) {
    const date = new Date(start.getTime() + offset * 86_400_000);
    await prisma.inventoryDay.upsert({ where: { roomTypeId_date: { roomTypeId: room.id, date } }, update: { available: 8, stopSell: false }, create: { roomTypeId: room.id, date, available: 8, updatedFromAxisAt: new Date() } });
    await prisma.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: plan.id, date } }, update: { amount: 5500, taxAmount: 660, childAmount: 1000, extraAdultAmount: 1500, cta: false, ctd: false, minLos: 1, maxLos: 30 }, create: { ratePlanId: plan.id, date, amount: 5500, taxAmount: 660, childAmount: 1000, extraAdultAmount: 1500, minLos: 1, maxLos: 30, updatedFromAxisAt: new Date() } });
  }
  await prisma.hotelImage.upsert({ where: { id: 'seed-hotel-image' }, update: { published: true }, create: { id: 'seed-hotel-image', hotelId: hotel.id, url: '/rainwood-placeholder.svg', altText: 'RainWood Aurum Kodaikanal exterior', sortOrder: 0 } });
  await prisma.roomImage.upsert({ where: { id: 'seed-room-image' }, update: { published: true }, create: { id: 'seed-room-image', roomTypeId: room.id, url: '/rainwood-placeholder.svg', altText: 'Premium Valley Room at RainWood Aurum', sortOrder: 0 } });
  console.log(`Seeded development data for ${admin.email}`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

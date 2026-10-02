import { PrismaService } from '../src/common/prisma.service';

const action = process.argv[2] ?? 'seed';
const prefix = process.argv[3] ?? `RW-RACK-BROWSER-${Date.now()}`;
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
const lineData = (checkIn: string, checkOut: string) => ({ checkIn: date(checkIn), checkOut: date(checkOut), rooms: 1, adults: 2, children: 0, nightlyRate: 100, taxAmount: 0, lineTotal: 100, priceSnapshot: { e2e: true }, nights: { create: { date: date(checkIn), rooms: 1, amount: 100, taxAmount: 0, totalAmount: 100 } } });

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    if (action === 'cleanup') {
      const rooms = await prisma.room.findMany({ where: { roomNumber: { startsWith: prefix } }, select: { id: true } });
      await prisma.reservation.deleteMany({ where: { reference: { startsWith: prefix } } });
      await prisma.housekeepingTask.deleteMany({ where: { roomId: { in: rooms.map((room) => room.id) } } });
      await prisma.maintenanceTicket.deleteMany({ where: { roomId: { in: rooms.map((room) => room.id) } } });
      await prisma.room.deleteMany({ where: { id: { in: rooms.map((room) => room.id) } } });
      return;
    }

    const hotel = await prisma.hotel.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const roomType = await prisma.roomType.findFirstOrThrow({ where: { hotelId: hotel.id, active: true }, select: { id: true } });
    const ratePlan = await prisma.ratePlan.findFirstOrThrow({ where: { roomTypeId: roomType.id, active: true }, select: { id: true } });
    const admin = await prisma.user.findFirstOrThrow({ where: { email: 'admin@rainwood.demo', active: true }, select: { id: true } });
    const rooms = await Promise.all(['101', '102', '103'].map((number, index) => prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, roomNumber: `${prefix}-${number}`, floor: String(index + 1), wing: index === 2 ? 'B' : 'A', status: index === 1 ? 'OCCUPIED' : 'AVAILABLE' }, select: { id: true } })));
    const reservations = await Promise.all([
      prisma.reservation.create({ data: { reference: `${prefix}-EXPECTED`, hotelId: hotel.id, source: 'DIRECT', sourceName: 'Room Rack Browser E2E', status: 'CONFIRMED', stayStatus: 'EXPECTED', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Expected Guest', email: `${prefix}-expected@example.test`, mobile: '0000000000', checkIn: date('2026-10-02'), checkOut: date('2026-10-04'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: admin.id, lines: { create: { roomTypeId: roomType.id, ratePlanId: ratePlan.id, ...lineData('2026-10-02', '2026-10-04') } } }, select: { id: true } }),
      prisma.reservation.create({ data: { reference: `${prefix}-CHECKED-IN`, hotelId: hotel.id, source: 'DIRECT', sourceName: 'Room Rack Browser E2E', status: 'CONFIRMED', stayStatus: 'CHECKED_IN', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Checked In Guest', email: `${prefix}-checked-in@example.test`, mobile: '0000000000', checkIn: date('2026-10-02'), checkOut: date('2026-10-04'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: admin.id, lines: { create: { roomTypeId: roomType.id, ratePlanId: ratePlan.id, ...lineData('2026-10-02', '2026-10-04') } } }, select: { id: true } }),
      prisma.reservation.create({ data: { reference: `${prefix}-UNASSIGNED`, hotelId: hotel.id, source: 'DIRECT', sourceName: 'Room Rack Browser E2E', status: 'CONFIRMED', stayStatus: 'EXPECTED', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Unassigned Guest', email: `${prefix}-unassigned@example.test`, mobile: '0000000000', checkIn: date('2026-10-03'), checkOut: date('2026-10-05'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: admin.id, lines: { create: { roomTypeId: roomType.id, ratePlanId: ratePlan.id, ...lineData('2026-10-03', '2026-10-05') } } }, select: { id: true } }),
      prisma.reservation.create({ data: { reference: `${prefix}-HISTORICAL`, hotelId: hotel.id, source: 'DIRECT', sourceName: 'Room Rack Browser E2E', status: 'COMPLETED', stayStatus: 'CHECKED_OUT', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Historical Guest', email: `${prefix}-historical@example.test`, mobile: '0000000000', checkIn: date('2026-09-28'), checkOut: date('2026-10-01'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: admin.id, lines: { create: { roomTypeId: roomType.id, ratePlanId: ratePlan.id, ...lineData('2026-09-28', '2026-10-01') } } }, select: { id: true } }),
    ]);
    const lines = await prisma.reservationLine.findMany({ where: { reservationId: { in: reservations.map((item) => item.id) } }, select: { id: true, reservationId: true } });
    const lineFor = (reservationId: string) => lines.find((line) => line.reservationId === reservationId)!.id;
    await prisma.reservationRoomAssignment.createMany({ data: [
      { reservationId: reservations[0].id, reservationLineId: lineFor(reservations[0].id), roomId: rooms[0].id, assignedById: admin.id, assignedAt: new Date('2026-10-01T04:00:00.000Z') },
      { reservationId: reservations[1].id, reservationLineId: lineFor(reservations[1].id), roomId: rooms[1].id, assignedById: admin.id, assignedAt: new Date('2026-10-01T04:00:00.000Z') },
      { reservationId: reservations[3].id, reservationLineId: lineFor(reservations[3].id), roomId: rooms[0].id, assignedById: admin.id, assignedAt: new Date('2026-09-27T04:00:00.000Z'), unassignedAt: new Date('2026-10-01T10:00:00.000Z') },
    ] });
    await prisma.housekeepingTask.create({ data: { hotelId: hotel.id, roomId: rooms[1].id, status: 'CLEANING', issueNote: 'Synthetic housekeeping overlay' } });
    await prisma.maintenanceTicket.create({ data: { hotelId: hotel.id, roomId: rooms[2].id, source: 'ADMIN', category: 'GENERAL', priority: 'NORMAL', status: 'OPEN', title: 'Synthetic maintenance overlay', description: 'Room Rack browser E2E overlay' } });
    process.stdout.write(JSON.stringify({ prefix, hotelId: hotel.id }));
  } finally { await prisma.$disconnect(); }
}

void main().catch((error) => { console.error(error); process.exitCode = 1; });

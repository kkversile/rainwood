import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '../.env') });

import { PrismaService } from '../src/common/prisma.service';
import { getHotelOperationalDate } from '../src/common/hotel-dates';
import { ReservationsService } from '../src/modules/reservations/reservations.service';

const runDatabaseTests = process.env.RUN_DB_INTEGRATION === '1';

(runDatabaseTests ? describe : describe.skip)('PostgreSQL stay lifecycle concurrency', () => {
  let prisma: PrismaService;
  let service: ReservationsService;
  let roomId: string;
  let adminId: string;
  let reservationIds: string[] = [];

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new ReservationsService(prisma, {} as any, {} as any, {} as any);
    const hotel = await prisma.hotel.findFirstOrThrow({ where: { active: true }, select: { id: true, timezoneName: true } });
    const roomType = await prisma.roomType.findFirstOrThrow({ where: { hotelId: hotel.id, active: true } });
    const ratePlan = await prisma.ratePlan.findFirstOrThrow({ where: { roomTypeId: roomType.id, active: true } });
    const admin = await prisma.user.findFirstOrThrow({ where: { role: 'SUPER_ADMIN', active: true }, select: { id: true } });
    adminId = admin.id;
    const checkIn = getHotelOperationalDate(hotel.timezoneName);
    const checkOut = new Date(checkIn.getTime() + 86_400_000);
    const room = await prisma.room.create({ data: { hotelId: hotel.id, roomTypeId: roomType.id, roomNumber: `IT-${Date.now()}`, status: 'AVAILABLE', active: true } });
    roomId = room.id;
    for (const suffix of ['A', 'B']) {
      const reference = `RW-IT-CONC-${Date.now()}-${suffix}`;
      const reservation = await prisma.reservation.create({
        data: {
          reference, hotelId: hotel.id, source: 'DIRECT', sourceName: 'Automated PostgreSQL integration test', status: 'CONFIRMED', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: `Concurrency Guest ${suffix}`, email: `concurrency-${suffix.toLowerCase()}-${Date.now()}@example.test`, mobile: '0000000000', checkIn, checkOut, totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { integrationTest: true }, policySnapshot: { integrationTest: true }, createdById: admin.id,
          lines: { create: { roomTypeId: roomType.id, ratePlanId: ratePlan.id, checkIn, checkOut, rooms: 1, adults: 1, children: 0, nightlyRate: 100, taxAmount: 0, lineTotal: 100, priceSnapshot: { integrationTest: true }, nights: { create: { date: checkIn, rooms: 1, amount: 100, taxAmount: 0, totalAmount: 100 } } } },
        },
        select: { id: true, reference: true },
      });
      reservationIds.push(reservation.id);
    }
  });

  afterAll(async () => {
    if (prisma) {
      if (reservationIds.length) await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
      if (roomId) await prisma.room.delete({ where: { id: roomId } });
      await prisma.$disconnect();
    }
  });

  it('allows exactly one concurrent check-in for one physical room', async () => {
    const reservations = await prisma.reservation.findMany({ where: { id: { in: reservationIds } }, select: { reference: true, lines: { select: { id: true } } } });
    const attempts = await Promise.allSettled(reservations.map((reservation) => service.checkIn(reservation.reference, { assignments: [{ reservationLineId: reservation.lines[0].id, roomId }] }, { id: adminId, role: 'ADMIN' })));
    const successes = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const failures = attempts.filter((attempt) => attempt.status === 'rejected');
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    const room = await prisma.room.findUniqueOrThrow({ where: { id: roomId }, select: { status: true } });
    const activeAssignments = await prisma.reservationRoomAssignment.count({ where: { roomId, unassignedAt: null } });
    expect(room.status).toBe('OCCUPIED');
    expect(activeAssignments).toBe(1);
  });
});

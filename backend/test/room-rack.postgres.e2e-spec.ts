import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

const runDatabaseTests = process.env.RUN_DB_INTEGRATION === '1';

(runDatabaseTests ? describe : describe.skip)('Room Rack PostgreSQL correctness', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminId: string;
  let adminEmail: string;
  let hotelId: string;
  let roomTypeId: string;
  let ratePlanId: string;
  let roomIds: string[] = [];
  let reservationIds: string[] = [];
  const prefix = `RW-RACK-E2E-${Date.now()}`;

  const date = (value: string) => new Date(`${value}T00:00:00.000Z`);
  const lineData = (checkIn: string, checkOut: string) => ({ checkIn: date(checkIn), checkOut: date(checkOut), rooms: 1, adults: 2, children: 0, nightlyRate: 100, taxAmount: 0, lineTotal: 100, priceSnapshot: { e2e: true }, nights: { create: { date: date(checkIn), rooms: 1, amount: 100, taxAmount: 0, totalAmount: 100 } } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const hotel = await prisma.hotel.findFirstOrThrow({ where: { active: true }, select: { id: true } });
    const roomType = await prisma.roomType.findFirstOrThrow({ where: { hotelId: hotel.id, active: true }, select: { id: true } });
    const ratePlan = await prisma.ratePlan.findFirstOrThrow({ where: { roomTypeId: roomType.id, active: true }, select: { id: true } });
    const admin = await prisma.user.findFirstOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL ?? 'admin@rainwood.demo', active: true }, select: { id: true, email: true } });
    hotelId = hotel.id; roomTypeId = roomType.id; ratePlanId = ratePlan.id; adminId = admin.id; adminEmail = admin.email;

    const oldRoomNumbers = [`${prefix}-101`, `${prefix}-102`, `${prefix}-103`];
    await prisma.room.deleteMany({ where: { hotelId, roomNumber: { in: oldRoomNumbers } } });
    const rooms = await Promise.all(oldRoomNumbers.map((roomNumber, index) => prisma.room.create({ data: { hotelId, roomTypeId, roomNumber, floor: String(index + 1), wing: index === 2 ? 'B' : 'A', status: index === 1 ? 'OCCUPIED' : 'AVAILABLE' }, select: { id: true, roomNumber: true, floor: true, wing: true, status: true, roomType: { select: { id: true, name: true } } } })));
    roomIds = rooms.map((room) => room.id);

    const reservations = await Promise.all([
      prisma.reservation.create({ data: { reference: `${prefix}-EXPECTED`, hotelId, source: 'DIRECT', sourceName: 'Room Rack E2E', status: 'CONFIRMED', stayStatus: 'EXPECTED', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Expected Guest', email: `${prefix}-expected@example.test`, mobile: '0000000000', checkIn: date('2026-10-02'), checkOut: date('2026-10-04'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: adminId, lines: { create: { roomTypeId, ratePlanId, ...lineData('2026-10-02', '2026-10-04') } } }, select: { id: true } }),
      prisma.reservation.create({ data: { reference: `${prefix}-CHECKED-IN`, hotelId, source: 'DIRECT', sourceName: 'Room Rack E2E', status: 'CONFIRMED', stayStatus: 'CHECKED_IN', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Checked In Guest', email: `${prefix}-checked-in@example.test`, mobile: '0000000000', checkIn: date('2026-10-02'), checkOut: date('2026-10-04'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: adminId, lines: { create: { roomTypeId, ratePlanId, ...lineData('2026-10-02', '2026-10-04') } } }, select: { id: true } }),
      prisma.reservation.create({ data: { reference: `${prefix}-UNASSIGNED`, hotelId, source: 'DIRECT', sourceName: 'Room Rack E2E', status: 'CONFIRMED', stayStatus: 'EXPECTED', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Unassigned Guest', email: `${prefix}-unassigned@example.test`, mobile: '0000000000', checkIn: date('2026-10-03'), checkOut: date('2026-10-05'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: adminId, lines: { create: { roomTypeId, ratePlanId, ...lineData('2026-10-03', '2026-10-05') } } }, select: { id: true } }),
      prisma.reservation.create({ data: { reference: `${prefix}-HISTORICAL`, hotelId, source: 'DIRECT', sourceName: 'Room Rack E2E', status: 'COMPLETED', stayStatus: 'CHECKED_OUT', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: 'Synthetic Historical Guest', email: `${prefix}-historical@example.test`, mobile: '0000000000', checkIn: date('2026-09-28'), checkOut: date('2026-10-01'), totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: adminId, lines: { create: { roomTypeId, ratePlanId, ...lineData('2026-09-28', '2026-10-01') } } }, select: { id: true } }),
    ]);
    reservationIds = reservations.map((reservation) => reservation.id);
    const lines = await prisma.reservationLine.findMany({ where: { reservationId: { in: reservationIds } }, select: { id: true, reservationId: true } });
    const lineFor = (reservationId: string) => lines.find((line) => line.reservationId === reservationId)!.id;
    await prisma.reservationRoomAssignment.createMany({ data: [
      { reservationId: reservationIds[0], reservationLineId: lineFor(reservationIds[0]), roomId: roomIds[0], assignedById: adminId, assignedAt: new Date('2026-10-01T04:00:00.000Z') },
      { reservationId: reservationIds[1], reservationLineId: lineFor(reservationIds[1]), roomId: roomIds[1], assignedById: adminId, assignedAt: new Date('2026-10-01T04:00:00.000Z') },
      { reservationId: reservationIds[3], reservationLineId: lineFor(reservationIds[3]), roomId: roomIds[0], assignedById: adminId, assignedAt: new Date('2026-09-27T04:00:00.000Z'), unassignedAt: new Date('2026-10-01T10:00:00.000Z') },
    ] });
    await prisma.housekeepingTask.create({ data: { hotelId, roomId: roomIds[1], status: 'CLEANING', issueNote: 'Synthetic housekeeping overlay' } });
    await prisma.maintenanceTicket.create({ data: { hotelId, roomId: roomIds[2], source: 'ADMIN', category: 'GENERAL', priority: 'NORMAL', status: 'OPEN', title: 'Synthetic maintenance overlay', description: 'Room Rack E2E overlay' } });
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.reservation.deleteMany({ where: { id: { in: reservationIds } } });
        await prisma.housekeepingTask.deleteMany({ where: { roomId: { in: roomIds } } });
        await prisma.maintenanceTicket.deleteMany({ where: { roomId: { in: roomIds } } });
        await prisma.room.deleteMany({ where: { id: { in: roomIds } } });
        await prisma.$disconnect();
      }
    } finally { await app?.close(); }
  });

  it('returns seeded assigned, checked-in, unassigned, historical, and overlay states', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: adminEmail, password: process.env.E2E_ADMIN_PASSWORD }).expect(201);
    const token = login.body.accessToken as string;
    const response = await request(app.getHttpServer()).get('/api/v1/reports/room-rack').set('Authorization', `Bearer ${token}`).query({ hotelId, from: '2026-09-28', days: 7, search: prefix }).expect(200);
    expect(response.body.rooms).toHaveLength(3);
    expect(response.body.assignments.map((item: { reference: string }) => item.reference)).toEqual(expect.arrayContaining([`${prefix}-EXPECTED`, `${prefix}-CHECKED-IN`, `${prefix}-HISTORICAL`]));
    expect(response.body.unassignedReservations).toEqual(expect.arrayContaining([expect.objectContaining({ reference: `${prefix}-UNASSIGNED`, unassignedLines: [expect.objectContaining({ remainingRooms: 1 })] })]));
    expect(response.body.rooms.find((room: { roomNumber: string }) => room.roomNumber.endsWith('-102')).housekeeping.status).toBe('CLEANING');
    expect(response.body.rooms.find((room: { roomNumber: string }) => room.roomNumber.endsWith('-103')).maintenance.status).toBe('OPEN');
    expect(response.body.facets.roomTypes.length).toBeGreaterThan(0);
    expect(response.body.summary.occupancyPercent).toBeLessThanOrEqual(100);
  });
});

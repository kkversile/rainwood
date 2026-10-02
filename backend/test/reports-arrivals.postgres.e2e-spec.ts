import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

const runDatabaseTests = process.env.RUN_DB_INTEGRATION === '1';

(runDatabaseTests ? describe : describe.skip)('Expected arrivals PostgreSQL pagination', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hotelId: string;
  let roomTypeId: string;
  let ratePlanId: string;
  let adminEmail: string;
  let reservationReferences: string[] = [];
  let waitlistIds: string[] = [];
  const checkIn = new Date('2099-01-15T00:00:00.000Z');
  const checkOut = new Date('2099-01-16T00:00:00.000Z');
  const reservationPrefix = `RW-E2E-ARRIVAL-${Date.now()}`;
  const waitlistPrefix = `Pagination Waitlist ${Date.now()}`;

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
    hotelId = hotel.id;
    roomTypeId = roomType.id;
    ratePlanId = ratePlan.id;
    adminEmail = admin.email;

    await prisma.reservation.deleteMany({ where: { reference: { startsWith: reservationPrefix } } });
    await prisma.waitlistEntry.deleteMany({ where: { guestName: { startsWith: waitlistPrefix } } });
    const created = await Promise.all(Array.from({ length: 30 }, (_, index) => {
      const reference = `${reservationPrefix}-${String(index + 1).padStart(2, '0')}`;
      return prisma.reservation.create({
        data: {
          reference, hotelId, source: 'DIRECT', sourceName: 'PostgreSQL pagination test', status: 'CONFIRMED', paymentStatus: 'PAID', syncStatus: 'NOT_REQUIRED', guestName: `Pagination Guest ${index + 1}`, email: `pagination-${Date.now()}-${index}@example.test`, mobile: '0000000000', checkIn, checkOut, totalAmount: 100, taxAmount: 0, advanceAmount: 100, balanceAmount: 0, priceSnapshot: { e2e: true }, policySnapshot: { e2e: true }, createdById: admin.id,
          lines: { create: { roomTypeId, ratePlanId, checkIn, checkOut, rooms: 1, adults: 1, children: 0, nightlyRate: 100, taxAmount: 0, lineTotal: 100, priceSnapshot: { e2e: true }, nights: { create: { date: checkIn, rooms: 1, amount: 100, taxAmount: 0, totalAmount: 100 } } } },
        },
        select: { reference: true },
      });
    }));
    reservationReferences = created.map((row) => row.reference);
    const waitlist = await prisma.waitlistEntry.createManyAndReturn({
      data: [1, 2].map((index) => ({ hotelId, roomTypeId, guestName: `${waitlistPrefix} ${index}`, email: `waitlist-${Date.now()}-${index}@example.test`, checkIn, checkOut, rooms: 1, status: 'WAITING' })),
      select: { id: true },
    });
    waitlistIds = waitlist.map((row) => row.id);
  });

  afterAll(async () => {
    try {
      if (prisma) {
        await prisma.reservation.deleteMany({ where: { reference: { in: reservationReferences } } });
        if (waitlistIds.length) await prisma.waitlistEntry.deleteMany({ where: { id: { in: waitlistIds } } });
        await prisma.$disconnect();
      }
    } finally {
      await app?.close();
    }
  });

  it('returns bounded page one and page two rows with stable combined ordering', async () => {
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: adminEmail, password: process.env.E2E_ADMIN_PASSWORD }).expect(201);
    const token = login.body.accessToken as string;
    const query = { from: '2099-01-15', to: '2099-01-15', hotelIds: hotelId, includeWaitlist: 'true', limit: 25 };
    const page1 = await request(app.getHttpServer()).get('/api/v1/reports/expected-arrivals').set('Authorization', `Bearer ${token}`).query({ ...query, page: 1 }).expect(200);
    const page2 = await request(app.getHttpServer()).get('/api/v1/reports/expected-arrivals').set('Authorization', `Bearer ${token}`).query({ ...query, page: 2 }).expect(200);
    const page1References = page1.body.items.map((item: { reference: string }) => item.reference);
    const page2References = page2.body.items.map((item: { reference: string }) => item.reference);
    const combined = [...page1References, ...page2References];

    expect(page1References).toHaveLength(25);
    expect(page2References).toHaveLength(7);
    expect(new Set(combined).size).toBe(32);
    expect(combined).toEqual([...combined].sort((a, b) => a.localeCompare(b)));
    expect(page1.body.pagination).toEqual(expect.objectContaining({ page: 1, limit: 25, total: 32, pages: 2 }));
    expect(page2.body.pagination).toEqual(expect.objectContaining({ page: 2, limit: 25, total: 32, pages: 2 }));
  });
});

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { getHotelOperationalDate } from '../src/common/hotel-dates';
import { PrismaService } from '../src/common/prisma.service';

const describeIntegration = process.env.RUN_DB_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('Banquets, function spaces, and BEO PostgreSQL flow', () => {
  let app: INestApplication; let prisma: PrismaService; let token = ''; let hotelId = ''; let spaceId = ''; let createdHotelId = '';
  const eventIds: string[] = [];
  const eventDate = '2099-12-10';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init(); prisma = app.get(PrismaService);
    const email = process.env.E2E_ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? 'admin@rainwood.demo';
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password: process.env.E2E_ADMIN_PASSWORD }).expect(201); token = login.body.accessToken;
    const hotel = await prisma.hotel.findFirstOrThrow({ where: { active: true }, select: { id: true } }); hotelId = hotel.id;
    const space = await prisma.functionSpace.findFirst({ where: { hotelId, active: true, outOfService: false }, select: { id: true } });
    if (space) spaceId = space.id; else { const created = await request(app.getHttpServer()).post('/api/v1/function-spaces').set('Authorization', `Bearer ${token}`).send({ hotelId, name: 'Integration Test Hall', code: `TEST-${Date.now()}`, spaceType: 'BALLROOM', capacityTheatre: 200 }).expect(201); spaceId = created.body.id; }
  });

  afterAll(async () => { if (prisma && eventIds.length) await prisma.banquetEvent.deleteMany({ where: { id: { in: eventIds } } }); if (prisma && createdHotelId) await prisma.hotel.delete({ where: { id: createdHotelId } }).catch(() => undefined); await app?.close(); });

  async function createEvent(name: string) {
    return createEventFor(hotelId, name, eventDate, eventDate);
  }

  async function createEventFor(targetHotelId: string, name: string, startDate: string, endDate: string) {
    const response = await request(app.getHttpServer()).post('/api/v1/banquets').set('Authorization', `Bearer ${token}`).send({ hotelId: targetHotelId, eventName: name, eventType: 'CONFERENCE', startDate, endDate, primaryContactName: 'Synthetic Contact', primaryContactMobile: '9000000000', expectedPax: 80, guaranteedPax: 60 }).expect(201);
    eventIds.push(response.body.id); return response.body;
  }

  it('creates events, blocks concurrent overlapping functions, permits boundary bookings, and completes a BEO', async () => {
    const first = await createEvent('Concurrency Event A'); const second = await createEvent('Concurrency Event B');
    const payload = { functionSpaceId: spaceId, functionName: 'Morning Session', functionDate: eventDate, startTime: '09:00', endTime: '11:00', setupStyle: 'THEATRE', expectedPax: 50, guaranteedPax: 40 };
    const concurrent = await Promise.all([1, 2].map(() => request(app.getHttpServer()).post(`/api/v1/banquets/${first.id}/functions`).set('Authorization', `Bearer ${token}`).send(payload)));
    expect(concurrent.map((item) => item.status).sort()).toEqual([201, 409]);
    const boundary = await request(app.getHttpServer()).post(`/api/v1/banquets/${second.id}/functions`).set('Authorization', `Bearer ${token}`).send({ ...payload, functionName: 'Boundary Session', startTime: '11:00', endTime: '12:00' }).expect(201);
    expect(boundary.body.startAt).toMatch(/T05:30:00.000Z$/); expect(boundary.body.endAt).toMatch(/T06:30:00.000Z$/);
    const detail = await request(app.getHttpServer()).get(`/api/v1/banquets/${first.id}`).set('Authorization', `Bearer ${token}`).expect(200); const functionId = detail.body.functions[0].id;
    await request(app.getHttpServer()).post(`/api/v1/banquets/${first.id}/functions/${functionId}/beo`).set('Authorization', `Bearer ${token}`).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${first.id}/functions/${functionId}/beo`).set('Authorization', `Bearer ${token}`).send({ schedule: [{ itemTime: '08:00', description: 'Venue setup' }], requirements: [{ category: 'AUDIO_VISUAL', description: 'Presentation screen', quantity: 1, requiredAt: '08:30', department: 'ENGINEERING' }], charges: [{ category: 'VENUE_RENTAL', description: 'Hall rental', quantity: 1, unitAmount: 25000 }] }).expect(200);
    const final = await request(app.getHttpServer()).post(`/api/v1/banquets/${first.id}/functions/${functionId}/beo/finalize`).set('Authorization', `Bearer ${token}`).expect(201); expect(final.body.status).toBe('FINAL'); expect(final.body.requirements).toHaveLength(1); expect(final.body.chargeLines[0].totalAmount).toBe('25000');
    const calendar = await request(app.getHttpServer()).get('/api/v1/banquets/calendar').set('Authorization', `Bearer ${token}`).query({ hotelId, from: eventDate, days: 1 }); if (calendar.status !== 200) throw new Error(JSON.stringify(calendar.body)); expect(calendar.body.functions.map((item: any) => item.id)).toEqual(expect.arrayContaining([concurrent.find((item) => item.status === 201)!.body.id, boundary.body.id]));
  });

  it('enforces capacity, out-of-service, cancellation reason, and read-only role boundaries', async () => {
    const event = await createEvent('Validation Event');
    const space = await prisma.functionSpace.findUniqueOrThrow({ where: { id: spaceId } });
    await request(app.getHttpServer()).post(`/api/v1/banquets/${event.id}/functions`).set('Authorization', `Bearer ${token}`).send({ functionSpaceId: spaceId, functionName: 'Too Large', functionDate: eventDate, startTime: '13:00', endTime: '14:00', setupStyle: 'THEATRE', guaranteedPax: (space.capacityTheatre ?? 0) + 1 }).expect(400);
    await request(app.getHttpServer()).patch(`/api/v1/function-spaces/${spaceId}`).set('Authorization', `Bearer ${token}`).send({ outOfService: true }).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/banquets/${event.id}/functions`).set('Authorization', `Bearer ${token}`).send({ functionSpaceId: spaceId, functionName: 'Unavailable', functionDate: eventDate, startTime: '13:00', endTime: '14:00', setupStyle: 'THEATRE', guaranteedPax: 1 }).expect(409);
    await request(app.getHttpServer()).patch(`/api/v1/function-spaces/${spaceId}`).set('Authorization', `Bearer ${token}`).send({ outOfService: false }).expect(200);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${event.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'CANCELLED' }).expect(400);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${event.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'CANCELLED', reason: 'Synthetic test cancellation' }).expect(200);
    const viewer = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'viewer@rainwood.demo', password: process.env.E2E_ADMIN_PASSWORD }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/banquets').set('Authorization', `Bearer ${viewer.body.accessToken}`).send({ hotelId, eventName: 'Read Only Attempt', eventType: 'MEETING', startDate: eventDate, endDate: eventDate, primaryContactName: 'Read Only', primaryContactMobile: '9000000001' }).expect(403);
  });

  it('counts a function later on the hotel-local current date when a space goes out of service', async () => {
    const hotel = await prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, select: { timezoneName: true } });
    const today = getHotelOperationalDate(hotel.timezoneName).toISOString().slice(0, 10);
    const event = await createEventFor(hotelId, 'Today Local Date Function', today, today);
    await request(app.getHttpServer()).post(`/api/v1/banquets/${event.id}/functions`).set('Authorization', `Bearer ${token}`).send({ functionSpaceId: spaceId, functionName: 'Later Today Session', functionDate: today, startTime: '23:00', endTime: '23:30', setupStyle: 'THEATRE', expectedPax: 10, guaranteedPax: 5 }).expect(201);
    const result = await request(app.getHttpServer()).patch(`/api/v1/function-spaces/${spaceId}`).set('Authorization', `Bearer ${token}`).send({ outOfService: true }).expect(200);
    expect(result.body.upcomingFunctionCount).toBeGreaterThanOrEqual(1);
    await request(app.getHttpServer()).patch(`/api/v1/function-spaces/${spaceId}`).set('Authorization', `Bearer ${token}`).send({ outOfService: false }).expect(200);
  });

  it('keeps documents unique across hotels, preserves omitted BEO children, releases cancellation slots, and scopes readers', async () => {
    const activeHotels = await prisma.hotel.findMany({ where: { active: true }, select: { id: true, code: true }, orderBy: { createdAt: 'asc' } });
    if (activeHotels.length < 2) {
      const suffix = Date.now();
      const created = await prisma.hotel.create({ data: { code: `TEST-BQT-${suffix}`, name: 'Integration Banquet Hotel', slug: `integration-banquet-${suffix}`, city: 'Kodaikanal', active: true }, select: { id: true, code: true } });
      createdHotelId = created.id;
      activeHotels.push(created);
    }
    const secondHotel = activeHotels.find((item) => item.id !== hotelId)!;
    const secondSpace = await prisma.functionSpace.findFirst({ where: { hotelId: secondHotel.id, active: true, outOfService: false }, select: { id: true } });
    const secondSpaceId = secondSpace?.id ?? (await request(app.getHttpServer()).post('/api/v1/function-spaces').set('Authorization', `Bearer ${token}`).send({ hotelId: secondHotel.id, name: 'Integration Second Hotel Hall', code: `TEST-SECOND-${Date.now()}`, spaceType: 'BALLROOM', capacityTheatre: 200 }).expect(201)).body.id;
    const other = await createEventFor(secondHotel.id, 'Second Hotel Conference', eventDate, eventDate);
    expect(other.eventCode).toMatch(new RegExp(`^BQT-${secondHotel.code}-`));
    expect(other.eventCode).not.toBe((await prisma.banquetEvent.findUniqueOrThrow({ where: { id: eventIds[0] }, select: { eventCode: true } })).eventCode);
    const otherFunction = await request(app.getHttpServer()).post(`/api/v1/banquets/${other.id}/functions`).set('Authorization', `Bearer ${token}`).send({ functionSpaceId: secondSpaceId, functionName: 'Second Hotel Session', functionDate: eventDate, startTime: '09:00', endTime: '10:00', setupStyle: 'THEATRE', expectedPax: 20, guaranteedPax: 10 }).expect(201);
    const otherBeo = await request(app.getHttpServer()).post(`/api/v1/banquets/${other.id}/functions/${otherFunction.body.id}/beo`).set('Authorization', `Bearer ${token}`).expect(201);
    const firstBeo = await prisma.banquetEventOrder.findFirst({ where: { banquetFunction: { banquetEventId: eventIds[0] } }, select: { beoNumber: true } });
    expect(otherBeo.body.beoNumber).not.toBe(firstBeo?.beoNumber);

    const editable = await createEvent('Lifecycle Conference');
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${editable.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'IN_PROGRESS' }).expect(400);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${editable.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'TENTATIVE' }).expect(200);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${editable.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'CONFIRMED' }).expect(200);
    const fn = await request(app.getHttpServer()).post(`/api/v1/banquets/${editable.id}/functions`).set('Authorization', `Bearer ${token}`).send({ functionSpaceId: spaceId, functionName: 'Cancellation Slot', functionDate: eventDate, startTime: '14:00', endTime: '15:00', setupStyle: 'THEATRE', expectedPax: 20, guaranteedPax: 10 }).expect(201);
    const functionId = fn.body.id;
    await request(app.getHttpServer()).post(`/api/v1/banquets/${editable.id}/functions/${functionId}/beo`).set('Authorization', `Bearer ${token}`).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${editable.id}/functions/${functionId}/beo`).set('Authorization', `Bearer ${token}`).send({ schedule: [{ itemTime: '13:00', description: 'Setup' }], requirements: [{ category: 'ENGINEERING', description: 'Projector', quantity: 1, department: 'ENGINEERING' }], charges: [{ category: 'VENUE_RENTAL', description: 'Hall', quantity: 1, unitAmount: 5000 }] }).expect(200);
    await request(app.getHttpServer()).post(`/api/v1/banquets/${editable.id}/functions/${functionId}/beo/finalize`).set('Authorization', `Bearer ${token}`).expect(201);
    const reopened = await request(app.getHttpServer()).patch(`/api/v1/banquets/${editable.id}/functions/${functionId}/beo`).set('Authorization', `Bearer ${token}`).send({ operationalNotes: 'Updated notes only' }).expect(200);
    expect(reopened.body.status).toBe('DRAFT'); expect(reopened.body.finalizedAt).toBeNull(); expect(reopened.body.scheduleItems).toHaveLength(1); expect(reopened.body.requirements).toHaveLength(1); expect(reopened.body.chargeLines).toHaveLength(1);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${editable.id}`).set('Authorization', `Bearer ${token}`).send({ status: 'CANCELLED', reason: 'Synthetic release test' }).expect(200);
    const cancelled = await request(app.getHttpServer()).get(`/api/v1/banquets/${editable.id}`).set('Authorization', `Bearer ${token}`).expect(200); expect(cancelled.body.functions[0].status).toBe('CANCELLED');
    const replacement = await createEvent('Replacement Conference');
    await request(app.getHttpServer()).post(`/api/v1/banquets/${replacement.id}/functions`).set('Authorization', `Bearer ${token}`).send({ functionSpaceId: spaceId, functionName: 'Released Slot', functionDate: eventDate, startTime: '14:00', endTime: '15:00', setupStyle: 'THEATRE', expectedPax: 20, guaranteedPax: 10 }).expect(201);
    const shrink = await createEventFor(hotelId, 'Date Containment Conference', eventDate, '2099-12-12');
    await request(app.getHttpServer()).post(`/api/v1/banquets/${shrink.id}/functions`).set('Authorization', `Bearer ${token}`).send({ functionSpaceId: spaceId, functionName: 'Date Boundary', functionDate: '2099-12-12', startTime: '16:00', endTime: '17:00', setupStyle: 'THEATRE', expectedPax: 20, guaranteedPax: 10 }).expect(201);
    await request(app.getHttpServer()).patch(`/api/v1/banquets/${shrink.id}`).set('Authorization', `Bearer ${token}`).send({ endDate: '2099-12-11' }).expect(400);
    const viewer = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'viewer@rainwood.demo', password: process.env.E2E_ADMIN_PASSWORD }).expect(201);
    const viewerToken = viewer.body.accessToken;
    await request(app.getHttpServer()).get('/api/v1/banquets').set('Authorization', `Bearer ${viewerToken}`).query({ hotelId }).expect(200);
    await request(app.getHttpServer()).get(`/api/v1/banquets/${replacement.id}`).set('Authorization', `Bearer ${viewerToken}`).expect(200);
    await request(app.getHttpServer()).get('/api/v1/banquets/calendar').set('Authorization', `Bearer ${viewerToken}`).query({ hotelId, from: eventDate, days: 1 }).expect(200);
    await request(app.getHttpServer()).get('/api/v1/function-spaces').set('Authorization', `Bearer ${viewerToken}`).query({ hotelId }).expect(200);
  });
});

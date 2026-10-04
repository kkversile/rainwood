import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HotelBusinessDayStatus } from '@prisma/client';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

function dateInDays(days: number) { const value = new Date(); value.setUTCHours(0, 0, 0, 0); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); }
function nextDate(value: string) { const date = new Date(`${value}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + 1); return date.toISOString().slice(0, 10); }

const describeIntegration = process.env.RUN_DB_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('Operations Logbook PostgreSQL flow', () => {
  let app: INestApplication; let token = ''; let hotelId = ''; let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication(); app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1'); app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true })); await app.init();
    prisma = app.get(PrismaService);
    const email = process.env.E2E_ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? 'admin@rainwood.demo';
    const password = process.env.E2E_ADMIN_PASSWORD;
    if (!password) throw new Error('E2E_ADMIN_PASSWORD is required for the operations logbook integration test.');
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(201);
    token = login.body.accessToken;
    const hotels = await request(app.getHttpServer()).get('/api/v1/hotels').set('Authorization', `Bearer ${token}`).expect(200);
    hotelId = (hotels.body.find((hotel: { code: string }) => hotel.code === 'RW-KODAI') ?? hotels.body[0]).id;
  });

  afterAll(async () => { await app?.close(); });

  it('creates, acknowledges, updates, resolves, and carries forward without changing source business dates', async () => {
    const current = await request(app.getHttpServer()).get('/api/v1/operations-logbook').set('Authorization', `Bearer ${token}`).query({ hotelId, limit: 5 }).expect(200);
    const today = current.body.currentBusinessDate; const historical = dateInDays(-1); const title = `Synthetic logbook ${Date.now()}`;
    const list = await request(app.getHttpServer()).get('/api/v1/operations-logbook').set('Authorization', `Bearer ${token}`).query({ hotelId, limit: 5 }).expect(200);
    expect(list.body.pagination.limit).toBe(5);
    const created = await request(app.getHttpServer()).post('/api/v1/operations-logbook').set('Authorization', `Bearer ${token}`).send({ hotelId, businessDate: today, category: 'GENERAL', priority: 'URGENT', title, details: 'Synthetic handover verification.', dueAt: `${today}T01:15` }).expect(201);
    expect(created.body.dueAt).toMatch(/Z$/);
    expect(created.body.dueLabel).toBe(new Date(created.body.dueAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', timeZone: current.body.hotel.timezoneName }));
    const id = created.body.id;
    await request(app.getHttpServer()).post(`/api/v1/operations-logbook/${id}/acknowledge`).set('Authorization', `Bearer ${token}`).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/operations-logbook/${id}/updates`).set('Authorization', `Bearer ${token}`).send({ note: 'Synthetic update recorded.' }).expect(201);
    await request(app.getHttpServer()).post(`/api/v1/operations-logbook/${id}/resolve`).set('Authorization', `Bearer ${token}`).send({ resolutionNote: 'Synthetic resolution recorded.' }).expect(201);
    const detail = await request(app.getHttpServer()).get(`/api/v1/operations-logbook/${id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(detail.body.status).toBe('RESOLVED'); expect(detail.body.updates).toHaveLength(1); expect(detail.body.businessDate.slice(0, 10)).toBe(today);
    const carried = await request(app.getHttpServer()).post('/api/v1/operations-logbook').set('Authorization', `Bearer ${token}`).send({ hotelId, businessDate: today, category: 'ROOM', priority: 'IMPORTANT', title: 'Synthetic carried-forward item', details: 'Historical handover verification.' }).expect(201);
    await prisma.hotelBusinessDay.upsert({ where: { hotelId_businessDate: { hotelId, businessDate: new Date(`${today}T00:00:00.000Z`) } }, update: { status: HotelBusinessDayStatus.CLOSED, closedAt: new Date(), closedById: (await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? 'admin@rainwood.demo' }, select: { id: true } })).id }, create: { hotelId, businessDate: new Date(`${today}T00:00:00.000Z`), status: HotelBusinessDayStatus.CLOSED, closedAt: new Date(), closedById: (await prisma.user.findUniqueOrThrow({ where: { email: process.env.E2E_ADMIN_EMAIL ?? process.env.NEXT_PUBLIC_DEMO_ADMIN_EMAIL ?? 'admin@rainwood.demo' }, select: { id: true } })).id } });
    const nextHandover = await request(app.getHttpServer()).get('/api/v1/operations-logbook/handover').set('Authorization', `Bearer ${token}`).query({ hotelId, limit: 100 }).expect(200);
    const carriedItem = nextHandover.body.items.find((item: { id: string }) => item.id === carried.body.id);
    expect(carriedItem.carriedForward).toBe(true); expect(carriedItem.businessDate.slice(0, 10)).toBe(today); expect(nextHandover.body.handoverPagination.hasMore).toBe(false);
    const nextDayEntry = await request(app.getHttpServer()).post('/api/v1/operations-logbook').set('Authorization', `Bearer ${token}`).send({ hotelId, category: 'GENERAL', title: 'Synthetic next business day entry', details: 'Created after the simulated Night Audit close.' }).expect(201);
    expect(nextDayEntry.body.businessDate.slice(0, 10)).toBe(nextDate(today));
    const historicalList = await request(app.getHttpServer()).get('/api/v1/operations-logbook').set('Authorization', `Bearer ${token}`).query({ hotelId, businessDate: historical, search: 'carried-forward', limit: 5 }).expect(200);
    expect(historicalList.body.items.find((item: { id: string }) => item.id === carried.body.id)).toBeUndefined();
    await request(app.getHttpServer()).post(`/api/v1/operations-logbook/${carried.body.id}/resolve`).set('Authorization', `Bearer ${token}`).send({ resolutionNote: 'Synthetic carry-forward resolved.' }).expect(201);
    const resolvedHandover = await request(app.getHttpServer()).get('/api/v1/operations-logbook/handover').set('Authorization', `Bearer ${token}`).query({ hotelId, limit: 100 }).expect(200);
    expect(resolvedHandover.body.items.find((item: { id: string }) => item.id === carried.body.id)).toBeUndefined();
  });
});

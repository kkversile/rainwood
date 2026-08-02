import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { HoldsService } from '../src/modules/holds/holds.service';

function dateInDays(days: number) {
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  now.setUTCDate(now.getUTCDate() + days);
  return now.toISOString().slice(0, 10);
}

describe('RainWood API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => { await app.close(); });

  it('serves liveness and readiness', async () => {
    await request(app.getHttpServer()).get('/api/v1/health/live').expect(200).expect({ ok: true });
    await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200).expect({ ok: true });
  });

  it('serves seeded public hotel content and a valid availability result', async () => {
    const hotels = await request(app.getHttpServer()).get('/api/v1/hotels').expect(200);
    expect(hotels.body).toHaveLength(1);
    const options = await request(app.getHttpServer()).get('/api/v1/availability/search').query({ hotelId: hotels.body[0].id, checkIn: dateInDays(2), checkOut: dateInDays(4), rooms: 1, adults: 2, children: 0 });
    if (options.status !== 200) throw new Error(JSON.stringify(options.body));
    expect(options.body.length).toBeGreaterThan(0);
    expect(options.body[0].priceBreakdown).toHaveLength(2);
  });

  it('allows only the sellable quantity in concurrent hold requests', async () => {
    const hotels = await request(app.getHttpServer()).get('/api/v1/hotels').expect(200);
    const checkIn = dateInDays(90);
    const checkOut = dateInDays(91);
    const option = (await request(app.getHttpServer()).get('/api/v1/availability/search').query({ hotelId: hotels.body[0].id, checkIn, checkOut, rooms: 1, adults: 2, children: 0 }).expect(200)).body[0];
    const payload = { hotelId: hotels.body[0].id, roomTypeId: option.roomTypeId, ratePlanId: option.ratePlanId, checkIn, checkOut, rooms: 1, adults: 2, children: 0 };
    const results = await Promise.all(Array.from({ length: 9 }, () => request(app.getHttpServer()).post('/api/v1/holds').send(payload)));
    const successful = results.filter((result) => result.status === 201);
    try {
      expect(successful.length).toBe(8);
      expect(results.filter((result) => result.status >= 400 && result.status < 500).length).toBe(1);
    } finally {
      const holds = app.get(HoldsService);
      await Promise.all(successful.map((result) => holds.release(result.body.id)));
    }
  });
});

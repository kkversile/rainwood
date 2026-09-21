import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

describe('Agent onboarding access (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const email = `pending-agent-${Date.now()}@example.com`;
  const password = 'Password123!';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await prisma.auditLog.deleteMany({ where: { actorUserId: user.id } });
      await prisma.agentDocument.deleteMany({ where: { agentId: user.id } });
      await prisma.storedFile.deleteMany({ where: { createdById: user.id } });
      await prisma.refreshToken.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    await app.close();
  });

  it('allows pending login/onboarding APIs and denies commercial APIs', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/agent/register').send({ companyName: 'Pending Travel', contactPerson: 'Pending Agent', email, mobile: '+919876543210', addressLine1: '1 Test Street', password }).expect(201);
    const login = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(201);
    const token = login.body.accessToken as string;
    expect(token).toBeTruthy();

    await request(app.getHttpServer()).get('/api/v1/agents/me/profile').set('Authorization', `Bearer ${token}`).expect(200).expect((response) => expect(response.body.onboardingStatus).toBe('KYC_PENDING'));
    await request(app.getHttpServer()).get('/api/v1/agents/me/documents').set('Authorization', `Bearer ${token}`).expect(200).expect([]);
    const uploaded = await request(app.getHttpServer()).post('/api/v1/files/agent-document').set('Authorization', `Bearer ${token}`).attach('file', Buffer.from('%PDF-1.4 onboarding test'), { filename: 'company-pan.pdf', contentType: 'application/pdf' }).expect(201);
    await request(app.getHttpServer()).post('/api/v1/agents/me/documents').set('Authorization', `Bearer ${token}`).send({ documentType: 'Company PAN Card', fileId: uploaded.body.id }).expect(201);
    await request(app.getHttpServer()).get('/api/v1/agents/me/profile').set('Authorization', `Bearer ${token}`).expect(200).expect((response) => expect(response.body.onboardingStatus).toBe('UNDER_REVIEW'));

    await request(app.getHttpServer()).get('/api/v1/hotels').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get('/api/v1/availability/search').set('Authorization', `Bearer ${token}`).query({ checkIn: '2099-01-01', checkOut: '2099-01-02', rooms: 1, adults: 2, children: 0 }).expect(403);
    await request(app.getHttpServer()).post('/api/v1/holds').set('Authorization', `Bearer ${token}`).send({ hotelId: 'hotel', roomTypeId: 'room', ratePlanId: 'rate', checkIn: '2099-01-01', checkOut: '2099-01-02', rooms: 1, adults: 2, children: 0 }).expect(403);
    await request(app.getHttpServer()).post('/api/v1/reservations/from-hold/not-a-real-hold').set('Authorization', `Bearer ${token}`).send({ source: 'AGENT', guestName: 'Guest', email: 'guest@example.com', mobile: '+919876543210' }).expect(403);
    await request(app.getHttpServer()).get('/api/v1/reservations/mine').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get('/api/v1/reservations/mine/rate-plans').set('Authorization', `Bearer ${token}`).expect(403);
    await request(app.getHttpServer()).get('/api/v1/wallet').set('Authorization', `Bearer ${token}`).expect(403);
  });
});

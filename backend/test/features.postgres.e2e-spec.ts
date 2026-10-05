import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/common/prisma.service';

const describeIntegration = process.env.RUN_DB_INTEGRATION === '1' ? describe : describe.skip;

describeIntegration('Feature Control PostgreSQL contract', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let hotelId = '';
  let superToken = '';
  let adminToken = '';
  let corporateToken = '';
  let accountsToken = '';
  let viewerToken = '';
  let agentToken = '';
  let housekeepingTaskId = 'feature-e2e-housekeeping-task';
  let roomTypeId = '';
  let physicalRoomId = '';
  let ratePlanMasterId = '';
  let hotelBId = '';
  let hotelBInvoiceId = '';
  let hotelBCreditNoteId = '';
  let hotelBTdsId = '';
  let hotelBTaxRuleId = '';
  const password = process.env.E2E_ADMIN_PASSWORD;
  const agentPassword = process.env.E2E_AGENT_PASSWORD ?? process.env.SEED_AGENT_PASSWORD ?? 'Agent@Rainwood2026!';

  async function login(email: string) {
    const response = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password }).expect(201);
    return response.body.accessToken as string;
  }

  beforeAll(async () => {
    if (!password) throw new Error('E2E_ADMIN_PASSWORD is required for the feature control integration test.');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(process.env.API_PREFIX ?? 'api/v1');
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
    prisma = app.get(PrismaService);
    const propertyAdmin = await prisma.user.findUnique({ where: { email: 'hotel.admin@rainwood.demo' }, select: { staffHotelId: true } });
    hotelId = propertyAdmin?.staffHotelId ?? (await prisma.hotel.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
    superToken = await login(process.env.E2E_ADMIN_EMAIL ?? 'admin@rainwood.demo');
    adminToken = await login('hotel.admin@rainwood.demo');
    corporateToken = await login('corporate@rainwood.demo');
    accountsToken = await login('accounts@rainwood.demo');
    viewerToken = await login('viewer@rainwood.demo');
    agentToken = await request(app.getHttpServer()).post('/api/v1/auth/login').send({ email: 'agent@rainwood.demo', password: agentPassword }).expect(201).then((response) => response.body.accessToken as string);
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: 'admin@rainwood.demo' }, select: { id: true } });
    for (const featureKey of ['taxInvoices', 'creditNotes', 'tds', 'taxSettings', 'agents']) {
      await prisma.featureSetting.upsert({ where: { featureKey }, update: { enabled: true }, create: { featureKey, enabled: true } });
    }
    const roomType = await prisma.roomType.findFirstOrThrow({ where: { hotelId }, orderBy: { code: 'asc' }, select: { id: true } });
    roomTypeId = roomType.id;
    const physicalRoom = await prisma.room.findFirstOrThrow({ where: { hotelId }, orderBy: { roomNumber: 'asc' }, select: { id: true } });
    physicalRoomId = physicalRoom.id;
    ratePlanMasterId = (await prisma.ratePlanMaster.findFirstOrThrow({ where: { hotelId, code: 'A' }, select: { id: true } })).id;
    await prisma.housekeepingTask.deleteMany({ where: { id: housekeepingTaskId } });
    await prisma.housekeepingTask.create({ data: { id: housekeepingTaskId, hotelId, roomId: physicalRoomId, status: 'PENDING', createdById: admin.id, note: 'Feature control integration fixture' } });

    const suffix = Date.now().toString(36);
    const hotelB = await prisma.hotel.create({ data: { code: `RW-FEATURE-${suffix}`, name: 'Feature Control Hotel B', slug: `feature-control-hotel-b-${suffix}`, city: 'Kodaikanal', active: true } });
    hotelBId = hotelB.id;
    const corporate = await prisma.corporateAccount.findFirstOrThrow({ where: { name: 'Mountain View Conferences' }, select: { id: true } });
    const reservation = await prisma.reservation.create({ data: { reference: `RW-FEATURE-TAX-${suffix}`, hotelId: hotelBId, source: 'DIRECT', status: 'CONFIRMED', stayStatus: 'EXPECTED', paymentStatus: 'UNPAID', syncStatus: 'NOT_REQUIRED', guestName: 'Feature Control Guest', email: `feature-${suffix}@example.com`, mobile: '+919000010001', checkIn: new Date('2026-10-14T00:00:00.000Z'), checkOut: new Date('2026-10-16T00:00:00.000Z'), currency: 'INR', totalAmount: 11800, taxAmount: 1800, advanceAmount: 0, balanceAmount: 11800, priceSnapshot: { fixture: true }, policySnapshot: { fixture: true }, createdById: admin.id, corporateAccountId: corporate.id } });
    const invoice = await prisma.taxInvoice.create({ data: { hotelId: hotelBId, invoiceNo: `INV-FEATURE-${suffix}`, invoiceDate: new Date('2026-10-05T00:00:00.000Z'), financialYear: '2026-27', status: 'ISSUED', reservationId: reservation.id, customerType: 'CORPORATE', customerName: 'Mountain View Conferences', customerGstin: '33AACCM1234L1Z6', customerAddress: '18 Lake Road', customerState: 'Tamil Nadu', customerStateCode: '33', hotelLegalName: 'RainWood Hospitality Services Private Limited', hotelTradeName: hotelB.name, hotelGstin: '33AAECR1234K1Z5', hotelAddress: 'Feature Control Road', hotelCity: 'Kodaikanal', hotelState: 'Tamil Nadu', hotelStateCode: '33', hotelPostalCode: '624101', placeOfSupplyState: 'Tamil Nadu', placeOfSupplyStateCode: '33', taxableAmount: 10000, cgstAmount: 900, sgstAmount: 900, igstAmount: 0, otherTaxAmount: 0, roundOff: 0, grandTotal: 11800, currency: 'INR', issuedById: admin.id, issuedAt: new Date('2026-10-05T00:00:00.000Z') } });
    hotelBInvoiceId = invoice.id;
    await prisma.taxInvoiceLine.create({ data: { invoiceId: invoice.id, lineType: 'ROOM', description: 'Feature control room stay', serviceCode: '996311', quantity: 2, unitAmount: 5000, taxableAmount: 10000, taxRate: 18, cgstRate: 9, cgstAmount: 900, sgstRate: 9, sgstAmount: 900, igstRate: 0, igstAmount: 0, lineTotal: 11800, sourceType: 'ROOM_STAY', sourceId: reservation.id } });
    const creditNote = await prisma.taxCreditNote.create({ data: { hotelId: hotelBId, invoiceId: invoice.id, creditNoteNo: `CN-FEATURE-${suffix}`, creditNoteDate: new Date('2026-10-05T00:00:00.000Z'), financialYear: '2026-27', reason: 'Feature control fixture', status: 'ISSUED', taxableAmount: 100, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, roundOff: 0, grandTotal: 118, issuedById: admin.id, issuedAt: new Date('2026-10-05T00:00:00.000Z') } });
    hotelBCreditNoteId = creditNote.id;
    const tds = await prisma.tdsDeduction.create({ data: { hotelId: hotelBId, corporateAccountId: corporate.id, taxInvoiceId: invoice.id, deductionDate: new Date('2026-10-05T00:00:00.000Z'), sectionCode: '194-I', ratePercent: 2, grossInvoiceAmount: 11800, tdsAmount: 100, financialYear: '2026-27', status: 'CERTIFICATE_PENDING', notes: 'Feature control fixture', recordedById: admin.id } });
    hotelBTdsId = tds.id;
    const taxRule = await prisma.taxRule.create({ data: { hotelId: hotelBId, name: 'Feature Control GST Rule', taxCategory: 'ROOM', serviceCode: '996311', ratePercent: 18, effectiveFrom: new Date('2026-04-01T00:00:00.000Z'), active: true } });
    hotelBTaxRuleId = taxRule.id;
  });

  afterAll(async () => {
    if (hotelId) await prisma?.hotelFeatureOverride.deleteMany({ where: { hotelId } }).catch(() => undefined);
    if (housekeepingTaskId) await prisma?.housekeepingTask.deleteMany({ where: { id: housekeepingTaskId } }).catch(() => undefined);
    if (hotelBId) {
      await prisma?.hotel.update({ where: { id: hotelBId }, data: { active: false } }).catch(() => undefined);
      await prisma?.hotelFeatureOverride.deleteMany({ where: { hotelId: hotelBId } }).catch(() => undefined);
      await prisma?.tdsDeduction.deleteMany({ where: { hotelId: hotelBId } }).catch(() => undefined);
      await prisma?.taxCreditNote.deleteMany({ where: { hotelId: hotelBId } }).catch(() => undefined);
      await prisma?.taxInvoice.deleteMany({ where: { hotelId: hotelBId } }).catch(() => undefined);
      await prisma?.taxRule.deleteMany({ where: { hotelId: hotelBId } }).catch(() => undefined);
      await prisma?.reservation.deleteMany({ where: { hotelId: hotelBId } }).catch(() => undefined);
      await prisma?.hotel.delete({ where: { id: hotelBId } }).catch(() => undefined);
    }
    await app?.close();
  });

  it('enforces authenticated effective access, SUPER_ADMIN management, scoped denial, and reset inheritance', async () => {
    await request(app.getHttpServer()).get(`/api/v1/features/effective?hotelId=${hotelId}`).expect(401);
    for (const token of [superToken, adminToken, corporateToken, viewerToken]) {
      const response = await request(app.getHttpServer()).get(`/api/v1/features/effective?hotelId=${hotelId}`).set('Authorization', `Bearer ${token}`).expect(200);
      expect(response.body.features).toHaveLength(40);
    }
    await request(app.getHttpServer()).put(`/api/v1/features/${hotelId}`).set('Authorization', `Bearer ${superToken}`).send({ features: { banquets: false } }).expect(200);
    const effective = await request(app.getHttpServer()).get(`/api/v1/features/effective?hotelId=${hotelId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(effective.body.features.find((item: any) => item.key === 'banquets')).toMatchObject({ enabled: false, source: 'HOTEL_OVERRIDE' });
    await request(app.getHttpServer()).get(`/api/v1/banquets?hotelId=${hotelId}`).set('Authorization', `Bearer ${adminToken}`).expect(403);
    await request(app.getHttpServer()).delete(`/api/v1/features/${hotelId}/banquets`).set('Authorization', `Bearer ${superToken}`).expect(200);
    const inherited = await request(app.getHttpServer()).get(`/api/v1/features/effective?hotelId=${hotelId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
    expect(inherited.body.features.find((item: any) => item.key === 'banquets')).toMatchObject({ enabled: true, source: 'GROUP_DEFAULT' });
  });

  it('denies direct resource operations using the authoritative property entity', async () => {
    const set = { reservations: false, payments: false, housekeeping: false, maintenance: false, physicalRooms: false, ratePlans: false };
    await request(app.getHttpServer()).put(`/api/v1/features/${hotelId}`).set('Authorization', `Bearer ${superToken}`).send({ features: set }).expect(200);
    try {
      await request(app.getHttpServer()).get('/api/v1/reservations/RW-DEMO-001/detail').set('Authorization', `Bearer ${corporateToken}`).expect(403);
      await request(app.getHttpServer()).post('/api/v1/payments/RW-DEMO-001/manual').set('Authorization', `Bearer ${accountsToken}`).send({ amount: 100, mode: 'UPI', idempotencyKey: 'feature-e2e-payment' }).expect(403);
      await request(app.getHttpServer()).post(`/api/v1/housekeeping/tasks/${housekeepingTaskId}/assign`).set('Authorization', `Bearer ${corporateToken}`).send({}).expect(403);
      await request(app.getHttpServer()).get('/api/v1/maintenance/tickets/seed-maintenance-ticket-203').set('Authorization', `Bearer ${corporateToken}`).expect(403);
      await request(app.getHttpServer()).patch(`/api/v1/hotels/physical-rooms/${physicalRoomId}`).set('Authorization', `Bearer ${corporateToken}`).send({ status: 'AVAILABLE' }).expect(403);
      await request(app.getHttpServer()).patch(`/api/v1/hotels/rate-plan-masters/${ratePlanMasterId}`).set('Authorization', `Bearer ${corporateToken}`).send({ name: 'Feature test' }).expect(403);
      await request(app.getHttpServer()).get('/api/v1/reservations/RW-DEMO-001/detail').set('Authorization', `Bearer ${viewerToken}`).expect(403);
    } finally {
      await prisma.hotelFeatureOverride.deleteMany({ where: { hotelId } });
    }
  });

  it('enforces statutory direct-ID property overrides and preserves group/super-admin access', async () => {
    await request(app.getHttpServer()).put(`/api/v1/features/${hotelBId}`).set('Authorization', `Bearer ${superToken}`).send({ features: { taxInvoices: false, creditNotes: false, tds: false, taxSettings: false } }).expect(200);
    try {
      await request(app.getHttpServer()).get(`/api/v1/tax-invoices/${hotelBInvoiceId}`).set('Authorization', `Bearer ${accountsToken}`).expect(403);
      await request(app.getHttpServer()).get(`/api/v1/tax-invoices/${hotelBInvoiceId}/print`).set('Authorization', `Bearer ${corporateToken}`).expect(403);
      await request(app.getHttpServer()).get(`/api/v1/tax-credit-notes/${hotelBCreditNoteId}`).set('Authorization', `Bearer ${accountsToken}`).expect(403);
      await request(app.getHttpServer()).get(`/api/v1/tax-credit-notes/${hotelBCreditNoteId}/print`).set('Authorization', `Bearer ${corporateToken}`).expect(403);
      await request(app.getHttpServer()).post(`/api/v1/tax-invoices/${hotelBInvoiceId}/credit-notes`).set('Authorization', `Bearer ${accountsToken}`).send({ fullCredit: true, reason: 'Feature control test' }).expect(403);
      await request(app.getHttpServer()).post(`/api/v1/tax-invoices/${hotelBInvoiceId}/tds`).set('Authorization', `Bearer ${accountsToken}`).send({ deductionDate: '2026-10-05', tdsAmount: 1 }).expect(403);
      await request(app.getHttpServer()).post(`/api/v1/tds/${hotelBTdsId}/reverse`).set('Authorization', `Bearer ${accountsToken}`).send({ reason: 'Feature control test' }).expect(403);
      await request(app.getHttpServer()).patch(`/api/v1/tds/${hotelBTdsId}/certificate`).set('Authorization', `Bearer ${accountsToken}`).send({ certificateNumber: 'CERT-FEATURE-001', certificateDate: '2026-10-05' }).expect(403);
      await request(app.getHttpServer()).patch(`/api/v1/tax-settings/rules/${hotelBTaxRuleId}`).set('Authorization', `Bearer ${accountsToken}`).send({ hotelId, name: 'Cross-property attempt' }).expect(403);
      await request(app.getHttpServer()).get(`/api/v1/tax-invoices/${hotelBInvoiceId}`).set('Authorization', `Bearer ${superToken}`).expect(200);
      await request(app.getHttpServer()).get(`/api/v1/tax-credit-notes/${hotelBCreditNoteId}`).set('Authorization', `Bearer ${superToken}`).expect(200);
    } finally {
      await prisma.hotelFeatureOverride.deleteMany({ where: { hotelId: hotelBId } });
    }
    await prisma.hotelFeatureOverride.deleteMany({ where: { hotelId } });
    await prisma.featureSetting.upsert({ where: { featureKey: 'taxInvoices' }, update: { enabled: true }, create: { featureKey: 'taxInvoices', enabled: true } });
    const normalInvoice = await prisma.taxInvoice.findUnique({ where: { id: 'seed-tax-invoice-001' }, select: { hotelId: true } });
    const normalDefault = await prisma.featureSetting.findUnique({ where: { featureKey: 'taxInvoices' }, select: { enabled: true } });
    const normalOverride = await prisma.hotelFeatureOverride.findUnique({ where: { hotelId_featureKey: { hotelId, featureKey: 'taxInvoices' } } });
    expect(normalInvoice?.hotelId).toBe(hotelId);
    expect(normalDefault?.enabled).toBe(true);
    expect(normalOverride).toBeNull();
    await request(app.getHttpServer()).get('/api/v1/tax-invoices/seed-tax-invoice-001').set('Authorization', `Bearer ${corporateToken}`).expect(200);
  });

  it('keeps Agent self-service available while the admin Agents feature is disabled', async () => {
    await request(app.getHttpServer()).put(`/api/v1/features/${hotelId}`).set('Authorization', `Bearer ${superToken}`).send({ features: { agents: false } }).expect(200);
    try {
      await request(app.getHttpServer()).get(`/api/v1/users/agents?hotelId=${hotelId}`).set('Authorization', `Bearer ${corporateToken}`).expect(403);
      await request(app.getHttpServer()).get('/api/v1/agents/me/profile').set('Authorization', `Bearer ${agentToken}`).expect(200);
      await request(app.getHttpServer()).patch('/api/v1/agents/me/profile').set('Authorization', `Bearer ${agentToken}`).send({}).expect(200);
      await request(app.getHttpServer()).get('/api/v1/agents/me/documents').set('Authorization', `Bearer ${agentToken}`).expect(200);
      await request(app.getHttpServer()).patch('/api/v1/agents/me/password').set('Authorization', `Bearer ${agentToken}`).send({ currentPassword: agentPassword, newPassword: 'AgentFeatureTest@2026!' }).expect(200);
      await request(app.getHttpServer()).patch('/api/v1/agents/me/password').set('Authorization', `Bearer ${agentToken}`).send({ currentPassword: 'AgentFeatureTest@2026!', newPassword: agentPassword }).expect(200);
    } finally {
      await prisma.hotelFeatureOverride.deleteMany({ where: { hotelId } });
    }
  });

  it('keeps roomsInventory, physicalRooms, ratePlans, and inHouse independent', async () => {
    const set = async (features: Record<string, boolean>) => request(app.getHttpServer()).put(`/api/v1/features/${hotelId}`).set('Authorization', `Bearer ${superToken}`).send({ features }).expect(200);
    try {
      await set({ roomsInventory: false, physicalRooms: true, ratePlans: true });
      await request(app.getHttpServer()).get(`/api/v1/hotels/physical-rooms?hotelId=${hotelId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
      await request(app.getHttpServer()).post(`/api/v1/hotels/${hotelId}/rooms`).set('Authorization', `Bearer ${adminToken}`).send({ code: 'FEATURE-ROOM', name: 'Feature Room' }).expect(403);

      await set({ roomsInventory: true, physicalRooms: false, ratePlans: true });
      await request(app.getHttpServer()).get(`/api/v1/hotels/physical-rooms?hotelId=${hotelId}`).set('Authorization', `Bearer ${adminToken}`).expect(403);
      await request(app.getHttpServer()).get(`/api/v1/hotels/${hotelId}/catalog`).set('Authorization', `Bearer ${adminToken}`).expect(200);

      await set({ roomsInventory: true, physicalRooms: true, ratePlans: false });
      await request(app.getHttpServer()).post(`/api/v1/hotels/rooms/${roomTypeId}/rate-plans`).set('Authorization', `Bearer ${adminToken}`).send({ code: 'FEATURE-RATE', name: 'Feature Rate', mealPlan: 'EP' }).expect(403);

      await set({ reservations: true, inHouse: false });
      await request(app.getHttpServer()).get(`/api/v1/reservations?hotelId=${hotelId}`).set('Authorization', `Bearer ${adminToken}`).expect(200);
      await request(app.getHttpServer()).get(`/api/v1/reservations/in-house?hotelId=${hotelId}`).set('Authorization', `Bearer ${adminToken}`).expect(403);
    } finally {
      await prisma.hotelFeatureOverride.deleteMany({ where: { hotelId } });
    }
  });
});

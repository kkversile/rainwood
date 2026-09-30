import { config } from 'dotenv';
import { join } from 'path';
config({ path: join(__dirname, '../.env') });

import { DocumentSequenceType } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';
import { nextDocumentNumber } from '../src/common/document-sequences';

const runDatabaseTests = process.env.RUN_DB_INTEGRATION === '1';

(runDatabaseTests ? describe : describe.skip)('PostgreSQL hotel-local document sequence concurrency', () => {
  let prisma: PrismaService;
  let hotelId: string;
  const year = 2999;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    hotelId = (await prisma.hotel.findFirstOrThrow({ where: { active: true }, select: { id: true } })).id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.documentSequence.deleteMany({ where: { hotelId, year, type: { in: [DocumentSequenceType.EXPENSE, DocumentSequenceType.INQUIRY] } } });
      await prisma.$disconnect();
    }
  });

  it('allocates distinct expense and inquiry numbers when requests race', async () => {
    const expenses = await Promise.all(Array.from({ length: 2 }, () => nextDocumentNumber(prisma, hotelId, DocumentSequenceType.EXPENSE, year, 'EXP')));
    const inquiries = await Promise.all(Array.from({ length: 2 }, () => nextDocumentNumber(prisma, hotelId, DocumentSequenceType.INQUIRY, year, 'INQ')));
    expect(new Set(expenses).size).toBe(2);
    expect(new Set(inquiries).size).toBe(2);
    expect(await prisma.documentSequence.findUnique({ where: { hotelId_type_year: { hotelId, type: DocumentSequenceType.EXPENSE, year } } })).toEqual(expect.objectContaining({ lastNumber: 2 }));
    expect(await prisma.documentSequence.findUnique({ where: { hotelId_type_year: { hotelId, type: DocumentSequenceType.INQUIRY, year } } })).toEqual(expect.objectContaining({ lastNumber: 2 }));
  });
});

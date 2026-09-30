import { DocumentSequenceType } from '@prisma/client';

type SequenceDatabase = {
  documentSequence: {
    upsert(args: any): Promise<{ lastNumber: number }>;
  };
};

/**
 * Allocates the next hotel-local document number. Prisma translates this
 * upsert into a single PostgreSQL INSERT ... ON CONFLICT operation, so two
 * concurrent requests cannot receive the same sequence value.
 */
export async function nextDocumentNumber(db: SequenceDatabase, hotelId: string, type: DocumentSequenceType, year: number, prefix: string) {
  const sequence = await db.documentSequence.upsert({
    where: { hotelId_type_year: { hotelId, type, year } },
    create: { hotelId, type, year, lastNumber: 1 },
    update: { lastNumber: { increment: 1 } },
    select: { lastNumber: true },
  });
  return `${prefix}-${year}-${String(sequence.lastNumber).padStart(6, '0')}`;
}

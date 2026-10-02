import { TaxInvoiceStatus, TdsStatus, UserRole } from '@prisma/client';
import { TaxDocumentsService } from './tax-documents.service';

const actor = { id: 'actor', role: UserRole.SUPER_ADMIN, staffHotelId: null, staffDepartment: null, staffHotel: null };

function makeService(overrides: Record<string, any> = {}) {
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(actor) },
    taxInvoice: { findUnique: jest.fn() },
    taxCreditNote: { findUnique: jest.fn(), create: jest.fn() },
    tdsDeduction: { findUnique: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(async (callback: any) => callback(prisma)),
    ...overrides,
  };
  const audit = { log: jest.fn() };
  const tax = {};
  return { service: new TaxDocumentsService(prisma, audit as any, tax as any), prisma, audit };
}

function issuedInvoice(roundOff: number) {
  return {
    id: 'invoice-1',
    hotelId: 'hotel-1',
    status: TaxInvoiceStatus.ISSUED,
    roundOff,
    grandTotal: 118 + roundOff,
    hotel: { id: 'hotel-1', name: 'RainWood', timezoneName: 'Asia/Kolkata' },
    lines: [{ id: 'line-1', description: 'Room', serviceCode: '996311', taxableAmount: 100, taxRate: 18, cgstAmount: 9, sgstAmount: 9, igstAmount: 0, lineTotal: 118 }],
    creditNotes: [],
    tdsDeductions: [],
    reservation: { reference: 'RW-2026-000001', corporateAccountId: 'corporate-1', guestName: 'Demo Guest', payments: [] },
  };
}

describe('statutory finance hardening', () => {
  it('blocks TDS against a cancelled invoice before receivable processing', async () => {
    const { service, prisma } = makeService();
    prisma.taxInvoice.findUnique.mockResolvedValue({ ...issuedInvoice(0), status: TaxInvoiceStatus.CANCELLED });

    await expect(service.recordTds('actor', 'invoice-1', { deductionDate: '2026-10-02', tdsAmount: 1 })).rejects.toThrow('TDS can only be recorded against an issued tax invoice.');
  });

  it.each([0.01, -0.01])('full credit consumes the invoice round-off (%s) exactly once', async (roundOff) => {
    const { service, prisma } = makeService();
    const invoice = issuedInvoice(roundOff);
    prisma.taxInvoice.findUnique.mockResolvedValue(invoice);
    prisma.documentSequence = { upsert: jest.fn().mockResolvedValue({ lastNumber: 1 }) };
    prisma.taxCreditNote.create.mockImplementation(async ({ data }: any) => ({ id: 'credit-1', ...data }));

    const note = await service.creditNote('actor', 'invoice-1', { reason: 'Full statutory correction', fullCredit: true });

    expect(note.roundOff).toBe(roundOff);
    expect(note.grandTotal).toBe(118 + roundOff);
    expect(prisma.taxCreditNote.create.mock.calls[0][0].data.lines.create).toHaveLength(1);
  });

  it('moves a pending certificate to received and does not overwrite a received certificate', async () => {
    const { service, prisma, audit } = makeService();
    const pending = { id: 'tds-1', hotelId: 'hotel-1', status: TdsStatus.CERTIFICATE_PENDING, financialYear: '2026-27', certificateNumber: null, certificateDate: null, notes: null };
    prisma.tdsDeduction.findUnique.mockResolvedValue(pending);
    prisma.tdsDeduction.update.mockResolvedValue({ ...pending, status: TdsStatus.CERTIFICATE_RECEIVED, certificateNumber: 'TDS-001' });

    const received = await service.receiveTdsCertificate('actor', 'tds-1', { certificateNumber: 'TDS-001', certificateDate: '2026-10-02' });
    expect(received.status).toBe(TdsStatus.CERTIFICATE_RECEIVED);
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'TDS_CERTIFICATE_RECEIVED' }));

    prisma.tdsDeduction.findUnique.mockResolvedValue({ ...pending, status: TdsStatus.CERTIFICATE_RECEIVED, certificateNumber: 'TDS-001', certificateDate: new Date('2026-10-02T00:00:00.000Z') });
    await expect(service.receiveTdsCertificate('actor', 'tds-1', { certificateNumber: 'TDS-002', certificateDate: '2026-10-02' })).rejects.toThrow('cannot be overwritten');
  });

  it('does not write a duplicate issue audit when an invoice already exists', async () => {
    const existing = { id: 'invoice-1', invoiceNo: 'INV-2026-000001', lines: [] };
    const { service, prisma, audit } = makeService();
    prisma.reservation = { findUnique: jest.fn().mockResolvedValue({ id: 'reservation-1', hotelId: 'hotel-1', settlement: {}, stayStatus: 'CHECKED_OUT' }) };
    prisma.taxInvoice.findUnique.mockResolvedValue(existing);

    await expect(service.issue('actor', 'RW-2026-000001', {})).resolves.toEqual(existing);
    expect(audit.log).not.toHaveBeenCalled();
  });
});

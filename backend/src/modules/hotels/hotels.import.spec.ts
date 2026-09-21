import ExcelJS from 'exceljs';
import { HotelsService } from './hotels.service';

describe('base-rate Excel import', () => {
  it('maps Extra Adult and Extra Child columns to scalar RateDay fields', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Base Rates');
    sheet.addRow(['Room Code', 'Rate Plan Code', 'Date', 'Base Amount (INR)', 'Tax (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)', 'Extra Adult (INR)', 'Extra Child (INR)', 'CTA', 'CTD', 'Min LOS', 'Max LOS']);
    sheet.addRow(['DLX', 'BAR', '2026-10-01', 3500, 420, 3000, 3500, 4000, 4500, 800, 500, 'No', 'No', 1, 7]);
    const tx: any = { rateDay: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() } };
    const prisma: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', code: 'RW-OOTY', name: 'RainWood Ooty', rooms: [{ code: 'DLX', ratePlans: [{ id: 'plan-1', code: 'BAR', active: true, master: { active: true } }] }] }) },
      $transaction: jest.fn(async (work: any) => work(tx)),
      auditLog: { create: jest.fn() },
    };
    const service = new HotelsService(prisma, {} as any);
    const file = { originalname: 'base-rates.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) } as any;

    await expect(service.importBaseRates('hotel-1', file, 'admin-1')).resolves.toEqual(expect.objectContaining({ rowsImported: 1 }));
    expect(tx.rateDay.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ extraAdultAmount: 800, childAmount: 500, occupancyPrices: { single: 3000, double: 3500, triple: 4000, quad: 4500 } }),
    }));
  });
});

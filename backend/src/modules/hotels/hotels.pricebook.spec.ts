import ExcelJS from 'exceljs';
import { HotelsService } from './hotels.service';

describe('pricebook export', () => {
  it('exports supported occupancy prices and scalar guest charges', async () => {
    const prisma = {
      hotel: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          name: 'RainWood',
          rooms: [{
            code: 'DLX',
            name: 'Deluxe',
            inventory: [{ date: new Date('2026-10-01T00:00:00.000Z'), available: 4, stopSell: false }],
            ratePlans: [{
              code: 'BAR',
              name: 'Best Available',
              mealPlan: 'CP',
              rates: [{
                date: new Date('2026-10-01T00:00:00.000Z'),
                amount: 3500,
                taxAmount: 420,
                occupancyPrices: { single: 3000, double: 3500, triple: 4000, quad: 4500 },
                extraAdultAmount: 800,
                childAmount: 500,
                cta: false,
                ctd: false,
                minLos: 1,
                maxLos: 7,
              }],
            }],
          }],
        }),
      },
    };
    const service = new HotelsService(prisma as any, {} as any);
    const buffer = await service.pricebookExport('hotel-1');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.getWorksheet('Price Book')!;
    const headers = (sheet.getRow(3).values as unknown[]).slice(1);
    const values = (sheet.getRow(4).values as unknown[]).slice(1);

    expect(headers).toEqual(['Hotel', 'Room Code', 'Room', 'Rate Plan Code', 'Rate Plan', 'Meal Plan', 'Date', 'Inventory Available', 'Stop Sell', 'Base Amount (INR)', 'Tax (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)', 'Extra Adult Charge (INR)', 'Child Charge (INR)', 'CTA', 'CTD', 'Min LOS', 'Max LOS']);
    expect(values[11]).toBe(3000);
    expect(values[12]).toBe(3500);
    expect(values[13]).toBe(4000);
    expect(values[14]).toBe(4500);
    expect(values[15]).toBe(800);
    expect(values[16]).toBe(500);
    expect(headers.some((header) => String(header).toLowerCase().includes('extra bed'))).toBe(false);
  });
});

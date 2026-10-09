import ExcelJS from 'exceljs';
import { HotelRateImportService } from './hotel-rate-import.service';

const hotel = {
  id: 'hotel-1', code: 'RW-TEST', name: 'RainWood Test', active: true,
  rooms: [{
    id: 'room-1', code: 'DLX', name: 'Deluxe', active: true,
    commonRoomType: null,
    ratePlans: [{ id: 'plan-1', code: 'EP', name: 'Room Only', mealPlan: 'EP', active: true, master: { code: 'EP', mealPlan: 'EP', active: true } }],
  }],
};

function createService() {
  const tx: any = {
    $executeRawUnsafe: jest.fn(),
    rateDay: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    agentCategoryRateDay: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    commonRoomType: { upsert: jest.fn().mockResolvedValue({ id: 'common-1' }) },
    roomType: { update: jest.fn() },
  };
  const prisma: any = {
    hotel: { findUnique: jest.fn().mockResolvedValue(hotel) },
    $transaction: jest.fn(async (work: any) => work(tx)),
    auditLog: { create: jest.fn() },
  };
  return { service: new HotelRateImportService(prisma), tx, prisma };
}

async function workbook(sheetName: string, headers: string[], rows: unknown[][]) {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet(sheetName);
  sheet.addRow(headers);
  rows.forEach((row) => sheet.addRow(row));
  return book;
}

const categories = ['RACK', 'A', 'B', 'C', 'D', 'E'];
const amountValues = [1000, 1200, 300, 150, 100];

describe('hotel-wide rate import', () => {
  it('creates a hotel template with all six categories and stable identifiers', async () => {
    const { service } = createService();
    const buffer = await service.template('hotel-1', 'HOTEL', '2030-01-01', '2030-01-01');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as any);
    const sheet = book.getWorksheet('Rate Master Rates')!;
    expect(sheet.getRow(1).values).toEqual(expect.arrayContaining(['Room Type ID', 'Rate Plan ID', 'Category']));
    expect(sheet.getColumn(3).hidden).toBe(true);
    expect(sheet.getColumn(6).hidden).toBe(true);
    expect(sheet.rowCount).toBe(7);
    expect(sheet.getRow(2).getCell(11).value).toBe('RACK');
    expect(sheet.getRow(7).getCell(11).value).toBe('E');
  });

  it('writes RACK to RateDay and A-E to AgentCategoryRateDay', async () => {
    const { service, tx } = createService();
    const headers = ['Hotel Code', 'Hotel', 'Room Type ID', 'Room Code', 'Room', 'Rate Plan ID', 'Rate Plan Code', 'Rate Plan', 'Meal Plan', 'Date', 'Category', 'Single (INR)', 'Double (INR)', 'Extra Adult (INR)', 'Child With Bed (INR)', 'Child Without Bed (INR)'];
    const rows = categories.map((category) => ['RW-TEST', 'RainWood Test', 'room-1', 'DLX', 'Deluxe', 'plan-1', 'EP', 'Room Only', 'EP', '2030-01-01', category, ...amountValues]);
    const book = await workbook('Rate Master Rates', headers, rows);
    const result = await (service as any).importHotelRates(hotel, book, { from: new Date('2030-01-01T00:00:00.000Z'), to: new Date('2030-01-01T00:00:00.000Z') }, 'admin-1');
    expect(result).toEqual(expect.objectContaining({ rowsImported: 6, rowsInvalid: 0 }));
    expect(tx.rateDay.upsert).toHaveBeenCalledTimes(1);
    expect(tx.rateDay.upsert.mock.calls[0][0].create.occupancyPrices).toEqual({ single: 1000, double: 1200 });
    expect(tx.agentCategoryRateDay.upsert).toHaveBeenCalledTimes(5);
    expect(tx.agentCategoryRateDay.upsert.mock.calls[0][0].create.childWithoutBedAmount).toBe(100);
  });

  it('rejects an incomplete category set without writing rows', async () => {
    const { service, tx } = createService();
    const headers = ['Hotel Code', 'Room Type ID', 'Room Code', 'Rate Plan ID', 'Rate Plan Code', 'Date', 'Category', 'Single (INR)', 'Double (INR)', 'Extra Adult (INR)', 'Child With Bed (INR)', 'Child Without Bed (INR)'];
    const book = await workbook('Rate Master Rates', headers, categories.slice(0, 5).map((category) => ['RW-TEST', 'room-1', 'DLX', 'plan-1', 'EP', '2030-01-01', category, ...amountValues]));
    const result = await (service as any).importHotelRates(hotel, book, { from: new Date('2030-01-01T00:00:00.000Z'), to: new Date('2030-01-01T00:00:00.000Z') }, 'admin-1');
    expect(result.rowsImported).toBe(0);
    expect(result.errors.some((error: any) => error.message.includes('Missing categories'))).toBe(true);
    expect(tx.rateDay.upsert).not.toHaveBeenCalled();
  });
});

describe('common room-type rate import', () => {
  it('creates a common template with mapping and rate worksheets', async () => {
    const { service } = createService();
    const buffer = await service.template('hotel-1', 'COMMON', '2030-01-01', '2030-01-01');
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(buffer as any);
    expect(book.getWorksheet('Common Room Mapping')).toBeDefined();
    expect(book.getWorksheet('Common Room Rates')).toBeDefined();
    expect(book.getWorksheet('Instructions')).toBeDefined();
  });

  it('maps room types and applies common rates to mapped plans', async () => {
    const { service, tx } = createService();
    const mapping = await workbook('Common Room Mapping', ['Hotel Code', 'Hotel', 'Room Type ID', 'Room Code', 'Room', 'Common Room Type Code', 'Common Room Type Name'], [['RW-TEST', 'RainWood Test', 'room-1', 'DLX', 'Deluxe', 'DELUXE', 'Deluxe Room']]);
    const rates = await workbook('Common Room Rates', ['Common Room Type Code', 'Rate Plan Code', 'Meal Plan', 'Date', 'Category', 'Single (INR)', 'Double (INR)', 'Extra Adult (INR)', 'Child With Bed (INR)', 'Child Without Bed (INR)'], categories.map((category) => ['DELUXE', 'EP', 'EP', '2030-01-01', category, ...amountValues]));
    const book = new ExcelJS.Workbook();
    const mappingSource = mapping.getWorksheet('Common Room Mapping')!;
    const rateSource = rates.getWorksheet('Common Room Rates')!;
    const mappingTarget = book.addWorksheet('Common Room Mapping');
    const rateTarget = book.addWorksheet('Common Room Rates');
    mappingSource.eachRow((row) => mappingTarget.addRow(row.values as unknown[]).commit());
    rateSource.eachRow((row) => rateTarget.addRow(row.values as unknown[]).commit());
    const result = await (service as any).importCommonRates(hotel, book, { from: new Date('2030-01-01T00:00:00.000Z'), to: new Date('2030-01-01T00:00:00.000Z') }, 'admin-1');
    expect(result).toEqual(expect.objectContaining({ rowsImported: 6, affectedRooms: 1, commonRoomTypes: 1 }));
    expect(tx.commonRoomType.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { code: 'DELUXE' } }));
    expect(tx.roomType.update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data: { commonRoomTypeId: 'common-1' } });
    expect(tx.rateDay.upsert).toHaveBeenCalledTimes(1);
    expect(tx.agentCategoryRateDay.upsert).toHaveBeenCalledTimes(5);
  });
});

import ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { HotelsService } from './hotels.service';

const master = { id: 'master-1', hotelId: 'hotel-1', code: 'BAR', name: 'Best Available', mealPlan: 'EP', active: true };

async function fileFromRows(rows: unknown[][], context = false) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Rate Plan Rates');
  if (context) {
    sheet.addRow(['Hotel', 'RainWood Ooty']);
    sheet.addRow(['Rate Plan', master.name]);
    sheet.addRow(['Rate Plan Code', master.code]);
    sheet.addRow(['Meal Plan', master.mealPlan]);
    sheet.addRow([]);
  }
  rows.forEach((row) => sheet.addRow(row));
  return { originalname: 'rate-plan-rates.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) } as any;
}

function serviceWithRooms(roomPlans: unknown[][], transaction?: any) {
  const tx = transaction ?? { rateDay: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() } };
  const prisma: any = {
    hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', code: 'RW-OOTY', name: 'RainWood Ooty', rooms: roomPlans.map((ratePlans, index) => ({ id: `room-${index}`, code: index === 0 ? 'DLX' : 'SUITE', name: index === 0 ? 'Deluxe Room' : 'Suite', active: true, ratePlans })) }) },
    ratePlanMaster: { findUnique: jest.fn().mockResolvedValue(master) },
    $transaction: jest.fn(async (work: any) => work(tx)),
    auditLog: { create: jest.fn() },
  };
  return { prisma, tx, service: new HotelsService(prisma, {} as any) };
}

describe('base-rate Excel import', () => {
  it('maps Extra Adult and Extra Child columns to scalar RateDay fields', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Base Rates');
    sheet.addRow(['Room Code', 'Rate Plan Code', 'Date', 'Base Amount (INR)', 'Tax (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)', 'Extra Adult (INR)', 'Extra Child (INR)', 'CTA', 'CTD', 'Min LOS', 'Max LOS']);
    sheet.addRow(['DLX', 'BAR', '2026-10-01', 3500, 420, 3000, 3500, 4000, 4500, 800, 500, 'No', 'No', 1, 7]);
    const tx: any = { rateDay: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() } };
    const prisma: any = {
      hotel: { findUnique: jest.fn().mockResolvedValue({ id: 'hotel-1', code: 'RW-OOTY', name: 'RainWood Ooty', rooms: [{ code: 'DLX', active: true, ratePlans: [{ id: 'plan-1', masterId: 'master-1', code: 'BAR', active: true, master: { active: true } }] }] }) },
      ratePlanMaster: { findUnique: jest.fn().mockResolvedValue({ id: 'master-1', hotelId: 'hotel-1', code: 'BAR', name: 'Best Available', mealPlan: 'EP', active: true }) },
      $transaction: jest.fn(async (work: any) => work(tx)),
      auditLog: { create: jest.fn() },
    };
    const service = new HotelsService(prisma, {} as any);
    const file = { originalname: 'base-rates.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) } as any;

    await expect(service.importBaseRates('hotel-1', 'master-1', file, 'admin-1')).resolves.toEqual(expect.objectContaining({ rowsImported: 1 }));
    expect(tx.rateDay.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ extraAdultAmount: 800, childAmount: 500, occupancyPrices: { single: 3000, double: 3500, triple: 4000, quad: 4500 } }),
    }));
  });

  it('generates a context-aware template with only active rooms assigned to the selected master', async () => {
    const { service } = serviceWithRooms([
      [{ id: 'plan-1', masterId: 'master-1', active: true }],
      [{ id: 'plan-2', masterId: 'other-master', active: true }],
      [{ id: 'plan-3', masterId: 'master-1', active: false }],
    ]);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await service.baseRateTemplate('hotel-1', 'master-1') as any);
    const sheet = workbook.getWorksheet('Rate Plan Rates')!;
    const instructions = workbook.getWorksheet('Instructions')!;
    expect(sheet.getCell('B1').value).toBe('RainWood Ooty');
    expect(sheet.getCell('B3').value).toBe('BAR');
    expect(sheet.getRow(6).values).toEqual(expect.arrayContaining(['Room Code', 'Room', 'Date', 'Base Amount (INR)']));
    expect(sheet.getRow(7).getCell(1).value).toBe('DLX');
    expect(sheet.rowCount).toBe(7);
    expect(instructions.getCell('A1').value).toBe('SAMPLE DATA - DO NOT IMPORT THIS SHEET');
    expect(instructions.getRow(9).getCell(4).value).toBe(5000);
  });

  it('rejects a master selected from another hotel before creating a workbook or rate', async () => {
    const { service, prisma } = serviceWithRooms([[{ id: 'plan-1', masterId: 'master-1', active: true }]]);
    prisma.ratePlanMaster.findUnique.mockResolvedValue({ ...master, hotelId: 'hotel-2' });
    await expect(service.baseRateTemplate('hotel-1', 'master-1')).rejects.toThrow('Selected rate plan does not belong to this hotel.');
    await expect(service.importBaseRates('hotel-1', 'master-1', await fileFromRows([]), 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects imports for an inactive selected master', async () => {
    const { service, prisma } = serviceWithRooms([[{ id: 'plan-1', masterId: 'master-1', active: true }]]);
    prisma.ratePlanMaster.findUnique.mockResolvedValue({ ...master, active: false });
    await expect(service.importBaseRates('hotel-1', 'master-1', await fileFromRows([]), 'admin-1')).rejects.toThrow('Selected rate plan is inactive.');
  });

  it('resolves a room only through the selected master and rejects a mismatched workbook plan code atomically', async () => {
    const { service, tx } = serviceWithRooms([[{ id: 'plan-1', masterId: 'master-1', code: 'BAR', active: true }]]);
    const file = await fileFromRows([
      ['Room Code', 'Room', 'Rate Plan Code', 'Date', 'Base Amount (INR)'],
      ['DLX', 'Deluxe Room', 'OTHER', '2026-10-01', 3500],
    ]);
    const result = await service.importBaseRates('hotel-1', 'master-1', file, 'admin-1');
    expect(result.rowsImported).toBe(0);
    expect(result.errors[0]).toEqual(expect.objectContaining({ field: 'Rate Plan Code' }));
    expect(tx.rateDay.upsert).not.toHaveBeenCalled();
  });

  it('rejects an unassigned room and duplicate room/date rows without partial writes', async () => {
    const { service, tx } = serviceWithRooms([[{ id: 'plan-1', masterId: 'master-1', code: 'BAR', active: true }], []]);
    const file = await fileFromRows([
      ['Room Code', 'Date', 'Base Amount (INR)'],
      ['DLX', '2026-10-01', 3500],
      ['DLX', '2026-10-01', 3600],
      ['SUITE', '2026-10-02', 4200],
    ]);
    const result = await service.importBaseRates('hotel-1', 'master-1', file, 'admin-1');
    expect(result.rowsImported).toBe(0);
    expect(result.rowsInvalid).toBe(2);
    expect(result.errors.map((error) => error.message)).toEqual(expect.arrayContaining(['Duplicate rate row for this room and date', 'This rate plan is not assigned to room SUITE.']));
    expect(tx.rateDay.upsert).not.toHaveBeenCalled();
  });

  it('updates existing RateDay rows, creates new rows, and never accesses AgentRateDay', async () => {
    const tx: any = { rateDay: { findUnique: jest.fn().mockResolvedValueOnce({ id: 'existing-rate' }).mockResolvedValueOnce(null), upsert: jest.fn() }, agentRateDay: { findUnique: jest.fn(), upsert: jest.fn() } };
    const { service, prisma } = serviceWithRooms([[{ id: 'plan-1', masterId: 'master-1', code: 'BAR', active: true }]], tx);
    const file = await fileFromRows([
      ['Room Code', 'Date', 'Base Amount (INR)', 'Extra Adult Charge (INR)', 'Child Charge (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)'],
      ['DLX', '2026-10-01', 3500, 800, 500, 3000, 3500, 4000, 4500],
      ['DLX', '2026-10-02', 3600, 850, 550, 3100, 3600, 4100, 4600],
    ]);
    const result = await service.importBaseRates('hotel-1', 'master-1', file, 'admin-1');
    expect(result).toEqual(expect.objectContaining({ rowsImported: 2, rowsUpdated: 1, rowsInvalid: 0 }));
    expect(tx.rateDay.upsert).toHaveBeenCalledTimes(2);
    expect(tx.rateDay.upsert.mock.calls[0][0].update).toEqual(expect.objectContaining({ extraAdultAmount: 800, childAmount: 500, occupancyPrices: { single: 3000, double: 3500, triple: 4000, quad: 4500 } }));
    expect(tx.agentRateDay.findUnique).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'RATE_PLAN_RATES_EXCEL_IMPORTED', entityId: 'master-1' }) }));
  });
});

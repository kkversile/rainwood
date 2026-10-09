import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import ExcelJS from 'exceljs';
import { addDays, eachNight, parseDateOnly, parseExcelDateOnly, toDateOnly } from '../../common/dates';
import { assertActorCanManageHotel } from '../../common/role-scope';
import { PrismaService } from '../../common/prisma.service';

type ImportScope = 'HOTEL' | 'COMMON';
type Category = 'RACK' | 'A' | 'B' | 'C' | 'D' | 'E';
type Amounts = { single: number; double: number; extraAdult: number; childWithBed: number; childWithoutBed: number };
type ImportError = { row: number; field: string; message: string };

const CATEGORIES: Category[] = ['RACK', 'A', 'B', 'C', 'D', 'E'];
const AMOUNT_FIELDS = ['single', 'double', 'extra adult', 'child with bed', 'child without bed'];

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function text(value: unknown) {
  if (value && typeof value === 'object' && 'result' in value) return String((value as { result?: unknown }).result ?? '').trim();
  return String(value ?? '').trim();
}

function cellText(row: ExcelJS.Row, headers: Map<string, number>, ...names: string[]) {
  const index = names.map((name) => headers.get(normalize(name))).find((value): value is number => value !== undefined);
  return index === undefined ? '' : text(row.getCell(index).value);
}

function rawCell(row: ExcelJS.Row, headers: Map<string, number>, ...names: string[]) {
  const index = names.map((name) => headers.get(normalize(name))).find((value): value is number => value !== undefined);
  return index === undefined ? undefined : row.getCell(index).value;
}

function numeric(row: ExcelJS.Row, headers: Map<string, number>, field: string, aliases: string[], errors: ImportError[], required = true) {
  const raw = cellText(row, headers, ...aliases);
  if (!raw && !required) return undefined;
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < 0) {
    errors.push({ row: row.number, field, message: required ? 'A non-negative number is required.' : 'Must be a non-negative number.' });
    return null;
  }
  return value;
}

function parseScope(value?: string): ImportScope {
  const scope = String(value ?? 'HOTEL').toUpperCase();
  if (scope !== 'HOTEL' && scope !== 'COMMON') throw new BadRequestException('Import scope must be HOTEL or COMMON.');
  return scope;
}

function parseRange(from?: string, to?: string) {
  if (!from && !to) return undefined;
  if (!from || !to) throw new BadRequestException('from and to must be selected together.');
  const start = parseDateOnly(from, 'from');
  const end = parseDateOnly(to, 'to');
  if (start > end) throw new BadRequestException('from must be on or before to.');
  if (eachNight(start, addDays(end, 1)).length > 370) throw new BadRequestException('Rate imports are limited to 370 days per workbook.');
  return { from: start, to: end };
}

function addInstructions(workbook: ExcelJS.Workbook, scope: ImportScope, hotel: { code: string; name: string }, from?: string, to?: string, room?: { code: string; name: string }) {
  const sheet = workbook.addWorksheet('Instructions');
  sheet.addRow(['RainWood Hotels rate import']);
  sheet.addRow([scope === 'HOTEL' ? 'Hotel room-type rate import' : 'Common room-type rate import']);
  sheet.addRow(['Hotel', `${hotel.name} (${hotel.code})`]);
  if (room) sheet.addRow(['Room Type', `${room.name} (${room.code})`]);
  if (from && to) sheet.addRow(['Date range', `${from} to ${to}`]);
  sheet.addRow([]);
  sheet.addRow(['Important']);
  sheet.addRow(['Complete all required rate rows before uploading. The workbook is validated completely before anything is saved.']);
  sheet.addRow(['Each room/rate-plan/date combination must contain exactly six categories: RACK, A, B, C, D and E.']);
  sheet.addRow(['Amounts are INR and may be zero. Do not rename or delete the required worksheet or columns.']);
  sheet.addRow([]);
  sheet.addRow(['Sample rate row']);
  sheet.addRow(['Date', 'Category', 'Single', 'Double', 'Extra Adult', 'Child With Bed', 'Child Without Bed']);
  sheet.addRow(['2030-01-01', 'RACK', 4000, 4500, 1200, 600, 400]);
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } };
  sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B45309' } };
  sheet.getRow(11).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(11).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } };
  sheet.getRow(12).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(12).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } };
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 26 : 24; });
  sheet.views = [{ showGridLines: false }];
}

function styleTable(sheet: ExcelJS.Worksheet, headerRow: number, firstDataRow: number) {
  const header = sheet.getRow(headerRow);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  sheet.views = [{ state: 'frozen', ySplit: headerRow, showGridLines: false }];
  sheet.autoFilter = { from: `A${headerRow}`, to: `${String.fromCharCode(64 + Math.min(sheet.columnCount, 26))}${Math.max(firstDataRow, sheet.rowCount)}` };
  sheet.columns.forEach((column, index) => { column.width = index === 0 ? 18 : index === 1 ? 24 : index === 2 ? 18 : 16; });
  for (let rowNumber = firstDataRow; rowNumber <= sheet.rowCount; rowNumber += 1) {
    sheet.getRow(rowNumber).eachCell((cell) => { cell.alignment = { vertical: 'middle' }; });
  }
}

function rangeDates(from?: string, to?: string) {
  if (!from || !to) return [null as Date | null];
  return eachNight(parseDateOnly(from, 'from'), addDays(parseDateOnly(to, 'to'), 1));
}

function addBlankAmounts(row: ExcelJS.Row) {
  row.getCell(12).numFmt = '#,##0.00';
  row.getCell(13).numFmt = '#,##0.00';
  row.getCell(14).numFmt = '#,##0.00';
  row.getCell(15).numFmt = '#,##0.00';
  row.getCell(16).numFmt = '#,##0.00';
}

@Injectable()
export class HotelRateImportService {
  constructor(private readonly prisma: PrismaService) {}

  private async hotelContext(hotelId: string, roomTypeId?: string) {
    const hotel = await this.prisma.hotel.findUnique({
      where: { id: hotelId },
      select: {
        id: true, code: true, name: true, active: true,
        rooms: {
          where: { active: true, ...(roomTypeId ? { id: roomTypeId } : {}) },
          orderBy: { code: 'asc' },
          select: {
            id: true, code: true, name: true, active: true,
            commonRoomType: { select: { id: true, code: true, name: true, active: true } },
            ratePlans: { where: { active: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, mealPlan: true, active: true, master: { select: { code: true, mealPlan: true, active: true } } } },
          },
        },
      },
    });
    if (!hotel || !hotel.active) throw new NotFoundException('Hotel not found.');
    if (roomTypeId && !hotel.rooms.length) throw new NotFoundException('Room type not found for this hotel.');
    return hotel;
  }

  async template(hotelId: string, requestedScope?: string, from?: string, to?: string, roomTypeId?: string) {
    const scope = parseScope(requestedScope);
    const hotel = await this.hotelContext(hotelId, roomTypeId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RainWood Hotels';
    workbook.created = new Date();
    addInstructions(workbook, scope, hotel, from, to, roomTypeId ? hotel.rooms[0] : undefined);
    if (scope === 'HOTEL') this.addHotelTemplate(workbook, hotel, from, to);
    else this.addCommonTemplate(workbook, hotel, from, to);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private addHotelTemplate(workbook: ExcelJS.Workbook, hotel: any, from?: string, to?: string) {
    const sheet = workbook.addWorksheet('Rate Master Rates');
    const headers = ['Hotel Code', 'Hotel', 'Room Type ID', 'Room Code', 'Room', 'Rate Plan ID', 'Rate Plan Code', 'Rate Plan', 'Meal Plan', 'Date', 'Category', 'Single (INR)', 'Double (INR)', 'Extra Adult (INR)', 'Child With Bed (INR)', 'Child Without Bed (INR)'];
    sheet.addRow(headers);
    const dates = rangeDates(from, to);
    for (const room of hotel.rooms) for (const plan of room.ratePlans) for (const date of dates) for (const category of CATEGORIES) {
      const row = sheet.addRow([hotel.code, hotel.name, room.id, room.code, room.name, plan.id, plan.code, plan.name, plan.mealPlan, date ? toDateOnly(date) : '', category, '', '', '', '', '']);
      addBlankAmounts(row);
    }
    if (!hotel.rooms.length || !hotel.rooms.some((room: any) => room.ratePlans.length)) sheet.addRow(['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheet.getColumn(3).hidden = true;
    sheet.getColumn(6).hidden = true;
    styleTable(sheet, 1, 2);
  }

  private addCommonTemplate(workbook: ExcelJS.Workbook, hotel: any, from?: string, to?: string) {
    const mapping = workbook.addWorksheet('Common Room Mapping');
    mapping.addRow(['Hotel Code', 'Hotel', 'Room Type ID', 'Room Code', 'Room', 'Common Room Type Code', 'Common Room Type Name']);
    for (const room of hotel.rooms) mapping.addRow([hotel.code, hotel.name, room.id, room.code, room.name, room.commonRoomType?.code ?? '', room.commonRoomType?.name ?? '']);
    mapping.getColumn(3).hidden = true;
    styleTable(mapping, 1, 2);

    const rates = workbook.addWorksheet('Common Room Rates');
    rates.addRow(['Common Room Type Code', 'Rate Plan Code', 'Meal Plan', 'Date', 'Category', 'Single (INR)', 'Double (INR)', 'Extra Adult (INR)', 'Child With Bed (INR)', 'Child Without Bed (INR)']);
    const grouped = new Map<string, any>();
    for (const room of hotel.rooms) for (const plan of room.ratePlans) if (room.commonRoomType?.code) grouped.set(`${room.commonRoomType.code}:${plan.code}:${plan.mealPlan}`, { commonCode: room.commonRoomType.code, plan });
    const dates = rangeDates(from, to);
    for (const item of grouped.values()) for (const date of dates) for (const category of CATEGORIES) rates.addRow([item.commonCode, item.plan.code, item.plan.mealPlan, date ? toDateOnly(date) : '', category, '', '', '', '', '']);
    if (!grouped.size) rates.addRow(['', '', '', '', '', '', '', '', '', '']);
    rates.getColumn(6).numFmt = '#,##0.00'; rates.getColumn(7).numFmt = '#,##0.00'; rates.getColumn(8).numFmt = '#,##0.00'; rates.getColumn(9).numFmt = '#,##0.00'; rates.getColumn(10).numFmt = '#,##0.00';
    styleTable(rates, 1, 2);
  }

  private findHeader(sheet: ExcelJS.Worksheet, required: string[]) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
      const candidate = new Map<string, number>();
      sheet.getRow(rowNumber).eachCell((cell, index) => { const key = normalize(cell.value); if (key) candidate.set(key, index); });
      if (required.every((name) => candidate.has(normalize(name)))) return { rowNumber, headers: candidate };
    }
    throw new BadRequestException(`Missing required columns: ${required.join(', ')}.`);
  }

  private async workbook(file: Express.Multer.File) {
    if (!file?.buffer || !/\.(xlsx|xlsm)$/i.test(file.originalname ?? '')) throw new BadRequestException('Upload an .xlsx workbook.');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    return workbook;
  }

  private parseAmounts(row: ExcelJS.Row, headers: Map<string, number>, errors: ImportError[], aliases: Record<keyof Amounts, string[]>) {
    const values = {
      single: numeric(row, headers, 'Single', aliases.single, errors),
      double: numeric(row, headers, 'Double', aliases.double, errors),
      extraAdult: numeric(row, headers, 'Extra Adult', aliases.extraAdult, errors),
      childWithBed: numeric(row, headers, 'Child With Bed', aliases.childWithBed, errors),
      childWithoutBed: numeric(row, headers, 'Child Without Bed', aliases.childWithoutBed, errors),
    };
    return Object.values(values).some((value) => value === null || value === undefined) ? null : values as Amounts;
  }

  private rowHasData(row: ExcelJS.Row) {
    let hasValue = false;
    row.eachCell((cell) => { if (text(cell.value) !== '') hasValue = true; });
    return row.actualCellCount > 0 && hasValue;
  }

  private validateCoverage(rows: Array<{ planId: string; date: string; category: Category }>, errors: ImportError[]) {
    const categories = new Map<string, Set<Category>>();
    for (const row of rows) {
      const key = `${row.planId}:${row.date}`;
      const set = categories.get(key) ?? new Set<Category>();
      set.add(row.category);
      categories.set(key, set);
    }
    for (const [key, set] of categories) {
      const missing = CATEGORIES.filter((category) => !set.has(category));
      if (missing.length) errors.push({ row: 0, field: 'Category', message: `Missing categories for ${key}: ${missing.join(', ')}.` });
    }
  }

  async importRates(hotelId: string, requestedScope: string | undefined, from?: string, to?: string, file?: Express.Multer.File, actorUserId?: string, roomTypeId?: string) {
    const scope = parseScope(requestedScope);
    const range = parseRange(from, to);
    await assertActorCanManageHotel(this.prisma, actorUserId!, hotelId);
    const hotel = await this.hotelContext(hotelId, roomTypeId);
    const workbook = await this.workbook(file!);
    const result = scope === 'HOTEL'
      ? await this.importHotelRates(hotel, workbook, range, actorUserId!)
      : await this.importCommonRates(hotel, workbook, range, actorUserId!);
    return result;
  }

  private async importHotelRates(hotel: any, workbook: ExcelJS.Workbook, range: { from: Date; to: Date } | undefined, actorUserId: string) {
    const sheet = workbook.getWorksheet('Rate Master Rates');
    if (!sheet) throw new BadRequestException('Workbook must contain a "Rate Master Rates" worksheet.');
    const required = ['Hotel Code', 'Room Type ID', 'Room Code', 'Rate Plan ID', 'Rate Plan Code', 'Date', 'Category', ...AMOUNT_FIELDS.map((field) => `${field} (INR)`)];
    const { rowNumber: headerRow, headers } = this.findHeader(sheet, required);
    const roomById = new Map<string, any>(hotel.rooms.map((room: any) => [room.id, room] as [string, any]));
    const roomByCode = new Map<string, any>(hotel.rooms.map((room: any) => [room.code.toLowerCase(), room] as [string, any]));
    const planById = new Map<string, { plan: any; room: any }>(hotel.rooms.flatMap((room: any) => room.ratePlans.map((plan: any) => [plan.id, { plan, room }] as [string, { plan: any; room: any }])));
    const errors: ImportError[] = [];
    const rows: Array<{ row: number; planId: string; date: Date; category: Category; amounts: Amounts }> = [];
    const seen = new Set<string>();
    const received = new Set<number>();
    for (let number = headerRow + 1; number <= sheet.rowCount; number += 1) {
      const row = sheet.getRow(number);
      if (!this.rowHasData(row)) continue;
      const hasKey = ['Room Type ID', 'Room Code', 'Rate Plan ID', 'Rate Plan Code', 'Date', 'Category'].some((field) => cellText(row, headers, field));
      if (!hasKey) continue;
      received.add(number);
      const workbookHotel = cellText(row, headers, 'Hotel Code');
      if (workbookHotel && workbookHotel.toLowerCase() !== hotel.code.toLowerCase()) errors.push({ row: number, field: 'Hotel Code', message: `Workbook hotel must be ${hotel.code}.` });
      const roomId = cellText(row, headers, 'Room Type ID');
      const room = roomById.get(roomId) ?? roomByCode.get(cellText(row, headers, 'Room Code').toLowerCase());
      if (!room) errors.push({ row: number, field: 'Room Type ID', message: 'Room type is not active or does not belong to this hotel.' });
      const planId = cellText(row, headers, 'Rate Plan ID');
      const resolved = planById.get(planId) ?? (room ? { room, plan: room.ratePlans.find((candidate: any) => candidate.code.toLowerCase() === cellText(row, headers, 'Rate Plan Code').toLowerCase()) } : undefined);
      if (!resolved?.plan || resolved.room.id !== room?.id) errors.push({ row: number, field: 'Rate Plan', message: 'Rate plan is not active and assigned to the selected room type.' });
      const category = cellText(row, headers, 'Category').toUpperCase() as Category;
      if (!CATEGORIES.includes(category)) errors.push({ row: number, field: 'Category', message: 'Category must be RACK, A, B, C, D or E.' });
      let date: Date | undefined;
      try { date = parseExcelDateOnly(rawCell(row, headers, 'Date'), 'Date'); } catch { errors.push({ row: number, field: 'Date', message: 'Invalid date.' }); }
      if (date && range && (date < range.from || date > range.to)) errors.push({ row: number, field: 'Date', message: 'Date is outside the selected import range.' });
      const amounts = this.parseAmounts(row, headers, errors, { single: ['Single (INR)', 'Single'], double: ['Double (INR)', 'Double'], extraAdult: ['Extra Adult (INR)', 'Extra Adult'], childWithBed: ['Child With Bed (INR)', 'Child With Bed'], childWithoutBed: ['Child Without Bed (INR)', 'Child Without Bed'] });
      if (!resolved?.plan || !date || !CATEGORIES.includes(category) || !amounts) continue;
      const key = `${resolved.plan.id}:${toDateOnly(date)}:${category}`;
      if (seen.has(key)) { errors.push({ row: number, field: 'Category', message: 'Duplicate room, rate plan, date and category row.' }); continue; }
      seen.add(key);
      rows.push({ row: number, planId: resolved.plan.id, date, category, amounts });
    }
    this.validateCoverage(rows.map((row) => ({ planId: row.planId, date: toDateOnly(row.date), category: row.category })), errors);
    if (errors.length) return { rowsReceived: received.size, rowsValid: Math.max(0, received.size - new Set(errors.filter((error) => error.row > 0).map((error) => error.row)).size), rowsInvalid: new Set(errors.filter((error) => error.row > 0).map((error) => error.row)).size, rowsImported: 0, rowsUpdated: 0, affectedRooms: 0, errors };
    return this.persistRows(rows, hotel.id, hotel.code, actorUserId, 'HOTEL', received.size);
  }

  private async importCommonRates(hotel: any, workbook: ExcelJS.Workbook, range: { from: Date; to: Date } | undefined, actorUserId: string) {
    const mapping = workbook.getWorksheet('Common Room Mapping');
    const rates = workbook.getWorksheet('Common Room Rates');
    if (!mapping || !rates) throw new BadRequestException('Common imports require "Common Room Mapping" and "Common Room Rates" worksheets.');
    const mappingHeader = this.findHeader(mapping, ['Hotel Code', 'Room Type ID', 'Room Code', 'Common Room Type Code']);
    const rateHeader = this.findHeader(rates, ['Common Room Type Code', 'Rate Plan Code', 'Date', 'Category', ...AMOUNT_FIELDS.map((field) => `${field} (INR)`) ]);
    const roomById = new Map<string, any>(hotel.rooms.map((room: any) => [room.id, room] as [string, any]));
    const roomByCode = new Map<string, any>(hotel.rooms.map((room: any) => [room.code.toLowerCase(), room] as [string, any]));
    const errors: ImportError[] = [];
    const mappings = new Map<string, { room: any; commonCode: string; commonName: string }>();
    for (let number = mappingHeader.rowNumber + 1; number <= mapping.rowCount; number += 1) {
      const row = mapping.getRow(number);
      if (!this.rowHasData(row)) continue;
      const roomId = cellText(row, mappingHeader.headers, 'Room Type ID');
      const room = roomById.get(roomId) ?? roomByCode.get(cellText(row, mappingHeader.headers, 'Room Code').toLowerCase());
      const workbookHotel = cellText(row, mappingHeader.headers, 'Hotel Code');
      if (workbookHotel && workbookHotel.toLowerCase() !== hotel.code.toLowerCase()) errors.push({ row: number, field: 'Hotel Code', message: `Workbook hotel must be ${hotel.code}.` });
      const commonCode = cellText(row, mappingHeader.headers, 'Common Room Type Code').toUpperCase();
      if (!room) errors.push({ row: number, field: 'Room Type ID', message: 'Room type is not active or does not belong to this hotel.' });
      if (!commonCode) errors.push({ row: number, field: 'Common Room Type Code', message: 'Common Room Type Code is required.' });
      if (room && commonCode) {
        if (mappings.has(room.id)) errors.push({ row: number, field: 'Room Type ID', message: 'Duplicate room type mapping.' });
        mappings.set(room.id, { room, commonCode, commonName: cellText(row, mappingHeader.headers, 'Common Room Type Name') || commonCode });
      }
    }
    if (!mappings.size) errors.push({ row: 0, field: 'Common Room Mapping', message: 'At least one room type mapping is required.' });
    const mappedByCode = new Map<string, Array<{ room: any; commonCode: string; commonName: string }>>();
    for (const item of mappings.values()) mappedByCode.set(item.commonCode, [...(mappedByCode.get(item.commonCode) ?? []), item]);
    const rows: Array<{ row: number; planId: string; date: Date; category: Category; amounts: Amounts }> = [];
    const seen = new Set<string>();
    const received = new Set<number>();
    const commonNames = new Map<string, string>();
    for (let number = rateHeader.rowNumber + 1; number <= rates.rowCount; number += 1) {
      const row = rates.getRow(number);
      if (!this.rowHasData(row)) continue;
      const commonCode = cellText(row, rateHeader.headers, 'Common Room Type Code').toUpperCase();
      if (!commonCode && !cellText(row, rateHeader.headers, 'Date')) continue;
      received.add(number);
      if (!mappedByCode.has(commonCode)) errors.push({ row: number, field: 'Common Room Type Code', message: `No room type mapping exists for ${commonCode || '(blank)'}.` });
      const planCode = cellText(row, rateHeader.headers, 'Rate Plan Code').toLowerCase();
      const mealPlan = cellText(row, rateHeader.headers, 'Meal Plan').toUpperCase();
      const targets = mappedByCode.get(commonCode) ?? [];
      const targetPlans = targets.flatMap((target) => target.room.ratePlans.filter((plan: any) => plan.active && plan.code.toLowerCase() === planCode && (!mealPlan || String(plan.mealPlan).toUpperCase() === mealPlan)).map((plan: any) => ({ plan, target })));
      if (!targetPlans.length) errors.push({ row: number, field: 'Rate Plan Code', message: `No active rate plan ${cellText(row, rateHeader.headers, 'Rate Plan Code')} exists for mapped room types.` });
      const category = cellText(row, rateHeader.headers, 'Category').toUpperCase() as Category;
      if (!CATEGORIES.includes(category)) errors.push({ row: number, field: 'Category', message: 'Category must be RACK, A, B, C, D or E.' });
      let date: Date | undefined;
      try { date = parseExcelDateOnly(rawCell(row, rateHeader.headers, 'Date'), 'Date'); } catch { errors.push({ row: number, field: 'Date', message: 'Invalid date.' }); }
      if (date && range && (date < range.from || date > range.to)) errors.push({ row: number, field: 'Date', message: 'Date is outside the selected import range.' });
      const amounts = this.parseAmounts(row, rateHeader.headers, errors, { single: ['Single (INR)', 'Single'], double: ['Double (INR)', 'Double'], extraAdult: ['Extra Adult (INR)', 'Extra Adult'], childWithBed: ['Child With Bed (INR)', 'Child With Bed'], childWithoutBed: ['Child Without Bed (INR)', 'Child Without Bed'] });
      if (targets.length) commonNames.set(commonCode, targets[0].commonName);
      if (!date || !amounts || !CATEGORIES.includes(category)) continue;
      for (const target of targetPlans) {
        const key = `${target.plan.id}:${toDateOnly(date)}:${category}`;
        if (seen.has(key)) { errors.push({ row: number, field: 'Category', message: 'Duplicate common room type, room, date and category row.' }); continue; }
        seen.add(key);
        rows.push({ row: number, planId: target.plan.id, date, category, amounts });
      }
    }
    this.validateCoverage(rows.map((row) => ({ planId: row.planId, date: toDateOnly(row.date), category: row.category })), errors);
    if (errors.length) return { rowsReceived: received.size, rowsValid: Math.max(0, received.size - new Set(errors.filter((error) => error.row > 0).map((error) => error.row)).size), rowsInvalid: new Set(errors.filter((error) => error.row > 0).map((error) => error.row)).size, rowsImported: 0, rowsUpdated: 0, affectedRooms: mappings.size, errors };
    const result = await this.persistRows(rows, hotel.id, hotel.code, actorUserId, 'COMMON', received.size, async (tx) => {
      for (const item of mappings.values()) {
        const common = await tx.commonRoomType.upsert({ where: { code: item.commonCode }, update: { name: item.commonName, active: true }, create: { code: item.commonCode, name: item.commonName, active: true } });
        await tx.roomType.update({ where: { id: item.room.id }, data: { commonRoomTypeId: common.id } });
      }
    });
    return { ...result, affectedRooms: mappings.size, commonRoomTypes: commonNames.size };
  }

  private async persistRows(rows: Array<{ row: number; planId: string; date: Date; category: Category; amounts: Amounts }>, hotelId: string, hotelCode: string, actorUserId: string, scope: ImportScope, rowsReceived: number, beforeRows?: (tx: Prisma.TransactionClient) => Promise<void>) {
    let rowsUpdated = 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `rate-import:${hotelId}`);
      await beforeRows?.(tx);
      for (const row of rows) {
        if (row.category === 'RACK') {
          const existing = await tx.rateDay.findUnique({ where: { ratePlanId_date: { ratePlanId: row.planId, date: row.date } }, select: { id: true } });
          if (existing) rowsUpdated += 1;
          await tx.rateDay.upsert({
            where: { ratePlanId_date: { ratePlanId: row.planId, date: row.date } },
            update: { amount: row.amounts.double, baseAmount: row.amounts.double, occupancyPrices: { single: row.amounts.single, double: row.amounts.double }, extraAdultAmount: row.amounts.extraAdult, childAmount: row.amounts.childWithBed, childWithoutBedAmount: row.amounts.childWithoutBed, updatedFromAxisAt: null },
            create: { ratePlanId: row.planId, date: row.date, amount: row.amounts.double, baseAmount: row.amounts.double, occupancyPrices: { single: row.amounts.single, double: row.amounts.double }, extraAdultAmount: row.amounts.extraAdult, childAmount: row.amounts.childWithBed, childWithoutBedAmount: row.amounts.childWithoutBed, taxAmount: 0, minLos: 1, updatedFromAxisAt: null },
          });
        } else {
          const existing = await tx.agentCategoryRateDay.findUnique({ where: { ratePlanId_category_date: { ratePlanId: row.planId, category: row.category, date: row.date } }, select: { id: true } });
          if (existing) rowsUpdated += 1;
          await tx.agentCategoryRateDay.upsert({
            where: { ratePlanId_category_date: { ratePlanId: row.planId, category: row.category, date: row.date } },
            update: { singleAmount: row.amounts.single, doubleAmount: row.amounts.double, extraAdultAmount: row.amounts.extraAdult, childWithBedAmount: row.amounts.childWithBed, childWithoutBedAmount: row.amounts.childWithoutBed, active: true, updatedById: actorUserId },
            create: { ratePlanId: row.planId, category: row.category, date: row.date, singleAmount: row.amounts.single, doubleAmount: row.amounts.double, extraAdultAmount: row.amounts.extraAdult, childWithBedAmount: row.amounts.childWithBed, childWithoutBedAmount: row.amounts.childWithoutBed, active: true, createdById: actorUserId, updatedById: actorUserId },
          });
        }
      }
    });
    await this.prisma.auditLog.create({ data: { actorUserId, action: scope === 'HOTEL' ? 'HOTEL_RATE_MASTER_EXCEL_IMPORTED' : 'COMMON_ROOM_RATE_EXCEL_IMPORTED', entityType: 'Hotel', entityId: hotelId, after: { hotelId, hotelCode, scope, rowsImported: rows.length, rowsUpdated } as Prisma.InputJsonValue } });
    return { rowsReceived, rowsValid: rowsReceived, rowsInvalid: 0, rowsImported: rows.length, rowsUpdated, affectedRooms: 0, errors: [] as ImportError[] };
  }
}

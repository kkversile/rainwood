import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { normalizeOccupancyPrices } from '../../common/rate-pricing';
import { parseDateOnly, parseExcelDateOnly } from '../../common/dates';
import { AmenityDto, CopyRatePlanDto, HotelContentDto, HotelDocumentDto, HotelDocumentUpdateDto, HotelImageDto, HotelImageOrderDto, HotelImageUpdateDto, HotelLocationAttractionDto, HotelLocationProfileDto, HotelLocationTransportDto, HotelPolicyDto, HotelReviewDto, HotelVideoDto, InventoryBatchDto, RateBatchDto, RatePlanAssignmentDto, RatePlanAssignmentUpdateDto, RatePlanDto, RatePlanMasterDto, RoomTypeDto } from './hotels.dto';
import { FilesService } from '../files/files.service';
import ExcelJS from 'exceljs';
import { canonicalMealPlan, canonicalRatePlanCode } from './rate-plan.utils';
import { mapImportedRateFields } from '../../common/excel-rate-fields';

@Injectable()
export class HotelsService {
  constructor(private prisma: PrismaService, private files: FilesService) {}

  list() {
    return this.prisma.hotel.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] },
        videos: { orderBy: { createdAt: 'desc' } },
        amenities: { include: { amenity: true } },
        rooms: { where: { active: true }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true, master: { active: true } } } } },
      },
    });
  }

  async detail(slug: string) {
    const hotel = await this.prisma.hotel.findFirst({
      where: { slug, active: true },
      include: {
        images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] },
        videos: { orderBy: { createdAt: 'desc' } },
        amenities: { include: { amenity: true } },
        taxes: { where: { active: true } },
        charges: { where: { active: true } },
        rooms: { where: { active: true }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true, master: { active: true } } } } },
      },
    });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return hotel;
  }

  create(body: HotelContentDto) {
    return this.prisma.hotel.create({ data: { ...body, slug: body.slug.toLowerCase().trim() } });
  }

  async update(id: string, body: Partial<HotelContentDto>) {
    const hotel = await this.prisma.hotel.findUnique({ where: { id } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    return this.prisma.hotel.update({ where: { id }, data: { ...body, slug: body.slug?.toLowerCase().trim() } });
  }

  async policy(hotelId: string) { await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } }); return this.prisma.hotelPolicy.findUnique({ where: { hotelId } }); }
  async savePolicy(hotelId: string, body: HotelPolicyDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    if (body.childMinAge !== undefined && body.childMaxAge !== undefined && body.childMinAge > body.childMaxAge) throw new BadRequestException('Child minimum age cannot be greater than maximum age');
    const rules = body.cancellationRules ?? [];
    for (const rule of rules) {
      if (rule.fromDays > rule.toDays) throw new BadRequestException('Cancellation policy From days cannot exceed To days');
      if (rule.chargeType === 'PERCENT' && rule.charge > 100) throw new BadRequestException('Cancellation percentage cannot exceed 100');
    }
    const orderedRules = [...rules].sort((a, b) => a.fromDays - b.fromDays);
    for (let index = 1; index < orderedRules.length; index += 1) {
      if (orderedRules[index].fromDays <= orderedRules[index - 1].toDays) throw new BadRequestException('Cancellation policy day ranges cannot overlap');
    }
    const data = { ...body, cancellationRules: body.cancellationRules as any };
    return this.prisma.hotelPolicy.upsert({ where: { hotelId }, create: { hotelId, ...data }, update: data });
  }
  async contacts(hotelId: string) { await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } }); return this.prisma.hotelContact.findMany({ where: { hotelId }, orderBy: [{ primary: 'desc' }, { name: 'asc' }] }); }
  async addContact(hotelId: string, body: any) { await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } }); if (body.primary) await this.prisma.hotelContact.updateMany({ where: { hotelId }, data: { primary: false } }); return this.prisma.hotelContact.create({ data: { hotelId, ...body } }); }
  async updateContact(id: string, body: any) { const contact = await this.prisma.hotelContact.findUniqueOrThrow({ where: { id } }); if (body.primary) await this.prisma.hotelContact.updateMany({ where: { hotelId: contact.hotelId, id: { not: id } }, data: { primary: false } }); return this.prisma.hotelContact.update({ where: { id }, data: body }); }
  deleteContact(id: string) { return this.prisma.hotelContact.delete({ where: { id } }); }
  async documents(hotelId: string) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const documents = await this.prisma.hotelDocument.findMany({ where: { hotelId }, orderBy: { createdAt: 'desc' } });
    const files = await this.prisma.storedFile.findMany({ where: { id: { in: documents.map((document) => document.fileId) } }, select: { id: true, mimeType: true, size: true } });
    return documents.map((document) => ({ ...document, mimeType: files.find((file) => file.id === document.fileId)?.mimeType ?? null, size: files.find((file) => file.id === document.fileId)?.size ?? null }));
  }
  async addDocument(hotelId: string, body: any) { await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } }); return this.prisma.hotelDocument.create({ data: { hotelId, ...body, expiryDate: body.expiryDate ? new Date(body.expiryDate) : undefined } }); }
  async updateDocument(id: string, body: HotelDocumentUpdateDto) {
    await this.prisma.hotelDocument.findUniqueOrThrow({ where: { id } });
    return this.prisma.hotelDocument.update({ where: { id }, data: { ...body, expiryDate: body.expiryDate === null ? null : body.expiryDate ? new Date(body.expiryDate) : undefined } });
  }
  async deleteDocument(id: string) { const document = await this.prisma.hotelDocument.delete({ where: { id } }); await this.files.remove(document.fileId); return { deleted: true, id }; }

  async location(hotelId: string) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const [profile, attractions, transports] = await Promise.all([
      this.prisma.hotelLocationProfile.findUnique({ where: { hotelId } }),
      this.prisma.hotelLocationAttraction.findMany({ where: { hotelId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.hotelLocationTransport.findMany({ where: { hotelId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    return { profile, attractions, transports };
  }

  async saveLocation(hotelId: string, body: HotelLocationProfileDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    return this.prisma.hotelLocationProfile.upsert({ where: { hotelId }, create: { hotelId, ...body }, update: body });
  }

  async addLocationAttraction(hotelId: string, body: HotelLocationAttractionDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const count = await this.prisma.hotelLocationAttraction.count({ where: { hotelId } });
    return this.prisma.hotelLocationAttraction.create({ data: { hotelId, name: body.name.trim(), distance: body.distance.trim(), sortOrder: body.sortOrder ?? count } });
  }

  async updateLocationAttraction(id: string, body: Partial<HotelLocationAttractionDto>) {
    await this.prisma.hotelLocationAttraction.findUniqueOrThrow({ where: { id } });
    return this.prisma.hotelLocationAttraction.update({ where: { id }, data: { ...body, name: body.name?.trim(), distance: body.distance?.trim() } });
  }

  async deleteLocationAttraction(id: string) {
    await this.prisma.hotelLocationAttraction.delete({ where: { id } });
    return { deleted: true, id };
  }

  async addLocationTransport(hotelId: string, body: HotelLocationTransportDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const count = await this.prisma.hotelLocationTransport.count({ where: { hotelId } });
    return this.prisma.hotelLocationTransport.create({ data: { hotelId, type: body.type, name: body.name.trim(), distance: body.distance.trim(), sortOrder: body.sortOrder ?? count } });
  }

  async updateLocationTransport(id: string, body: Partial<HotelLocationTransportDto>) {
    await this.prisma.hotelLocationTransport.findUniqueOrThrow({ where: { id } });
    return this.prisma.hotelLocationTransport.update({ where: { id }, data: { ...body, name: body.name?.trim(), distance: body.distance?.trim() } });
  }

  async deleteLocationTransport(id: string) {
    await this.prisma.hotelLocationTransport.delete({ where: { id } });
    return { deleted: true, id };
  }

  async catalog(hotelId: string, startDate?: string, endDate?: string) {
    const from = startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined;
    const to = endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined;
    const validRange = from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to;
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: { images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] }, videos: { orderBy: { createdAt: 'desc' } }, amenities: { include: { amenity: true } }, rooms: { orderBy: { name: 'asc' }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { orderBy: { name: 'asc' }, include: { master: true, rates: { where: validRange ? { date: { gte: from, lte: to } } : undefined, orderBy: { date: 'asc' }, take: 370 } } }, inventory: { where: validRange ? { date: { gte: from, lte: to } } : undefined, orderBy: { date: 'asc' }, take: 370 } } } } });
    const today = new Date().toISOString().slice(0, 10);
    return { ...hotel, rooms: hotel.rooms.map((room) => ({ ...room, totalRooms: room.roomsAvailable, todayAvailable: room.inventory.find((day) => day.date.toISOString().slice(0, 10) === today)?.available ?? null })) };
  }

  async pricebookExport(hotelId: string) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: { rooms: { orderBy: { name: 'asc' }, include: { ratePlans: { orderBy: { name: 'asc' }, include: { rates: { orderBy: { date: 'asc' } } } }, inventory: { orderBy: { date: 'asc' } } } } } });
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'RainWood Hotels'; workbook.created = new Date();
    const sheet = workbook.addWorksheet('Price Book');
    const columns = ['Hotel', 'Room Code', 'Room', 'Rate Plan Code', 'Rate Plan', 'Meal Plan', 'Date', 'Inventory Available', 'Stop Sell', 'Base Amount (INR)', 'Tax (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)', 'Extra Adult Charge (INR)', 'Child Charge (INR)', 'CTA', 'CTD', 'Min LOS', 'Max LOS'];
    sheet.addRow([`${hotel.name} Price Book`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheet.addRow([`All rooms and rate plans · exported ${new Date().toISOString().slice(0, 10)}`]);
    const header = sheet.addRow(columns); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } }; header.alignment = { vertical: 'middle', wrapText: true };
    for (const room of hotel.rooms) for (const plan of room.ratePlans) {
      const rateByDate = new Map(plan.rates.map((rate) => [rate.date.toISOString().slice(0, 10), rate]));
      const inventoryByDate = new Map(room.inventory.map((day) => [day.date.toISOString().slice(0, 10), day]));
      const dates = [...new Set([...rateByDate.keys(), ...inventoryByDate.keys()])].sort();
      for (const date of dates) {
        const rate = rateByDate.get(date); const inventory = inventoryByDate.get(date); const occupancy = (rate?.occupancyPrices ?? {}) as Record<string, unknown>;
        sheet.addRow([hotel.name, room.code, room.name, plan.code, plan.name, plan.mealPlan, date, inventory?.available ?? '', inventory?.stopSell ? 'Yes' : 'No', rate ? Number(rate.amount) : '', rate ? Number(rate.taxAmount) : '', occupancy.single ?? '', occupancy.double ?? '', occupancy.triple ?? '', occupancy.quad ?? '', rate ? Number(rate.extraAdultAmount) : '', rate ? Number(rate.childAmount) : '', rate?.cta ? 'Yes' : 'No', rate?.ctd ? 'Yes' : 'No', rate?.minLos ?? '', rate?.maxLos ?? '']);
      }
    }
    sheet.views = [{ state: 'frozen', ySplit: 3 }]; sheet.autoFilter = { from: 'A3', to: `U${sheet.rowCount}` };
    sheet.columns.forEach((column, index) => { column.width = index === 0 ? 28 : index === 2 || index === 4 ? 24 : index === 5 ? 18 : 16; });
    for (const row of sheet.getRows(4, Math.max(0, sheet.rowCount - 3)) ?? []) row.eachCell((cell, columnNumber) => { if (typeof cell.value === 'number' && columnNumber >= 10 && columnNumber <= 17) cell.numFmt = '#,##0.00'; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async baseRateTemplate(hotelId?: string) {
    const hotel = hotelId ? await this.prisma.hotel.findUnique({ where: { id: hotelId }, include: { rooms: { include: { ratePlans: true } } } }) : null;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Base Rates');
    const columns = ['Hotel', 'Room Code', 'Rate Plan Code', 'Date', 'Base Amount (INR)', 'Tax (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)', 'Extra Adult (INR)', 'Extra Child (INR)', 'CTA', 'CTD', 'Min LOS', 'Max LOS'];
    const header = sheet.addRow(columns);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    sheet.addRow([hotel?.name ?? 'Hotel name or code', hotel?.rooms[0]?.code ?? 'DLX', hotel?.rooms[0]?.ratePlans[0]?.code ?? 'BAR', new Date().toISOString().slice(0, 10), 0, 0, '', '', '', '', '', '', 'No', 'No', 1, '']);
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
    sheet.autoFilter = { from: 'A1', to: `P${sheet.rowCount}` };
    sheet.columns.forEach((column, index) => { column.width = index === 0 ? 28 : index === 1 || index === 2 ? 20 : 16; });
    for (const row of sheet.getRows(2, sheet.rowCount - 1) ?? []) row.eachCell((cell, columnNumber) => { if (typeof cell.value === 'number' && columnNumber >= 5 && columnNumber <= 12) cell.numFmt = '#,##0.00'; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importBaseRates(hotelId: string, file: Express.Multer.File, actorUserId: string) {
    if (!file?.buffer || !/\.(xlsx|xlsm)$/i.test(file.originalname ?? '')) throw new BadRequestException('Upload an .xlsx workbook');
    const hotel = await this.prisma.hotel.findUnique({ where: { id: hotelId }, include: { rooms: { include: { ratePlans: { include: { master: true } } } } } });
    if (!hotel) throw new NotFoundException('Hotel not found');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) throw new BadRequestException('Workbook must contain a worksheet');
    const headers = new Map<string, number>();
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, index) => { const key = String(cell.value ?? '').trim().toLowerCase(); if (key) headers.set(key, index); });
    const required = ['room code', 'rate plan code', 'date', 'base amount (inr)'];
    const missing = required.filter((key) => !headers.has(key));
    if (missing.length) throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
    const cellValue = (row: ExcelJS.Row, key: string) => { const index = headers.get(key); return index ? row.getCell(index).value : undefined; };
    const cellText = (row: ExcelJS.Row, key: string) => { const value = cellValue(row, key); return value && typeof value === 'object' && 'result' in value ? String(value.result ?? '') : String(value ?? '').trim(); };
    const numeric = (row: ExcelJS.Row, key: string, requiredValue = false) => { const raw = cellText(row, key); if (!raw && !requiredValue) return undefined; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? value : null; };
    const boolean = (row: ExcelJS.Row, key: string) => { const raw = cellText(row, key).toLowerCase(); if (!raw) return undefined; if (['yes', 'true', '1'].includes(raw)) return true; if (['no', 'false', '0'].includes(raw)) return false; return null; };
    const roomMap = new Map(hotel.rooms.map((room) => [room.code.toLowerCase(), room]));
    const errors: { row: number; field: string; message: string }[] = [];
    const rows: { rowNumber: number; planId: string; date: Date; data: Prisma.RateDayUpdateInput; create: Prisma.RateDayCreateInput; key: string }[] = [];
    const receivedRows = new Set<number>();
    const seen = new Set<string>();
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber); if (!row.actualCellCount) continue;
      receivedRows.add(rowNumber);
      const roomCode = cellText(row, 'room code'); const planCode = cellText(row, 'rate plan code'); const dateText = cellText(row, 'date');
      const workbookHotel = cellText(row, 'hotel');
      if (workbookHotel && ![hotel.id, hotel.code, hotel.name].some((value) => value.toLowerCase() === workbookHotel.toLowerCase())) errors.push({ row: rowNumber, field: 'Hotel', message: `Row belongs to another hotel: "${workbookHotel}"` });
      const room = roomMap.get(roomCode.toLowerCase()); const plan = room?.ratePlans.find((candidate) => candidate.code.toLowerCase() === planCode.toLowerCase());
      if (!room) errors.push({ row: rowNumber, field: 'Room Code', message: `Unknown room code "${roomCode}"` });
      if (room && !plan) errors.push({ row: rowNumber, field: 'Rate Plan Code', message: `Unknown rate plan code "${planCode}" for room "${roomCode}"` });
      if (plan && (!plan.active || !plan.master.active)) errors.push({ row: rowNumber, field: 'Rate Plan Code', message: 'Rate plan or master is inactive' });
      let date: Date | undefined;
      try { date = parseExcelDateOnly(cellValue(row, 'date'), 'date'); } catch { errors.push({ row: rowNumber, field: 'Date', message: 'Invalid date' }); }
      const amount = numeric(row, 'base amount (inr)', true); if (amount === null) errors.push({ row: rowNumber, field: 'Base Amount', message: 'Must be a non-negative number' });
      const tax = numeric(row, 'tax (inr)'); if (tax === null) errors.push({ row: rowNumber, field: 'Tax', message: 'Must be a non-negative number' });
      const occupancy: Record<string, number> = {};
      for (const key of ['single (inr)', 'double (inr)', 'triple (inr)', 'quad (inr)'] as const) { const value = numeric(row, key); if (value === null) errors.push({ row: rowNumber, field: key, message: 'Must be a non-negative number' }); else if (value !== undefined) occupancy[key.replace(' (inr)', '')] = value; }
      const extraAdult = numeric(row, 'extra adult (inr)'); if (extraAdult === null) errors.push({ row: rowNumber, field: 'Extra Adult', message: 'Must be a non-negative number' });
      const child = numeric(row, 'extra child (inr)'); if (child === null) errors.push({ row: rowNumber, field: 'Extra Child', message: 'Must be a non-negative number' });
      const mappedGuestFields = mapImportedRateFields({ ...occupancy, extraAdultAmount: extraAdult ?? undefined, childAmount: child ?? undefined });
      const cta = boolean(row, 'cta'); const ctd = boolean(row, 'ctd');
      if (cta === null) errors.push({ row: rowNumber, field: 'CTA', message: 'Use Yes or No' }); if (ctd === null) errors.push({ row: rowNumber, field: 'CTD', message: 'Use Yes or No' });
      const minLos = numeric(row, 'min los'); const maxLos = numeric(row, 'max los'); const minLosValue = minLos === null ? undefined : minLos; const maxLosValue = maxLos === null ? undefined : maxLos;
      if (minLosValue !== undefined && (!Number.isInteger(minLosValue) || minLosValue < 1)) errors.push({ row: rowNumber, field: 'Min LOS', message: 'Must be a positive integer' });
      if (maxLosValue !== undefined && (!Number.isInteger(maxLosValue) || maxLosValue < 1)) errors.push({ row: rowNumber, field: 'Max LOS', message: 'Must be a positive integer' });
      if (minLosValue !== undefined && maxLosValue !== undefined && maxLosValue < minLosValue) errors.push({ row: rowNumber, field: 'Max LOS', message: 'Cannot be below Min LOS' });
      if (!plan || !date || amount === null) continue;
      const key = `${plan.id}:${date.toISOString().slice(0, 10)}`; if (seen.has(key)) { errors.push({ row: rowNumber, field: 'Date', message: 'Duplicate rate row for this rate plan and date' }); continue; } seen.add(key);
      const data = { amount: amount as number, ...(tax !== undefined && tax !== null ? { taxAmount: tax } : {}), ...(mappedGuestFields.childAmount !== undefined ? { childAmount: mappedGuestFields.childAmount } : {}), ...(mappedGuestFields.extraAdultAmount !== undefined ? { extraAdultAmount: mappedGuestFields.extraAdultAmount } : {}), ...(mappedGuestFields.occupancyPrices ? { occupancyPrices: mappedGuestFields.occupancyPrices as Prisma.InputJsonValue } : {}), ...(cta !== undefined && cta !== null ? { cta } : {}), ...(ctd !== undefined && ctd !== null ? { ctd } : {}), ...(minLosValue !== undefined ? { minLos: minLosValue } : {}), ...(maxLosValue !== undefined ? { maxLos: maxLosValue } : {}), updatedFromAxisAt: null };
      rows.push({ rowNumber, planId: plan.id, date, data, create: { ratePlan: { connect: { id: plan.id } }, date, amount: amount as number, taxAmount: tax ?? 0, childAmount: child ?? 0, extraAdultAmount: extraAdult ?? 0, occupancyPrices: mappedGuestFields.occupancyPrices ? mappedGuestFields.occupancyPrices as Prisma.InputJsonValue : undefined, cta: cta ?? false, ctd: ctd ?? false, minLos: minLosValue ?? 1, maxLos: maxLosValue ?? undefined, updatedFromAxisAt: null }, key });
    }
    const invalidRows = new Set(errors.map((error) => error.row));
    if (errors.length) return { rowsReceived: receivedRows.size, rowsValid: receivedRows.size - invalidRows.size, rowsInvalid: invalidRows.size, rowsImported: 0, rowsUpdated: 0, errors };
    let rowsUpdated = 0;
    await this.prisma.$transaction(async (tx) => { for (const item of rows) { const existing = await tx.rateDay.findUnique({ where: { ratePlanId_date: { ratePlanId: item.planId, date: item.date } }, select: { id: true } }); if (existing) rowsUpdated += 1; await tx.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: item.planId, date: item.date } }, update: item.data, create: item.create }); } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'BASE_RATE_EXCEL_IMPORTED', entityType: 'Hotel', entityId: hotelId, after: { rowsImported: rows.length, rowsUpdated } } });
    return { rowsReceived: receivedRows.size, rowsValid: receivedRows.size, rowsInvalid: 0, rowsImported: rows.length, rowsUpdated, errors: [] };
  }

  async addAmenity(hotelId: string, body: AmenityDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const amenity = await this.prisma.amenity.upsert({ where: { code: body.code.trim().toUpperCase() }, update: { name: body.name.trim() }, create: { code: body.code.trim().toUpperCase(), name: body.name.trim() } });
    return this.prisma.hotelAmenity.upsert({ where: { hotelId_amenityId: { hotelId, amenityId: amenity.id } }, update: { quantity: body.quantity ?? 1, availabilityType: body.availabilityType ?? '24/7', startTime: body.startTime || null, endTime: body.endTime || null, active: body.active ?? true }, create: { hotelId, amenityId: amenity.id, quantity: body.quantity ?? 1, availabilityType: body.availabilityType ?? '24/7', startTime: body.startTime || null, endTime: body.endTime || null, active: body.active ?? true }, include: { amenity: true } });
  }

  async deleteAmenity(hotelId: string, amenityId: string) {
    const link = await this.prisma.hotelAmenity.findUnique({ where: { hotelId_amenityId: { hotelId, amenityId } } });
    if (!link) throw new NotFoundException('Hotel amenity not found');
    await this.prisma.hotelAmenity.delete({ where: { hotelId_amenityId: { hotelId, amenityId } } });
    return { deleted: true, amenityId: link.amenityId };
  }

  async listReviews(hotelId: string) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    return this.prisma.hotelReview.findMany({ where: { hotelId }, orderBy: [{ createdAt: 'desc' }] });
  }

  async createReview(hotelId: string, body: HotelReviewDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    return this.prisma.hotelReview.create({ data: { hotelId, rating: body.rating, description: body.description.trim() } });
  }

  async updateReview(id: string, body: HotelReviewDto) {
    await this.prisma.hotelReview.findUniqueOrThrow({ where: { id } });
    return this.prisma.hotelReview.update({ where: { id }, data: { rating: body.rating, description: body.description.trim() } });
  }

  async deleteReview(id: string) {
    await this.prisma.hotelReview.findUniqueOrThrow({ where: { id } });
    await this.prisma.hotelReview.delete({ where: { id } });
    return { deleted: true, id };
  }

  async addImage(hotelId: string, body: HotelImageDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const imageCount = await this.prisma.hotelImage.count({ where: { hotelId, url: { not: '/rainwood-placeholder.svg' } } });
    const currentMain = await this.prisma.hotelImage.findFirst({ where: { hotelId, isMain: true, published: true, url: { not: '/rainwood-placeholder.svg' } }, select: { id: true } });
    const isVisible = (body.published ?? true) && body.url.trim() !== '/rainwood-placeholder.svg';
    const isMain = body.isMain ?? (!currentMain && isVisible);
    if (isMain) await this.prisma.hotelImage.updateMany({ where: { hotelId }, data: { isMain: false } });
    return this.prisma.hotelImage.create({ data: { hotelId, url: body.url.trim(), altText: body.altText?.trim() || 'RainWood hotel image', category: body.category ?? 'OTHERS', isMain, sortOrder: body.sortOrder ?? imageCount, published: body.published ?? true } });
  }

  async updateImage(hotelId: string, imageId: string, body: HotelImageUpdateDto) {
    const image = await this.prisma.hotelImage.findFirst({ where: { id: imageId, hotelId } });
    if (!image) throw new NotFoundException('Hotel image not found');
    if (body.isMain) await this.prisma.hotelImage.updateMany({ where: { hotelId, id: { not: imageId } }, data: { isMain: false } });
    return this.prisma.hotelImage.update({ where: { id: imageId }, data: body });
  }

  async reorderImages(hotelId: string, body: HotelImageOrderDto) {
    const imageIds = [...new Set(body.imageIds)];
    if (imageIds.length !== body.imageIds.length) throw new BadRequestException('Image order contains duplicates');
    const owned = await this.prisma.hotelImage.count({ where: { hotelId, id: { in: imageIds } } });
    if (owned !== imageIds.length) throw new BadRequestException('Image order contains an invalid image');
    await this.prisma.$transaction(imageIds.map((id, sortOrder) => this.prisma.hotelImage.update({ where: { id }, data: { sortOrder } })));
    return this.prisma.hotelImage.findMany({ where: { hotelId }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] });
  }

  async deleteImage(hotelId: string, imageId: string) {
    const image = await this.prisma.hotelImage.findFirst({ where: { id: imageId, hotelId } });
    if (!image) throw new NotFoundException('Hotel image not found');
    const fileId = image.url.match(/\/files\/public\/([^/?#]+)/)?.[1];
    await this.prisma.hotelImage.delete({ where: { id: image.id } });
    if (image.isMain) {
      const next = await this.prisma.hotelImage.findFirst({ where: { hotelId, published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] });
      if (next) await this.prisma.hotelImage.update({ where: { id: next.id }, data: { isMain: true } });
    }
    if (fileId) await this.files.remove(fileId);
    return { deleted: true, imageId: image.id, fileId: fileId ?? null };
  }

  async addVideo(hotelId: string, body: HotelVideoDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    return this.prisma.hotelVideo.create({ data: { hotelId, ...body, title: body.title.trim() } });
  }

  async deleteVideo(hotelId: string, videoId: string) {
    const video = await this.prisma.hotelVideo.findFirst({ where: { id: videoId, hotelId } });
    if (!video) throw new NotFoundException('Hotel video not found');
    await this.prisma.hotelVideo.delete({ where: { id: video.id } });
    await this.files.remove(video.fileId);
    return { deleted: true, videoId };
  }

  async createRoom(hotelId: string, body: RoomTypeDto) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    return this.prisma.roomType.create({ data: { ...body, hotelId, axisRoomId: body.axisRoomId || undefined } });
  }

  async updateRoom(id: string, body: Partial<RoomTypeDto>) {
    await this.prisma.roomType.findUniqueOrThrow({ where: { id } });
    return this.prisma.roomType.update({ where: { id }, data: { ...body, axisRoomId: body.axisRoomId || undefined } });
  }

  async addRoomImage(roomTypeId: string, body: HotelImageDto) {
    await this.prisma.roomType.findUniqueOrThrow({ where: { id: roomTypeId } });
    return this.prisma.roomImage.create({ data: { roomTypeId, url: body.url.trim(), altText: body.altText?.trim() || 'RainWood room image', sortOrder: body.sortOrder ?? 0, published: body.published ?? true } });
  }

  async deleteRoomImage(roomTypeId: string, imageId: string) {
    const image = await this.prisma.roomImage.findFirst({ where: { id: imageId, roomTypeId } });
    if (!image) throw new NotFoundException('Room image not found');
    const fileId = image.url.match(/\/files\/public\/([^/?#]+)/)?.[1];
    await this.prisma.roomImage.delete({ where: { id: image.id } });
    if (fileId) await this.files.remove(fileId);
    return { deleted: true, imageId: image.id, fileId: fileId ?? null };
  }

  private isUniqueConflict(error: unknown) {
    return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'P2002');
  }

  private assignmentData(master: { id: string; code: string; name: string; mealPlan: string; description: string | null }, roomTypeId: string, active = true, axisRatePlanId?: string) {
    return { roomTypeId, masterId: master.id, code: master.code, name: master.name, mealPlan: master.mealPlan, description: master.description, active, axisRatePlanId: axisRatePlanId?.trim() || undefined };
  }

  async ratePlanMasters(hotelId: string) {
    await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const masters = await this.prisma.ratePlanMaster.findMany({
      where: { hotelId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
      include: {
        hotel: { select: { id: true, name: true, city: true } },
        assignments: {
          orderBy: { roomType: { name: 'asc' } },
          include: {
            roomType: { select: { id: true, name: true, code: true, hotelId: true } },
            rates: { where: { date: { gte: today } }, orderBy: { amount: 'asc' }, take: 1, select: { amount: true, date: true } },
            lines: { where: { reservation: { status: { in: ['CONFIRMED', 'COMPLETED', 'MODIFIED'] } } }, select: { reservationId: true } },
            holdLines: { where: { hold: { status: 'ACTIVE', expiresAt: { gt: new Date() } } }, select: { holdId: true } },
            _count: { select: { rates: true } },
          },
        },
      },
    });
    return masters.map((master) => {
      const assignments = master.assignments.map((assignment) => ({
        ...assignment,
        startingRate: assignment.rates[0]?.amount ?? null,
        confirmedBookingCount: new Set(assignment.lines.map((line) => line.reservationId)).size,
        activeHoldCount: new Set(assignment.holdLines.map((line) => line.holdId)).size,
        rates: undefined,
        lines: undefined,
        holdLines: undefined,
      }));
      const prices = assignments.map((assignment) => assignment.startingRate).filter((amount) => amount !== null);
      return {
        ...master,
        assignments,
        startingRate: prices.length ? prices.reduce((lowest, amount) => Number(amount) < Number(lowest) ? amount : lowest) : null,
        confirmedBookingCount: new Set(master.assignments.flatMap((assignment) => assignment.lines.map((line) => line.reservationId))).size,
        activeHoldCount: new Set(master.assignments.flatMap((assignment) => assignment.holdLines.map((line) => line.holdId))).size,
      };
    });
  }

  async createRatePlanMaster(hotelId: string, body: RatePlanMasterDto) {
    const code = canonicalRatePlanCode(body.code);
    const mealPlan = canonicalMealPlan(body.mealPlan);
    const roomTypeIds = [...new Set(body.roomTypeIds ?? [])];
    const rooms = roomTypeIds.length ? await this.prisma.roomType.findMany({ where: { id: { in: roomTypeIds } }, select: { id: true, hotelId: true } }) : [];
    if (rooms.length !== roomTypeIds.length) throw new NotFoundException('One or more selected room types do not exist.');
    if (rooms.some((room) => room.hotelId !== hotelId)) throw new BadRequestException('A rate plan can only be assigned to room types in the same hotel.');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const master = await tx.ratePlanMaster.create({ data: { hotelId, code, name: body.name.trim(), mealPlan, description: body.description?.trim() || undefined, active: body.active ?? true } });
        if (roomTypeIds.length) await tx.ratePlan.createMany({ data: roomTypeIds.map((roomTypeId) => this.assignmentData(master, roomTypeId)) });
        return tx.ratePlanMaster.findUniqueOrThrow({ where: { id: master.id }, include: { assignments: { include: { roomType: true } } } });
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException(`Rate plan code ${code} already exists for this hotel, or is already assigned to a selected room.`);
      throw error;
    }
  }

  async updateRatePlanMaster(id: string, body: Partial<RatePlanMasterDto>) {
    const existing = await this.prisma.ratePlanMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rate plan not found');
    const code = body.code === undefined ? existing.code : canonicalRatePlanCode(body.code);
    const name = body.name === undefined ? existing.name : body.name.trim();
    const mealPlan = body.mealPlan === undefined ? existing.mealPlan : canonicalMealPlan(body.mealPlan);
    const description = body.description === undefined ? existing.description : body.description.trim() || null;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const master = await tx.ratePlanMaster.update({ where: { id }, data: { code, name, mealPlan, description, active: body.active } });
        await tx.ratePlan.updateMany({ where: { masterId: id }, data: { code, name, mealPlan, description } });
        return master;
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException(`Rate plan code ${code} already exists for this hotel.`);
      throw error;
    }
  }

  async assignRatePlanMaster(masterId: string, body: RatePlanAssignmentDto) {
    const [master, room] = await Promise.all([
      this.prisma.ratePlanMaster.findUnique({ where: { id: masterId } }),
      this.prisma.roomType.findUnique({ where: { id: body.roomTypeId }, select: { id: true, hotelId: true } }),
    ]);
    if (!master) throw new NotFoundException('Rate plan not found');
    if (!room) throw new NotFoundException('Room type not found');
    if (master.hotelId !== room.hotelId) throw new BadRequestException('A rate plan can only be assigned to a room type in the same hotel.');
    try {
      return await this.prisma.ratePlan.create({ data: this.assignmentData(master, room.id, body.active ?? true, body.axisRatePlanId), include: { roomType: true, master: true } });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('This rate plan is already assigned to the selected room, or its AxisRooms ID is already in use.');
      throw error;
    }
  }

  async updateRatePlanAssignment(id: string, body: RatePlanAssignmentUpdateDto) {
    await this.prisma.ratePlan.findUniqueOrThrow({ where: { id } });
    try {
      return await this.prisma.ratePlan.update({ where: { id }, data: { active: body.active, axisRatePlanId: body.axisRatePlanId === undefined ? undefined : body.axisRatePlanId.trim() || null }, include: { master: true, roomType: true } });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('This AxisRooms rate-plan ID is already mapped for the room type.');
      throw error;
    }
  }

  async deleteRatePlanAssignment(id: string) {
    const assignment = await this.prisma.ratePlan.findUnique({ where: { id }, include: { _count: { select: { rates: true, lines: true, holdLines: true, cancellationRules: true, assignedAgents: true } } } });
    if (!assignment) throw new NotFoundException('Rate-plan assignment not found');
    const dependencies = Object.values(assignment._count).reduce((total, count) => total + count, 0);
    if (dependencies > 0) throw new ConflictException('This assignment has rates, mappings or booking history. Deactivate it instead of removing it.');
    return this.prisma.ratePlan.delete({ where: { id } });
  }

  async deleteRatePlanMaster(id: string) {
    const master = await this.prisma.ratePlanMaster.findUnique({ where: { id }, include: { _count: { select: { assignments: true } } } });
    if (!master) throw new NotFoundException('Rate plan not found');
    if (master._count.assignments) throw new ConflictException('Remove unused room assignments or deactivate this rate plan instead of deleting it.');
    return this.prisma.ratePlanMaster.delete({ where: { id } });
  }

  // Compatibility endpoint: creating under a room now creates/reuses a hotel master
  // and creates only the room assignment.
  async createRatePlan(roomTypeId: string, body: RatePlanDto) {
    const room = await this.prisma.roomType.findUnique({ where: { id: roomTypeId }, select: { id: true, hotelId: true } });
    if (!room) throw new NotFoundException('Room type not found');
    const code = canonicalRatePlanCode(body.code);
    let master = await this.prisma.ratePlanMaster.findUnique({ where: { hotelId_code: { hotelId: room.hotelId, code } } });
    if (!master) {
      try {
        master = await this.prisma.ratePlanMaster.create({ data: { hotelId: room.hotelId, code, name: body.name.trim(), mealPlan: canonicalMealPlan(body.mealPlan), description: body.description?.trim() || undefined, active: body.active ?? true } });
      } catch (error) {
        if (!this.isUniqueConflict(error)) throw error;
        master = await this.prisma.ratePlanMaster.findUniqueOrThrow({ where: { hotelId_code: { hotelId: room.hotelId, code } } });
      }
    }
    return this.assignRatePlanMaster(master.id, { roomTypeId, active: body.active, axisRatePlanId: body.axisRatePlanId });
  }

  // Compatibility endpoint: metadata updates affect the hotel master; mapping and
  // active state remain room-assignment settings.
  async updateRatePlan(id: string, body: Partial<RatePlanDto>) {
    const existing = await this.prisma.ratePlan.findUnique({ where: { id }, include: { master: true } });
    if (!existing) throw new NotFoundException('Rate-plan assignment not found');
    if (body.code !== undefined || body.name !== undefined || body.mealPlan !== undefined || body.description !== undefined) await this.updateRatePlanMaster(existing.masterId, body);
    return this.updateRatePlanAssignment(id, { active: body.active, axisRatePlanId: body.axisRatePlanId });
  }

  // Deprecated copy route now means assign the same master. Only future room-level
  // rates are optionally copied; mappings and historical relationships never are.
  async copyRatePlan(id: string, body: CopyRatePlanDto) {
    const source = await this.prisma.ratePlan.findUnique({ where: { id }, include: { master: true, rates: { where: { date: { gte: new Date() } } } } });
    if (!source) throw new NotFoundException('Rate-plan assignment not found');
    const assigned = await this.assignRatePlanMaster(source.masterId, { roomTypeId: body.targetRoomTypeId });
    if (body.copyRates && source.rates.length) await this.prisma.rateDay.createMany({ data: source.rates.map((rate) => ({ ratePlanId: assigned.id, date: rate.date, amount: rate.amount, taxAmount: rate.taxAmount, childAmount: rate.childAmount, extraAdultAmount: rate.extraAdultAmount, occupancyPrices: rate.occupancyPrices ?? undefined, cta: rate.cta, ctd: rate.ctd, minLos: rate.minLos, maxLos: rate.maxLos })) });
    return this.prisma.ratePlan.findUniqueOrThrow({ where: { id: assigned.id }, include: { roomType: true, master: true, rates: true } });
  }

  ratePlans() {
    return this.prisma.ratePlan.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } }, _count: { select: { rates: true, lines: true, holdLines: true } } } });
  }

  deleteRatePlan(id: string) {
    return this.deleteRatePlanAssignment(id);
  }

  async saveInventory(roomTypeId: string, body: InventoryBatchDto) {
    const room = await this.prisma.roomType.findUnique({ where: { id: roomTypeId } });
    if (!room) throw new NotFoundException('Room type not found');
    if (body.days.some((day) => day.available < 0)) throw new BadRequestException('Inventory cannot be negative');
    return this.prisma.$transaction(body.days.map((day) => this.prisma.inventoryDay.upsert({ where: { roomTypeId_date: { roomTypeId, date: new Date(`${day.date}T00:00:00.000Z`) } }, create: { roomTypeId, date: new Date(`${day.date}T00:00:00.000Z`), available: day.available, stopSell: Boolean(day.stopSell) }, update: { available: day.available, stopSell: Boolean(day.stopSell), version: { increment: 1 } } })));
  }

  async saveRates(ratePlanId: string, body: RateBatchDto) {
    const plan = await this.prisma.ratePlan.findUnique({ where: { id: ratePlanId } });
    if (!plan) throw new NotFoundException('Rate plan not found');
    return this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const day of body.days) {
        const date = parseDateOnly(day.date, 'rate date');
        if (day.minLos !== undefined && day.maxLos !== undefined && day.maxLos !== null && day.maxLos < day.minLos) throw new BadRequestException('maxLos must be greater than or equal to minLos.');
        const occupancyPrices = normalizeOccupancyPrices(day.occupancyPrices);
        const existing = await tx.rateDay.findUnique({ where: { ratePlanId_date: { ratePlanId, date } } });
        if (!existing && day.amount === undefined) throw new BadRequestException(`A base amount is required for ${day.date}.`);
        if (existing) {
          results.push(await tx.rateDay.update({ where: { id: existing.id }, data: { amount: day.amount === undefined ? undefined : day.amount, taxAmount: day.taxAmount === undefined ? undefined : day.taxAmount, childAmount: day.childAmount === undefined ? undefined : day.childAmount, extraAdultAmount: day.extraAdultAmount === undefined ? undefined : day.extraAdultAmount, occupancyPrices: occupancyPrices === null ? Prisma.DbNull : occupancyPrices === undefined ? undefined : occupancyPrices, cta: day.cta === undefined ? undefined : day.cta, ctd: day.ctd === undefined ? undefined : day.ctd, minLos: day.minLos === undefined ? undefined : day.minLos, maxLos: day.maxLos === undefined ? undefined : day.maxLos } }));
        } else {
          results.push(await tx.rateDay.create({ data: { ratePlanId, date, amount: day.amount!, taxAmount: day.taxAmount ?? 0, childAmount: day.childAmount ?? 0, extraAdultAmount: day.extraAdultAmount ?? 0, occupancyPrices: occupancyPrices ?? undefined, cta: day.cta ?? false, ctd: day.ctd ?? false, minLos: day.minLos ?? 1, maxLos: day.maxLos ?? null } }));
        }
      }
      return results;
    });
  }
}

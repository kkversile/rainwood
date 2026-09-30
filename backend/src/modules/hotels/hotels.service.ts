import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RoomOperationalStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { normalizeOccupancyPrices, SUPPORTED_OCCUPANCY_KEYS } from '../../common/rate-pricing';
import { parseDateOnly, parseExcelDateOnly } from '../../common/dates';
import { AmenityDto, CopyRatePlanDto, HotelContentDto, HotelDocumentDto, HotelDocumentUpdateDto, HotelImageDto, HotelImageOrderDto, HotelImageUpdateDto, HotelLocationAttractionDto, HotelLocationProfileDto, HotelLocationTransportDto, HotelPolicyDto, HotelReviewDto, HotelVideoDto, InventoryBatchDto, PhysicalRoomDto, PromotionDto, RateBatchDto, RateBulkUpdateDto, RatePlanAssignmentDto, RatePlanAssignmentUpdateDto, RatePlanDto, RatePlanMasterDto, RoomTypeDto, RateSeasonDto, YieldRuleDto } from './hotels.dto';
import { FilesService } from '../files/files.service';
import ExcelJS from 'exceljs';
import { canonicalMealPlan, canonicalRatePlanCode } from './rate-plan.utils';
import { mapImportedRateFields } from '../../common/excel-rate-fields';
import { assertAdminRoomStatusTransition } from './room-operational-status';
import { assertActorCanManageHotel } from '../../common/role-scope';

function existingSupportedOccupancyPrices(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(SUPPORTED_OCCUPANCY_KEYS.flatMap((key) => {
    const amount = Number((value as Record<string, unknown>)[key]);
    return Number.isFinite(amount) && amount >= 0 ? [[key, amount]] : [];
  }));
}

function promotionCode(value: string | null | undefined) {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

function promotionDate(value: string | null | undefined, field: string) {
  return value ? parseDateOnly(value, field) : null;
}

function validatePromotionState(state: { discountType: any; discountValue: number | string | Prisma.Decimal; bookingStart?: Date | null; bookingEnd?: Date | null; stayStart?: Date | null; stayEnd?: Date | null; minNights?: number | null; maxNights?: number | null }) {
  const value = Number(state.discountValue);
  if (!Number.isFinite(value) || value < 0 || (state.discountType === 'PERCENT' && value > 100)) throw new BadRequestException('Promotion discount value is invalid. Percent discounts must be between 0 and 100.');
  if (state.bookingStart && state.bookingEnd && state.bookingStart > state.bookingEnd) throw new BadRequestException('Booking window is invalid.');
  if (state.stayStart && state.stayEnd && state.stayStart > state.stayEnd) throw new BadRequestException('Stay window is invalid.');
  if (state.minNights != null && state.maxNights != null && state.maxNights < state.minNights) throw new BadRequestException('maxNights cannot be lower than minNights.');
}

function normalizedChannels(channels?: string[] | null) {
  return [...new Set((channels ?? []).map((channel) => channel.trim().toUpperCase()).filter(Boolean))];
}

function validateAdjustment(type: string, value: number) {
  if (!Number.isFinite(value) || (type === 'PERCENT' && value < -100)) throw new BadRequestException('Adjustment value is invalid.');
}

function validateSeasonState(startDate: Date, endDate: Date, daysOfWeek: number[], adjustmentType: string, adjustmentValue: number) {
  if (startDate > endDate) throw new BadRequestException('Season date range is invalid.');
  if (daysOfWeek.some((day) => day < 0 || day > 6)) throw new BadRequestException('Season weekdays are invalid.');
  validateAdjustment(adjustmentType, adjustmentValue);
}

function validateYieldState(from: number, to: number, adjustmentType: string, adjustmentValue: number) {
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || from >= to || to > 100) throw new BadRequestException('Yield occupancy range must satisfy 0 <= from < to <= 100.');
  validateAdjustment(adjustmentType, adjustmentValue);
}

@Injectable()
export class HotelsService {
  constructor(private prisma: PrismaService, private files: FilesService) {}

  async physicalRooms(hotelId?: string) {
    return this.prisma.room.findMany({ where: { hotelId: hotelId || undefined }, orderBy: [{ hotel: { name: 'asc' } }, { roomNumber: 'asc' }], include: { hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } } } });
  }

  async createPhysicalRoom(hotelId: string, body: PhysicalRoomDto) {
    const roomType = await this.prisma.roomType.findFirst({ where: { id: body.roomTypeId, hotelId } });
    if (!roomType) throw new BadRequestException('Room type does not belong to the selected hotel.');
    try {
      return await this.prisma.room.create({ data: { hotelId, roomTypeId: body.roomTypeId, roomNumber: body.roomNumber.trim(), floor: body.floor?.trim() || null, wing: body.wing?.trim() || null, status: body.status ?? RoomOperationalStatus.AVAILABLE, active: body.active ?? true }, include: { hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } } } });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('That room number already exists at this hotel.');
      throw error;
    }
  }

  async updatePhysicalRoom(id: string, body: Partial<PhysicalRoomDto>) {
    return this.updatePhysicalRoomWithClient(this.prisma, id, body);
  }

  async updatePhysicalRoomWithClient(client: PrismaService | Prisma.TransactionClient, id: string, body: Partial<PhysicalRoomDto>) {
    const current = await client.room.findUnique({ where: { id }, include: { assignments: { where: { unassignedAt: null }, select: { id: true } } } });
    if (!current) throw new NotFoundException('Physical room not found.');
    const hasActiveAssignment = current.assignments.length > 0;
    const requestedRoomNumber = body.roomNumber?.trim();
    const roomNumberChanged = requestedRoomNumber !== undefined && requestedRoomNumber !== current.roomNumber;
    const incompatibleEdit = (body.roomTypeId !== undefined && body.roomTypeId !== current.roomTypeId)
      || roomNumberChanged
      || body.active === false
      || (body.status !== undefined && body.status !== current.status);
    if (hasActiveAssignment && incompatibleEdit) {
      if (roomNumberChanged) {
        throw new ConflictException(`Room ${current.roomNumber} is currently assigned to an in-house guest and cannot be renumbered.`);
      }
      throw new ConflictException(`Room ${current.roomNumber} is currently assigned to an in-house guest and cannot be modified.`);
    }
    if (body.status !== undefined) assertAdminRoomStatusTransition(current.status, body.status, current.roomNumber);
    if (body.roomTypeId) {
      const roomType = await client.roomType.findFirst({ where: { id: body.roomTypeId, hotelId: current.hotelId } });
      if (!roomType) throw new BadRequestException('Room type does not belong to this hotel.');
    }
    try {
      return await client.room.update({ where: { id }, data: { roomNumber: requestedRoomNumber, roomTypeId: body.roomTypeId, floor: body.floor === undefined ? undefined : body.floor?.trim() || null, wing: body.wing === undefined ? undefined : body.wing?.trim() || null, status: body.status, active: body.active }, include: { hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } } } });
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('That room number already exists at this hotel.');
      throw error;
    }
  }

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

  async policy(hotelId: string) { await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId } }); return (await this.prisma.hotelPolicy.findUnique({ where: { hotelId } })) ?? {}; }
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
    return { ...hotel, rooms: hotel.rooms.map((room) => ({ ...room, totalRooms: room.roomsAvailable, todayAvailable: room.inventory.find((day) => day.date.toISOString().slice(0, 10) === today)?.available ?? null, ratePlans: room.ratePlans.map((plan) => ({ ...plan, rates: plan.rates.map((rate) => ({ ...rate, baseAmount: rate.baseAmount ?? rate.amount, overrideAmount: rate.overrideAmount ?? null, effectiveAmount: rate.overrideAmount ?? rate.baseAmount ?? rate.amount })) })) })) };
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

  private async rateImportContext(hotelId: string, masterId: string, requireActive = false) {
    const [hotel, master] = await Promise.all([
      this.prisma.hotel.findUnique({
        where: { id: hotelId },
        include: {
          rooms: {
            where: { active: true },
            orderBy: { name: 'asc' },
            include: {
              ratePlans: { where: { masterId, active: true }, include: { master: true } },
            },
          },
        },
      }),
      this.prisma.ratePlanMaster.findUnique({ where: { id: masterId } }),
    ]);
    if (!hotel) throw new NotFoundException('Hotel not found');
    if (!master) throw new NotFoundException('Rate plan not found');
    if (master.hotelId !== hotelId) throw new BadRequestException('Selected rate plan does not belong to this hotel.');
    if (requireActive && !master.active) throw new BadRequestException('Selected rate plan is inactive.');
    return { hotel, master };
  }

  async baseRateTemplate(hotelId: string, masterId: string) {
    const { hotel, master } = await this.rateImportContext(hotelId, masterId);
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'RainWood Hotels';
    const columns = ['Room Code', 'Room', 'Date', 'Base Amount (INR)', 'Tax (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)', 'Extra Adult Charge (INR)', 'Child Charge (INR)', 'CTA', 'CTD', 'Min LOS', 'Max LOS'];
    const sampleRoom = hotel.rooms.find((room) => room.ratePlans.some((plan) => plan.masterId === masterId && plan.active));
    const instructions = workbook.addWorksheet('Instructions');
    instructions.addRow(['SAMPLE DATA - DO NOT IMPORT THIS SHEET']);
    instructions.addRow(['Copy the example format into Rate Plan Rates, then replace it with your real pricing.']);
    instructions.addRow(['Hotel', hotel.name]);
    instructions.addRow(['Rate Plan', master.name]);
    instructions.addRow(['Rate Plan Code', master.code]);
    instructions.addRow(['Meal Plan', master.mealPlan]);
    instructions.addRow([]);
    instructions.addRow(columns);
    instructions.addRow([sampleRoom?.code ?? 'ROOM', sampleRoom?.name ?? 'Room name', '2030-01-01', 5000, 600, 5000, 5500, 6500, 7500, 1200, 600, 'No', 'No', 1, 7]);
    instructions.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instructions.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'B45309' } };
    instructions.getRow(8).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    instructions.getRow(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } };
    instructions.getRow(8).alignment = { vertical: 'middle', wrapText: true };
    instructions.columns.forEach((column, index) => { column.width = index === 1 ? 28 : index === 0 ? 22 : index === 2 ? 14 : 18; });
    const sheet = workbook.addWorksheet('Rate Plan Rates');
    sheet.addRow(['Hotel', hotel.name]);
    sheet.addRow(['Rate Plan', master.name]);
    sheet.addRow(['Rate Plan Code', master.code]);
    sheet.addRow(['Meal Plan', master.mealPlan]);
    sheet.addRow([]);
    const header = sheet.addRow(columns);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } };
    header.alignment = { vertical: 'middle', wrapText: true };
    for (const room of hotel.rooms) {
      if (!room.ratePlans.some((plan) => plan.masterId === masterId && plan.active)) continue;
      sheet.addRow([room.code, room.name, '', '', '', '', '', '', '', '', '', '', '', '', '']);
    }
    sheet.views = [{ state: 'frozen', ySplit: 6 }];
    sheet.autoFilter = { from: 'A6', to: `O${sheet.rowCount}` };
    sheet.columns.forEach((column, index) => { column.width = index === 1 ? 28 : index === 0 ? 18 : index === 2 ? 14 : 18; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async importBaseRates(hotelId: string, masterId: string, file: Express.Multer.File, actorUserId: string) {
    if (!file?.buffer || !/\.(xlsx|xlsm)$/i.test(file.originalname ?? '')) throw new BadRequestException('Upload an .xlsx workbook');
    const { hotel, master } = await this.rateImportContext(hotelId, masterId, true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(file.buffer as any);
    const sheet = workbook.getWorksheet('Rate Plan Rates');
    if (!sheet) throw new BadRequestException('Workbook must contain a "Rate Plan Rates" worksheet.');
    const normalizeHeader = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const headerNames = new Map<string, number>();
    let headerRowNumber = 0;
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 20); rowNumber += 1) {
      const candidate = new Map<string, number>();
      sheet.getRow(rowNumber).eachCell((cell, index) => { const key = normalizeHeader(cell.value); if (key) candidate.set(key, index); });
      if (candidate.has('room code') && candidate.has('date') && candidate.has('base amount (inr)')) { headerNames.clear(); candidate.forEach((index, key) => headerNames.set(key, index)); headerRowNumber = rowNumber; break; }
    }
    if (!headerRowNumber) throw new BadRequestException('Missing required columns: room code, date, base amount (inr)');
    const headerIndex = (...keys: string[]) => keys.map((key) => headerNames.get(key)).find((index): index is number => index !== undefined);
    const cellValue = (row: ExcelJS.Row, ...keys: string[]) => { const index = headerIndex(...keys); return index === undefined ? undefined : row.getCell(index).value; };
    const cellText = (row: ExcelJS.Row, ...keys: string[]) => { const value = cellValue(row, ...keys); return value && typeof value === 'object' && 'result' in value ? String(value.result ?? '').trim() : String(value ?? '').trim(); };
    const numeric = (row: ExcelJS.Row, keys: string[], requiredValue = false) => { const raw = cellText(row, ...keys); if (!raw && !requiredValue) return undefined; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? value : null; };
    const boolean = (row: ExcelJS.Row, keys: string[]) => { const raw = cellText(row, ...keys).toLowerCase(); if (!raw) return undefined; if (['yes', 'true', '1'].includes(raw)) return true; if (['no', 'false', '0'].includes(raw)) return false; return null; };
    const assignedRooms = hotel.rooms.filter((room) => room.ratePlans.some((plan) => plan.masterId === masterId && plan.active));
    const roomMap = new Map(hotel.rooms.map((room) => [room.code.toLowerCase(), room]));
    const errors: { row: number; field: string; message: string }[] = [];
    const rows: { rowNumber: number; planId: string; date: Date; occupancyPrices: Record<string, number> | null; data: Prisma.RateDayUpdateInput; create: Prisma.RateDayCreateInput }[] = [];
    const receivedRows = new Set<number>();
    const seen = new Set<string>();
    const pricingColumns = ['date', 'base amount (inr)', 'tax (inr)', 'single (inr)', 'double (inr)', 'triple (inr)', 'quad (inr)', 'extra adult charge (inr)', 'child charge (inr)', 'cta', 'ctd', 'min los', 'max los'];
    for (let rowNumber = headerRowNumber + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      if (!row.actualCellCount || !pricingColumns.some((key) => String(cellValue(row, key) ?? '').trim() !== '')) continue;
      receivedRows.add(rowNumber);
      const roomCode = cellText(row, 'room code');
      const workbookPlanCode = cellText(row, 'rate plan code');
      if (workbookPlanCode && workbookPlanCode.toLowerCase() !== master.code.toLowerCase()) errors.push({ row: rowNumber, field: 'Rate Plan Code', message: `Workbook rate plan code must match selected rate plan ${master.code}.` });
      const room = roomMap.get(roomCode.toLowerCase());
      const plan = room?.ratePlans.find((candidate) => candidate.masterId === masterId && candidate.active);
      if (!room) errors.push({ row: rowNumber, field: 'Room Code', message: roomCode ? `Unknown or unassigned room code "${roomCode}"` : 'Room Code is required' });
      if (room && !plan) errors.push({ row: rowNumber, field: 'Room Code', message: `This rate plan is not assigned to room ${roomCode}.` });
      let date: Date | undefined;
      try { date = parseExcelDateOnly(cellValue(row, 'date'), 'date'); } catch { errors.push({ row: rowNumber, field: 'Date', message: 'Invalid date' }); }
      const amount = numeric(row, ['base amount (inr)'], true); if (amount === null) errors.push({ row: rowNumber, field: 'Base Amount', message: 'Must be a non-negative number' });
      const tax = numeric(row, ['tax (inr)']); if (tax === null) errors.push({ row: rowNumber, field: 'Tax', message: 'Must be a non-negative number' });
      const occupancy: Record<string, number> = {};
      for (const [key, aliases] of Object.entries({ single: ['single (inr)'], double: ['double (inr)'], triple: ['triple (inr)'], quad: ['quad (inr)'] })) { const value = numeric(row, aliases); if (value === null) errors.push({ row: rowNumber, field: key, message: 'Must be a non-negative number' }); else if (value !== undefined) occupancy[key] = value; }
      const extraAdult = numeric(row, ['extra adult charge (inr)', 'extra adult (inr)']); if (extraAdult === null) errors.push({ row: rowNumber, field: 'Extra Adult Charge', message: 'Must be a non-negative number' });
      const child = numeric(row, ['child charge (inr)', 'extra child (inr)']); if (child === null) errors.push({ row: rowNumber, field: 'Child Charge', message: 'Must be a non-negative number' });
      const mappedGuestFields = mapImportedRateFields({ ...occupancy, extraAdultAmount: extraAdult ?? undefined, childAmount: child ?? undefined });
      const cta = boolean(row, ['cta']); const ctd = boolean(row, ['ctd']);
      if (cta === null) errors.push({ row: rowNumber, field: 'CTA', message: 'Use Yes or No' }); if (ctd === null) errors.push({ row: rowNumber, field: 'CTD', message: 'Use Yes or No' });
      const minLos = numeric(row, ['min los']); const maxLos = numeric(row, ['max los']); const minLosValue = minLos === null ? undefined : minLos; const maxLosValue = maxLos === null ? undefined : maxLos;
      if (minLosValue !== undefined && (!Number.isInteger(minLosValue) || minLosValue < 1)) errors.push({ row: rowNumber, field: 'Min LOS', message: 'Must be a positive integer' });
      if (maxLosValue !== undefined && (!Number.isInteger(maxLosValue) || maxLosValue < 1)) errors.push({ row: rowNumber, field: 'Max LOS', message: 'Must be a positive integer' });
      if (minLosValue !== undefined && maxLosValue !== undefined && maxLosValue < minLosValue) errors.push({ row: rowNumber, field: 'Max LOS', message: 'Cannot be below Min LOS' });
      if (!plan || !date || amount === null || amount === undefined) continue;
      const key = `${plan.id}:${date.toISOString().slice(0, 10)}`;
      if (seen.has(key)) { errors.push({ row: rowNumber, field: 'Date', message: 'Duplicate rate row for this room and date' }); continue; }
      seen.add(key);
      const data: Prisma.RateDayUpdateInput = { amount, ...(tax !== undefined && tax !== null ? { taxAmount: tax } : {}), ...(mappedGuestFields.childAmount !== undefined ? { childAmount: mappedGuestFields.childAmount } : {}), ...(mappedGuestFields.extraAdultAmount !== undefined ? { extraAdultAmount: mappedGuestFields.extraAdultAmount } : {}), ...(cta !== undefined && cta !== null ? { cta } : {}), ...(ctd !== undefined && ctd !== null ? { ctd } : {}), ...(minLosValue !== undefined ? { minLos: minLosValue } : {}), ...(maxLosValue !== undefined ? { maxLos: maxLosValue } : {}), updatedFromAxisAt: null };
      rows.push({ rowNumber, planId: plan.id, date, occupancyPrices: mappedGuestFields.occupancyPrices, data, create: { ratePlan: { connect: { id: plan.id } }, date, amount, taxAmount: tax ?? 0, childAmount: child ?? 0, extraAdultAmount: extraAdult ?? 0, occupancyPrices: mappedGuestFields.occupancyPrices ? mappedGuestFields.occupancyPrices as Prisma.InputJsonValue : undefined, cta: cta ?? false, ctd: ctd ?? false, minLos: minLosValue ?? 1, maxLos: maxLosValue ?? undefined, updatedFromAxisAt: null } });
    }
    const invalidRows = new Set(errors.map((error) => error.row));
    if (errors.length) return { rowsReceived: receivedRows.size, rowsValid: receivedRows.size - invalidRows.size, rowsInvalid: invalidRows.size, rowsImported: 0, rowsUpdated: 0, errors };
    let rowsUpdated = 0;
    await this.prisma.$transaction(async (tx) => { for (const item of rows) { const existing = await tx.rateDay.findUnique({ where: { ratePlanId_date: { ratePlanId: item.planId, date: item.date } }, select: { id: true, occupancyPrices: true } }); if (existing) rowsUpdated += 1; const updateOccupancy = item.occupancyPrices === null ? (existing ? existingSupportedOccupancyPrices(existing.occupancyPrices) : undefined) : { ...existingSupportedOccupancyPrices(existing?.occupancyPrices), ...item.occupancyPrices }; await tx.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId: item.planId, date: item.date } }, update: { ...item.data, ...(updateOccupancy !== undefined ? { occupancyPrices: updateOccupancy as Prisma.InputJsonValue } : {}) }, create: item.create }); } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'RATE_PLAN_RATES_EXCEL_IMPORTED', entityType: 'RatePlanMaster', entityId: masterId, after: { hotelId, masterId, masterCode: master.code, rowsImported: rows.length, rowsUpdated } } });
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
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.ratePlan.findUnique({ where: { roomTypeId_masterId: { roomTypeId: room.id, masterId } } });
        const assignment = existing
          ? await tx.ratePlan.update({ where: { id: existing.id }, data: { active: body.active ?? true, axisRatePlanId: body.axisRatePlanId === undefined ? undefined : body.axisRatePlanId.trim() || null } })
          : await tx.ratePlan.create({ data: this.assignmentData(master, room.id, body.active ?? true, body.axisRatePlanId) });
        if (assignment.active) await this.propagateAgentAccess(tx, masterId, room.hotelId, assignment.id);
        return tx.ratePlan.findUniqueOrThrow({ where: { id: assignment.id }, include: { roomType: true, master: true } });
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('This rate plan is already assigned to the selected room, or its AxisRooms ID is already in use.');
      throw error;
    }
  }

  async updateRatePlanAssignment(id: string, body: RatePlanAssignmentUpdateDto) {
    const existing = await this.prisma.ratePlan.findUniqueOrThrow({ where: { id }, select: { id: true, masterId: true, roomType: { select: { hotelId: true } } } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const assignment = await tx.ratePlan.update({ where: { id }, data: { active: body.active, axisRatePlanId: body.axisRatePlanId === undefined ? undefined : body.axisRatePlanId.trim() || null } });
        if (assignment.active) await this.propagateAgentAccess(tx, existing.masterId, existing.roomType.hotelId, id);
        return tx.ratePlan.findUniqueOrThrow({ where: { id }, include: { master: true, roomType: true } });
      });
    } catch (error) {
      if (this.isUniqueConflict(error)) throw new ConflictException('This AxisRooms rate-plan ID is already mapped for the room type.');
      throw error;
    }
  }

  private async propagateAgentAccess(tx: Prisma.TransactionClient, masterId: string, hotelId: string, ratePlanId: string) {
    const agents = await tx.agentRatePlan.findMany({ where: { active: true, ratePlan: { masterId, roomType: { hotelId } } }, select: { agentId: true }, distinct: ['agentId'] });
    for (const agent of agents) await tx.agentRatePlan.upsert({ where: { agentId_ratePlanId: { agentId: agent.agentId, ratePlanId } }, create: { agentId: agent.agentId, ratePlanId, active: true }, update: { active: true } });
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
    if (body.copyRates && source.rates.length) await this.prisma.rateDay.createMany({ data: source.rates.map((rate) => ({ ratePlanId: assigned.id, date: rate.date, amount: rate.amount, baseAmount: rate.baseAmount, overrideAmount: rate.overrideAmount, taxAmount: rate.taxAmount, childAmount: rate.childAmount, extraAdultAmount: rate.extraAdultAmount, occupancyPrices: rate.occupancyPrices ?? undefined, cta: rate.cta, ctd: rate.ctd, minLos: rate.minLos, maxLos: rate.maxLos })) });
    return this.prisma.ratePlan.findUniqueOrThrow({ where: { id: assigned.id }, include: { roomType: true, master: true, rates: true } });
  }

  ratePlans(hotelId?: string) {
    return this.prisma.ratePlan.findMany({ where: hotelId ? { roomType: { hotelId } } : undefined, orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } }, _count: { select: { rates: true, lines: true, holdLines: true } } } });
  }

  deleteRatePlan(id: string) {
    return this.deleteRatePlanAssignment(id);
  }

  private rateBulkDates(body: RateBulkUpdateDto) {
    const from = parseDateOnly(body.fromDate, 'fromDate');
    const to = parseDateOnly(body.toDate, 'toDate');
    if (from > to) throw new BadRequestException('fromDate must be on or before toDate.');
    const days = new Set(body.daysOfWeek?.length ? body.daysOfWeek : [0, 1, 2, 3, 4, 5, 6]);
    const dates: Date[] = [];
    for (const cursor = new Date(from); cursor <= to; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
      if (days.has(cursor.getUTCDay())) dates.push(new Date(cursor));
    }
    if (!dates.length) throw new BadRequestException('The selected date and weekday range has no dates.');
    if (dates.length > 366) throw new BadRequestException('Bulk rate updates cannot cover more than 366 dates.');
    return dates;
  }

  private bulkRatePreview(change: any, body: RateBulkUpdateDto) {
    const base = Number(change.rate?.baseAmount ?? change.rate?.amount ?? 0);
    const override = change.rate?.overrideAmount == null ? null : Number(change.rate.overrideAmount);
    const effective = override ?? base;
    const next: any = { baseAmount: base, overrideAmount: override, amount: effective, cta: Boolean(change.rate?.cta), ctd: Boolean(change.rate?.ctd), minLos: change.rate?.minLos ?? 1, maxLos: change.rate?.maxLos ?? null };
    if (body.action === 'SET_RATE') { if (body.value === undefined || body.value < 0) throw new BadRequestException('value is required for SET_RATE.'); next.baseAmount = body.value; next.overrideAmount = null; next.amount = body.value; }
    if (body.action === 'INCREASE_PERCENT' || body.action === 'DECREASE_PERCENT') {
      if (body.value === undefined || body.value < 0 || body.value > 1000) throw new BadRequestException('value must be between 0 and 1000 for percentage updates.');
      const multiplier = body.action === 'INCREASE_PERCENT' ? 1 + body.value / 100 : 1 - body.value / 100;
      if (multiplier < 0) throw new BadRequestException('A decrease cannot make a rate negative.');
      next.overrideAmount = Math.round(effective * multiplier * 100) / 100; next.amount = next.overrideAmount;
    }
    if (body.action === 'SET_MLOS') { if (body.value === undefined || !Number.isInteger(body.value) || body.value < 1) throw new BadRequestException('value must be a positive integer for SET_MLOS.'); next.minLos = body.value; if (next.maxLos !== null && next.maxLos < next.minLos) throw new BadRequestException('Minimum LOS cannot exceed Maximum LOS.'); }
    if (body.action === 'SET_MAXLOS') { if (body.value === undefined || !Number.isInteger(body.value) || body.value < 1) throw new BadRequestException('value must be a positive integer for SET_MAXLOS.'); next.maxLos = body.value; if (next.maxLos < next.minLos) throw new BadRequestException('Maximum LOS cannot be lower than Minimum LOS.'); }
    if (body.action === 'CLOSE_ARRIVAL') next.cta = true;
    if (body.action === 'CLOSE_DEPARTURE') next.ctd = true;
    if (body.action === 'REMOVE_OVERRIDE') { next.overrideAmount = null; next.amount = next.baseAmount; }
    return next;
  }

  async previewBulkRates(hotelId: string, body: RateBulkUpdateDto, actorUserId?: string) {
    if (actorUserId) await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    return this.bulkRates(hotelId, body, undefined, false);
  }

  async updateBulkRates(hotelId: string, body: RateBulkUpdateDto, actorUserId: string) {
    await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    return this.bulkRates(hotelId, body, actorUserId, true);
  }

  private async bulkRates(hotelId: string, body: RateBulkUpdateDto, actorUserId: string | undefined, commit: boolean) {
    const dates = this.rateBulkDates(body);
    const plans = await this.prisma.ratePlan.findMany({ where: { id: body.ratePlanIds?.length ? { in: body.ratePlanIds } : undefined, roomTypeId: body.roomTypeIds?.length ? { in: body.roomTypeIds } : undefined, roomType: { hotelId } }, select: { id: true, code: true, name: true, roomTypeId: true, roomType: { select: { name: true } } }, orderBy: { name: 'asc' } });
    if (!plans.length) throw new NotFoundException('No matching rate plans were found for this hotel.');
    const rates = await this.prisma.rateDay.findMany({ where: { ratePlanId: { in: plans.map((plan) => plan.id) }, date: { gte: dates[0], lte: dates[dates.length - 1] } } });
    const byKey = new Map(rates.map((rate) => [`${rate.ratePlanId}:${rate.date.toISOString().slice(0, 10)}`, rate]));
    const changes: any[] = [];
    for (const plan of plans) for (const date of dates) {
      const dateKey = date.toISOString().slice(0, 10);
      const rate = byKey.get(`${plan.id}:${dateKey}`);
      if (!rate && body.action !== 'SET_RATE') continue;
      const change = { plan, date: dateKey, rate };
      const next = this.bulkRatePreview(change, body);
      changes.push({ ratePlanId: plan.id, ratePlan: plan.name, roomTypeId: plan.roomTypeId, roomType: plan.roomType.name, date: dateKey, before: rate ? { baseAmount: rate.baseAmount ?? rate.amount, overrideAmount: rate.overrideAmount, effectiveAmount: rate.overrideAmount ?? rate.baseAmount ?? rate.amount, cta: rate.cta, ctd: rate.ctd, minLos: rate.minLos, maxLos: rate.maxLos } : null, after: next });
    }
    if (!commit) return { preview: true, affected: changes.length, changes: changes.slice(0, 500) };
    await this.prisma.$transaction(async (tx) => {
      for (const change of changes) {
        const rate = byKey.get(`${change.ratePlanId}:${change.date}`);
        const data = { amount: change.after.amount, baseAmount: change.after.baseAmount, overrideAmount: change.after.overrideAmount, cta: change.after.cta, ctd: change.after.ctd, minLos: change.after.minLos, maxLos: change.after.maxLos };
        if (rate) await tx.rateDay.update({ where: { id: rate.id }, data });
        else await tx.rateDay.create({ data: { ratePlanId: change.ratePlanId, date: parseDateOnly(change.date, 'rate date'), amount: data.amount, baseAmount: data.baseAmount, overrideAmount: data.overrideAmount, cta: data.cta, ctd: data.ctd, minLos: data.minLos, maxLos: data.maxLos } });
      }
      await tx.auditLog.create({ data: { actorUserId, action: 'RATE_BULK_UPDATED', entityType: 'RateDay', after: { hotelId, action: body.action, fromDate: body.fromDate, toDate: body.toDate, affected: changes.length, ratePlanIds: plans.map((plan) => plan.id) } } });
    });
    return { preview: false, affected: changes.length, changes: changes.slice(0, 500) };
  }

  async promotions(hotelId: string, actorUserId: string) {
    await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    return this.prisma.promotion.findMany({ where: { hotelId }, orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { roomTypes: { include: { roomType: { select: { id: true, name: true } } } }, ratePlans: { include: { ratePlan: { select: { id: true, name: true } } } } } });
  }

  async createPromotion(hotelId: string, body: PromotionDto, actorUserId: string) {
    await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    const code = promotionCode(body.code);
    const bookingStart = promotionDate(body.bookingStart, 'bookingStart');
    const bookingEnd = promotionDate(body.bookingEnd, 'bookingEnd');
    const stayStart = promotionDate(body.stayStart, 'stayStart');
    const stayEnd = promotionDate(body.stayEnd, 'stayEnd');
    validatePromotionState({ discountType: body.discountType, discountValue: body.discountValue, bookingStart, bookingEnd, stayStart, stayEnd, minNights: body.minNights ?? null, maxNights: body.maxNights ?? null });
    if (code) {
      const existing = await this.prisma.promotion.findMany({ where: { hotelId }, select: { code: true } });
      if (existing.some((item) => promotionCode(item.code) === code)) throw new ConflictException('A promotion with this code already exists for the hotel.');
    }
    const [roomTypes, ratePlans] = await Promise.all([
      this.prisma.roomType.findMany({ where: { hotelId, id: body.roomTypeIds?.length ? { in: body.roomTypeIds } : undefined }, select: { id: true } }),
      this.prisma.ratePlan.findMany({ where: { roomType: { hotelId }, id: body.ratePlanIds?.length ? { in: body.ratePlanIds } : undefined }, select: { id: true } }),
    ]);
    if ((body.roomTypeIds?.length ?? 0) !== roomTypes.length || (body.ratePlanIds?.length ?? 0) !== ratePlans.length) throw new BadRequestException('Promotion targets must belong to the selected hotel.');
    const promotion = await this.prisma.promotion.create({ data: { hotelId, code, name: body.name.trim(), discountType: body.discountType, discountValue: body.discountValue, bookingStart, bookingEnd, stayStart, stayEnd, minNights: body.minNights ?? null, maxNights: body.maxNights ?? null, channels: normalizedChannels(body.channels), active: body.active ?? true, roomTypes: { create: roomTypes.map((room) => ({ roomTypeId: room.id })) }, ratePlans: { create: ratePlans.map((plan) => ({ ratePlanId: plan.id })) } } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'PROMOTION_CREATED', entityType: 'Promotion', entityId: promotion.id, after: { hotelId, name: promotion.name, discountType: promotion.discountType, discountValue: Number(promotion.discountValue) } } });
    return promotion;
  }

  async updatePromotion(id: string, body: Partial<PromotionDto>, actorUserId: string) {
    const current = await this.prisma.promotion.findUnique({ where: { id }, include: { roomTypes: true, ratePlans: true } });
    if (!current) throw new NotFoundException('Promotion not found.');
    await assertActorCanManageHotel(this.prisma, actorUserId, current.hotelId);
    const code = body.code === undefined ? promotionCode(current.code) : promotionCode(body.code);
    if (code) {
      const existing = await this.prisma.promotion.findMany({ where: { hotelId: current.hotelId, NOT: { id } }, select: { code: true } });
      if (existing.some((item) => promotionCode(item.code) === code)) throw new ConflictException('A promotion with this code already exists for the hotel.');
    }
    const effective = {
      discountType: body.discountType ?? current.discountType,
      discountValue: body.discountValue ?? current.discountValue,
      bookingStart: body.bookingStart === undefined ? current.bookingStart : promotionDate(body.bookingStart, 'bookingStart'),
      bookingEnd: body.bookingEnd === undefined ? current.bookingEnd : promotionDate(body.bookingEnd, 'bookingEnd'),
      stayStart: body.stayStart === undefined ? current.stayStart : promotionDate(body.stayStart, 'stayStart'),
      stayEnd: body.stayEnd === undefined ? current.stayEnd : promotionDate(body.stayEnd, 'stayEnd'),
      minNights: body.minNights === undefined ? current.minNights : body.minNights,
      maxNights: body.maxNights === undefined ? current.maxNights : body.maxNights,
    };
    validatePromotionState(effective);
    const roomTypeIds = body.roomTypeIds === undefined ? undefined : [...new Set(body.roomTypeIds)];
    const ratePlanIds = body.ratePlanIds === undefined ? undefined : [...new Set(body.ratePlanIds)];
    const updated = await this.prisma.$transaction(async (tx) => {
      if (roomTypeIds !== undefined) {
        const rooms = await tx.roomType.findMany({ where: { hotelId: current.hotelId, id: { in: roomTypeIds } }, select: { id: true } });
        if (rooms.length !== roomTypeIds.length) throw new BadRequestException('Promotion room targets must belong to the selected hotel.');
        await tx.promotionRoomType.deleteMany({ where: { promotionId: id } });
        if (roomTypeIds.length) await tx.promotionRoomType.createMany({ data: roomTypeIds.map((roomTypeId) => ({ promotionId: id, roomTypeId })) });
      }
      if (ratePlanIds !== undefined) {
        const plans = await tx.ratePlan.findMany({ where: { roomType: { hotelId: current.hotelId }, id: { in: ratePlanIds } }, select: { id: true } });
        if (plans.length !== ratePlanIds.length) throw new BadRequestException('Promotion rate-plan targets must belong to the selected hotel.');
        await tx.promotionRatePlan.deleteMany({ where: { promotionId: id } });
        if (ratePlanIds.length) await tx.promotionRatePlan.createMany({ data: ratePlanIds.map((ratePlanId) => ({ promotionId: id, ratePlanId })) });
      }
      return tx.promotion.update({ where: { id }, data: { name: body.name === undefined ? undefined : body.name.trim(), code, discountType: effective.discountType, discountValue: effective.discountValue, active: body.active, bookingStart: effective.bookingStart, bookingEnd: effective.bookingEnd, stayStart: effective.stayStart, stayEnd: effective.stayEnd, minNights: effective.minNights, maxNights: effective.maxNights, channels: body.channels === undefined ? undefined : normalizedChannels(body.channels) } });
    });
    await this.prisma.auditLog.create({ data: { actorUserId, action: body.active === false ? 'PROMOTION_DISABLED' : 'PROMOTION_UPDATED', entityType: 'Promotion', entityId: id, before: { active: current.active, code: current.code, discountType: current.discountType, discountValue: Number(current.discountValue), roomTypeIds: current.roomTypes.map((item) => item.roomTypeId), ratePlanIds: current.ratePlans.map((item) => item.ratePlanId) }, after: { active: updated.active, code: updated.code, discountType: updated.discountType, discountValue: Number(updated.discountValue), roomTypeIds: roomTypeIds ?? current.roomTypes.map((item) => item.roomTypeId), ratePlanIds: ratePlanIds ?? current.ratePlans.map((item) => item.ratePlanId) } } });
    return updated;
  }

  async rateSeasons(hotelId: string, actorUserId: string) {
    await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    return this.prisma.rateSeason.findMany({ where: { hotelId }, orderBy: [{ active: 'desc' }, { priority: 'desc' }, { startDate: 'asc' }], include: { roomTypes: { include: { roomType: { select: { id: true, name: true } } } }, ratePlans: { include: { ratePlan: { select: { id: true, name: true } } } } } });
  }

  async createRateSeason(hotelId: string, body: RateSeasonDto, actorUserId: string) {
    await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    const startDate = parseDateOnly(body.startDate, 'startDate');
    const endDate = parseDateOnly(body.endDate, 'endDate');
    const daysOfWeek = [...new Set(body.daysOfWeek ?? [])];
    validateSeasonState(startDate, endDate, daysOfWeek, body.adjustmentType, body.adjustmentValue);
    const roomTypeIds = [...new Set(body.roomTypeIds ?? [])];
    const ratePlanIds = [...new Set(body.ratePlanIds ?? [])];
    const [rooms, plans] = await Promise.all([
      roomTypeIds.length ? this.prisma.roomType.findMany({ where: { hotelId, id: { in: roomTypeIds } }, select: { id: true } }) : [],
      ratePlanIds.length ? this.prisma.ratePlan.findMany({ where: { id: { in: ratePlanIds }, roomType: { hotelId } }, select: { id: true } }) : [],
    ]);
    if (rooms.length !== roomTypeIds.length || plans.length !== ratePlanIds.length) throw new BadRequestException('Season targets must belong to the selected hotel.');
    const season = await this.prisma.rateSeason.create({ data: { hotelId, name: body.name.trim(), startDate, endDate, daysOfWeek, adjustmentType: body.adjustmentType, adjustmentValue: body.adjustmentValue, priority: body.priority ?? 0, active: body.active ?? true, roomTypes: { create: roomTypeIds.map((roomTypeId) => ({ roomTypeId })) }, ratePlans: { create: ratePlanIds.map((ratePlanId) => ({ ratePlanId })) } }, include: { roomTypes: true, ratePlans: true } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'RATE_SEASON_CREATED', entityType: 'RateSeason', entityId: season.id, after: { hotelId, name: season.name, startDate: season.startDate, endDate: season.endDate, adjustmentType: season.adjustmentType, adjustmentValue: Number(season.adjustmentValue), roomTypeIds, ratePlanIds } } });
    return season;
  }

  async updateRateSeason(id: string, body: Partial<RateSeasonDto>, actorUserId: string) {
    const current = await this.prisma.rateSeason.findUnique({ where: { id }, include: { roomTypes: true, ratePlans: true } });
    if (!current) throw new NotFoundException('Rate season not found.');
    await assertActorCanManageHotel(this.prisma, actorUserId, current.hotelId);
    const startDate = body.startDate === undefined ? current.startDate : parseDateOnly(body.startDate, 'startDate');
    const endDate = body.endDate === undefined ? current.endDate : parseDateOnly(body.endDate, 'endDate');
    const daysOfWeek = body.daysOfWeek === undefined ? current.daysOfWeek : [...new Set(body.daysOfWeek)];
    const adjustmentType = body.adjustmentType ?? current.adjustmentType;
    const adjustmentValue = body.adjustmentValue ?? Number(current.adjustmentValue);
    validateSeasonState(startDate, endDate, daysOfWeek, adjustmentType, adjustmentValue);
    const roomTypeIds = body.roomTypeIds === undefined ? undefined : [...new Set(body.roomTypeIds)];
    const ratePlanIds = body.ratePlanIds === undefined ? undefined : [...new Set(body.ratePlanIds)];
    const updated = await this.prisma.$transaction(async (tx) => {
      if (roomTypeIds !== undefined) {
        const rooms = await tx.roomType.findMany({ where: { hotelId: current.hotelId, id: { in: roomTypeIds } }, select: { id: true } });
        if (rooms.length !== roomTypeIds.length) throw new BadRequestException('Season room targets must belong to the selected hotel.');
        await tx.rateSeasonRoomType.deleteMany({ where: { seasonId: id } });
        if (roomTypeIds.length) await tx.rateSeasonRoomType.createMany({ data: roomTypeIds.map((roomTypeId) => ({ seasonId: id, roomTypeId })) });
      }
      if (ratePlanIds !== undefined) {
        const plans = await tx.ratePlan.findMany({ where: { roomType: { hotelId: current.hotelId }, id: { in: ratePlanIds } }, select: { id: true } });
        if (plans.length !== ratePlanIds.length) throw new BadRequestException('Season rate-plan targets must belong to the selected hotel.');
        await tx.rateSeasonRatePlan.deleteMany({ where: { seasonId: id } });
        if (ratePlanIds.length) await tx.rateSeasonRatePlan.createMany({ data: ratePlanIds.map((ratePlanId) => ({ seasonId: id, ratePlanId })) });
      }
      return tx.rateSeason.update({ where: { id }, data: { name: body.name?.trim(), startDate, endDate, daysOfWeek, adjustmentType, adjustmentValue, priority: body.priority, active: body.active } });
    });
    await this.prisma.auditLog.create({ data: { actorUserId, action: body.active === false ? 'RATE_SEASON_DISABLED' : 'RATE_SEASON_UPDATED', entityType: 'RateSeason', entityId: id, before: { active: current.active, adjustmentValue: Number(current.adjustmentValue), roomTypeIds: current.roomTypes.map((item) => item.roomTypeId), ratePlanIds: current.ratePlans.map((item) => item.ratePlanId) }, after: { active: updated.active, adjustmentValue: Number(updated.adjustmentValue), roomTypeIds: roomTypeIds ?? current.roomTypes.map((item) => item.roomTypeId), ratePlanIds: ratePlanIds ?? current.ratePlans.map((item) => item.ratePlanId) } } });
    return updated;
  }

  async yieldRules(hotelId: string, actorUserId: string) {
    await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    return this.prisma.yieldRule.findMany({ where: { hotelId }, orderBy: [{ active: 'desc' }, { priority: 'desc' }, { occupancyFrom: 'asc' }], include: { roomType: { select: { id: true, name: true } } } });
  }

  async createYieldRule(hotelId: string, body: YieldRuleDto, actorUserId: string) {
    await assertActorCanManageHotel(this.prisma, actorUserId, hotelId);
    validateYieldState(body.occupancyFrom, body.occupancyTo, body.adjustmentType, body.adjustmentValue);
    if (body.roomTypeId && !(await this.prisma.roomType.count({ where: { id: body.roomTypeId, hotelId } }))) throw new BadRequestException('Yield room type must belong to the selected hotel.');
    const rule = await this.prisma.yieldRule.create({ data: { hotelId, name: body.name.trim(), roomTypeId: body.roomTypeId || null, occupancyFrom: body.occupancyFrom, occupancyTo: body.occupancyTo, adjustmentType: body.adjustmentType, adjustmentValue: body.adjustmentValue, priority: body.priority ?? 0, active: body.active ?? true }, include: { roomType: { select: { id: true, name: true } } } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: 'YIELD_RULE_CREATED', entityType: 'YieldRule', entityId: rule.id, after: { hotelId, name: rule.name, occupancyFrom: rule.occupancyFrom, occupancyTo: rule.occupancyTo, adjustmentType: rule.adjustmentType, adjustmentValue: Number(rule.adjustmentValue), roomTypeId: rule.roomTypeId } } });
    return rule;
  }

  async updateYieldRule(id: string, body: Partial<YieldRuleDto>, actorUserId: string) {
    const current = await this.prisma.yieldRule.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Yield rule not found.');
    await assertActorCanManageHotel(this.prisma, actorUserId, current.hotelId);
    const occupancyFrom = body.occupancyFrom ?? current.occupancyFrom;
    const occupancyTo = body.occupancyTo ?? current.occupancyTo;
    const adjustmentType = body.adjustmentType ?? current.adjustmentType;
    const adjustmentValue = body.adjustmentValue ?? Number(current.adjustmentValue);
    validateYieldState(occupancyFrom, occupancyTo, adjustmentType, adjustmentValue);
    const roomTypeId = body.roomTypeId === undefined ? current.roomTypeId : body.roomTypeId || null;
    if (roomTypeId && !(await this.prisma.roomType.count({ where: { id: roomTypeId, hotelId: current.hotelId } }))) throw new BadRequestException('Yield room type must belong to the selected hotel.');
    const updated = await this.prisma.yieldRule.update({ where: { id }, data: { name: body.name?.trim(), roomTypeId, occupancyFrom, occupancyTo, adjustmentType, adjustmentValue, priority: body.priority, active: body.active }, include: { roomType: { select: { id: true, name: true } } } });
    await this.prisma.auditLog.create({ data: { actorUserId, action: body.active === false ? 'YIELD_RULE_DISABLED' : 'YIELD_RULE_UPDATED', entityType: 'YieldRule', entityId: id, before: { active: current.active, occupancyFrom: current.occupancyFrom, occupancyTo: current.occupancyTo, adjustmentValue: Number(current.adjustmentValue) }, after: { active: updated.active, occupancyFrom: updated.occupancyFrom, occupancyTo: updated.occupancyTo, adjustmentValue: Number(updated.adjustmentValue) } } });
    return updated;
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
          const baseAmount = day.baseAmount === undefined ? (day.amount === undefined ? undefined : day.amount) : day.baseAmount;
          const overrideAmount = day.overrideAmount === undefined ? undefined : day.overrideAmount;
          const effectiveAmount = overrideAmount === null ? baseAmount : overrideAmount ?? baseAmount;
          results.push(await tx.rateDay.update({ where: { id: existing.id }, data: { amount: effectiveAmount === undefined ? undefined : effectiveAmount, baseAmount, overrideAmount, taxAmount: day.taxAmount === undefined ? undefined : day.taxAmount, childAmount: day.childAmount === undefined ? undefined : day.childAmount, extraAdultAmount: day.extraAdultAmount === undefined ? undefined : day.extraAdultAmount, occupancyPrices: occupancyPrices === null ? Prisma.DbNull : occupancyPrices === undefined ? undefined : occupancyPrices, cta: day.cta === undefined ? undefined : day.cta, ctd: day.ctd === undefined ? undefined : day.ctd, minLos: day.minLos === undefined ? undefined : day.minLos, maxLos: day.maxLos === undefined ? undefined : day.maxLos } }));
        } else {
          const baseAmount = day.baseAmount ?? day.amount;
          const overrideAmount = day.overrideAmount ?? null;
          if (baseAmount === undefined && overrideAmount === null) throw new BadRequestException(`A base amount is required for ${day.date}.`);
          results.push(await tx.rateDay.create({ data: { ratePlanId, date, amount: overrideAmount ?? baseAmount!, baseAmount, overrideAmount, taxAmount: day.taxAmount ?? 0, childAmount: day.childAmount ?? 0, extraAdultAmount: day.extraAdultAmount ?? 0, occupancyPrices: occupancyPrices ?? undefined, cta: day.cta ?? false, ctd: day.ctd ?? false, minLos: day.minLos ?? 1, maxLos: day.maxLos ?? null } }));
        }
      }
      return results;
    });
  }
}

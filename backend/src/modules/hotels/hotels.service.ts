import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmenityDto, HotelContentDto, HotelImageDto, HotelReviewDto, InventoryBatchDto, RateBatchDto, RatePlanDto, RoomTypeDto } from './hotels.dto';
import { FilesService } from '../files/files.service';
import ExcelJS from 'exceljs';

@Injectable()
export class HotelsService {
  constructor(private prisma: PrismaService, private files: FilesService) {}

  list() {
    return this.prisma.hotel.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      include: {
        images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] },
        amenities: { include: { amenity: true } },
        rooms: { where: { active: true }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true } } } },
      },
    });
  }

  async detail(slug: string) {
    const hotel = await this.prisma.hotel.findFirst({
      where: { slug, active: true },
      include: {
        images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] },
        amenities: { include: { amenity: true } },
        taxes: { where: { active: true } },
        charges: { where: { active: true } },
        rooms: { where: { active: true }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true } } } },
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

  catalog(hotelId: string, startDate?: string, endDate?: string) {
    const from = startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined;
    const to = endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined;
    const validRange = from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to;
    return this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: { images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }] }, amenities: { include: { amenity: true } }, rooms: { orderBy: { name: 'asc' }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { orderBy: { name: 'asc' }, include: { rates: { where: validRange ? { date: { gte: from, lte: to } } : undefined, orderBy: { date: 'asc' }, take: 370 } } }, inventory: { where: validRange ? { date: { gte: from, lte: to } } : undefined, orderBy: { date: 'asc' }, take: 370 } } } } });
  }

  async pricebookExport(hotelId: string) {
    const hotel = await this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: { rooms: { orderBy: { name: 'asc' }, include: { ratePlans: { orderBy: { name: 'asc' }, include: { rates: { orderBy: { date: 'asc' } } } }, inventory: { orderBy: { date: 'asc' } } } } } });
    const workbook = new ExcelJS.Workbook(); workbook.creator = 'RainWood Hotels'; workbook.created = new Date();
    const sheet = workbook.addWorksheet('Price Book');
    const columns = ['Hotel', 'Room Code', 'Room', 'Rate Plan Code', 'Rate Plan', 'Meal Plan', 'Date', 'Inventory Available', 'Stop Sell', 'Base Amount (INR)', 'Tax (INR)', 'Single (INR)', 'Double (INR)', 'Triple (INR)', 'Quad (INR)', 'Extra Bed (INR)', 'Extra Adult (INR)', 'Extra Child (INR)', 'Extra Adult 2 (INR)', 'Extra Child 2 (INR)', 'Extra Adult 3 (INR)', 'Extra Child 3 (INR)', 'Extra Infant (INR)', 'CTA', 'CTD', 'Min LOS', 'Max LOS'];
    sheet.addRow([`${hotel.name} Price Book`, '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '']);
    sheet.addRow([`All rooms and rate plans · exported ${new Date().toISOString().slice(0, 10)}`]);
    const header = sheet.addRow(columns); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } }; header.alignment = { vertical: 'middle', wrapText: true };
    for (const room of hotel.rooms) for (const plan of room.ratePlans) {
      const rateByDate = new Map(plan.rates.map((rate) => [rate.date.toISOString().slice(0, 10), rate]));
      const inventoryByDate = new Map(room.inventory.map((day) => [day.date.toISOString().slice(0, 10), day]));
      const dates = [...new Set([...rateByDate.keys(), ...inventoryByDate.keys()])].sort();
      for (const date of dates) {
        const rate = rateByDate.get(date); const inventory = inventoryByDate.get(date); const occupancy = (rate?.occupancyPrices ?? {}) as Record<string, unknown>;
        sheet.addRow([hotel.name, room.code, room.name, plan.code, plan.name, plan.mealPlan, date, inventory?.available ?? '', inventory?.stopSell ? 'Yes' : 'No', rate ? Number(rate.amount) : '', rate ? Number(rate.taxAmount) : '', occupancy.single ?? '', occupancy.double ?? '', occupancy.triple ?? '', occupancy.quad ?? '', occupancy.extrabed ?? '', occupancy.extraadult ?? '', occupancy.extrachild ?? '', occupancy.extraadult2 ?? '', occupancy.extrachild2 ?? '', occupancy.extraadult3 ?? '', occupancy.extrachild3 ?? '', occupancy.extrainfant ?? '', rate?.cta ? 'Yes' : 'No', rate?.ctd ? 'Yes' : 'No', rate?.minLos ?? '', rate?.maxLos ?? '']);
      }
    }
    sheet.views = [{ state: 'frozen', ySplit: 3 }]; sheet.autoFilter = { from: 'A3', to: `AA${sheet.rowCount}` };
    sheet.columns.forEach((column, index) => { column.width = index === 0 ? 28 : index === 2 || index === 4 ? 24 : index === 5 ? 18 : 16; });
    for (const row of sheet.getRows(4, Math.max(0, sheet.rowCount - 3)) ?? []) row.eachCell((cell, columnNumber) => { if (typeof cell.value === 'number' && columnNumber >= 10 && columnNumber <= 23) cell.numFmt = '#,##0.00'; });
    return Buffer.from(await workbook.xlsx.writeBuffer());
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
    return this.prisma.hotelImage.create({ data: { hotelId, url: body.url.trim(), altText: body.altText?.trim() || 'RainWood hotel image', sortOrder: body.sortOrder ?? 0, published: body.published ?? true } });
  }

  async deleteImage(hotelId: string, imageId: string) {
    const image = await this.prisma.hotelImage.findFirst({ where: { id: imageId, hotelId } });
    if (!image) throw new NotFoundException('Hotel image not found');
    const fileId = image.url.match(/\/files\/public\/([^/?#]+)/)?.[1];
    await this.prisma.hotelImage.delete({ where: { id: image.id } });
    if (fileId) await this.files.remove(fileId);
    return { deleted: true, imageId: image.id, fileId: fileId ?? null };
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

  async createRatePlan(roomTypeId: string, body: RatePlanDto) {
    await this.prisma.roomType.findUniqueOrThrow({ where: { id: roomTypeId } });
    return this.prisma.ratePlan.create({ data: { ...body, roomTypeId, axisRatePlanId: body.axisRatePlanId || undefined } });
  }

  async updateRatePlan(id: string, body: Partial<RatePlanDto>) {
    await this.prisma.ratePlan.findUniqueOrThrow({ where: { id } });
    return this.prisma.ratePlan.update({ where: { id }, data: { ...body, axisRatePlanId: body.axisRatePlanId || undefined } });
  }

  ratePlans() {
    return this.prisma.ratePlan.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }], include: { roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } }, _count: { select: { rates: true, lines: true, holdLines: true } } } });
  }

  async deleteRatePlan(id: string) {
    const plan = await this.prisma.ratePlan.findUnique({ where: { id }, include: { _count: { select: { rates: true, lines: true, holdLines: true, cancellationRules: true } } } });
    if (!plan) throw new NotFoundException('Rate plan not found');
    const dependencies = plan._count.rates + plan._count.lines + plan._count.holdLines + plan._count.cancellationRules;
    if (dependencies > 0) throw new ConflictException('This rate plan has rates or booking history. Deactivate it instead of deleting it.');
    return this.prisma.ratePlan.delete({ where: { id } });
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
    return this.prisma.$transaction(body.days.map((day) => this.prisma.rateDay.upsert({ where: { ratePlanId_date: { ratePlanId, date: new Date(`${day.date}T00:00:00.000Z`) } }, create: { ratePlanId, date: new Date(`${day.date}T00:00:00.000Z`), amount: day.amount, taxAmount: day.taxAmount ?? 0, childAmount: day.childAmount ?? 0, extraAdultAmount: day.extraAdultAmount ?? 0, occupancyPrices: day.occupancyPrices ?? undefined, cta: Boolean(day.cta), ctd: Boolean(day.ctd), minLos: day.minLos ?? 1, maxLos: day.maxLos }, update: { amount: day.amount, taxAmount: day.taxAmount ?? 0, childAmount: day.childAmount ?? 0, extraAdultAmount: day.extraAdultAmount ?? 0, occupancyPrices: day.occupancyPrices ?? undefined, cta: Boolean(day.cta), ctd: Boolean(day.ctd), minLos: day.minLos ?? 1, maxLos: day.maxLos } })));
  }
}

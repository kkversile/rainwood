import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { AmenityDto, HotelContentDto, HotelDocumentDto, HotelDocumentUpdateDto, HotelImageDto, HotelImageOrderDto, HotelImageUpdateDto, HotelLocationAttractionDto, HotelLocationProfileDto, HotelLocationTransportDto, HotelPolicyDto, HotelReviewDto, HotelVideoDto, InventoryBatchDto, RateBatchDto, RatePlanDto, RoomTypeDto } from './hotels.dto';
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
        images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] },
        videos: { orderBy: { createdAt: 'desc' } },
        amenities: { include: { amenity: true } },
        rooms: { where: { active: true }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { where: { active: true } } } },
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

  catalog(hotelId: string, startDate?: string, endDate?: string) {
    const from = startDate ? new Date(`${startDate}T00:00:00.000Z`) : undefined;
    const to = endDate ? new Date(`${endDate}T00:00:00.000Z`) : undefined;
    const validRange = from && to && !Number.isNaN(from.getTime()) && !Number.isNaN(to.getTime()) && from <= to;
    return this.prisma.hotel.findUniqueOrThrow({ where: { id: hotelId }, include: { images: { where: { published: true, url: { not: '/rainwood-placeholder.svg' } }, orderBy: [{ isMain: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }] }, videos: { orderBy: { createdAt: 'desc' } }, amenities: { include: { amenity: true } }, rooms: { orderBy: { name: 'asc' }, include: { images: { where: { published: true }, orderBy: { sortOrder: 'asc' } }, ratePlans: { orderBy: { name: 'asc' }, include: { rates: { where: validRange ? { date: { gte: from, lte: to } } : undefined, orderBy: { date: 'asc' }, take: 370 } } }, inventory: { where: validRange ? { date: { gte: from, lte: to } } : undefined, orderBy: { date: 'asc' }, take: 370 } } } } });
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

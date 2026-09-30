import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { BookingSource, DocumentSequenceType, InquiryStatus, Prisma, UserRole } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { InquiryConvertDto, InquiryCreateDto, InquiryFollowUpDto, InquiryListQueryDto, InquiryLostDto, InquiryQuoteDto, InquiryUpdateDto } from './inquiries.dto';
import { AvailabilityService } from '../availability/availability.service';
import { nextDocumentNumber } from '../../common/document-sequences';
import { getHotelOperationalDate } from '../../common/hotel-dates';

const ROLES: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN, UserRole.RESERVATION];
const normalizeMobile = (value: string) => value.replace(/\D/g, '');
const money = (value: unknown) => Number(value ?? 0);

@Injectable()
export class InquiriesService {
  constructor(private readonly p: PrismaService, private readonly audit: AuditService, @Optional() private readonly availability?: AvailabilityService) {}
  private async scope(userId: string) { const scope = await getActorScope(this.p, userId); if (!ROLES.includes(scope.role)) throw new ForbiddenException('Inquiry CRM access is not available to this account.'); return scope; }
  private async assertHotel(userId: string, hotelId: string) { const scope = await this.scope(userId); if (!scope.isGlobal && scope.hotelId !== hotelId) throw new ForbiddenException('You cannot access another hotel.'); const hotel = await this.p.hotel.findUnique({ where: { id: hotelId }, select: { id: true, name: true, active: true, timezoneName: true } }); if (!hotel?.active) throw new NotFoundException('Hotel not found.'); return hotel; }
  private include = { hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } }, assignedTo: { select: { id: true, name: true } }, followUps: { orderBy: { createdAt: 'desc' as const }, include: { createdBy: { select: { id: true, name: true } } } }, convertedReservation: { select: { id: true, reference: true, status: true } } } as const;
  private view(row: any) { return { ...row, quotedAmount: row.quotedAmount === null ? null : money(row.quotedAmount), followUps: (row.followUps ?? []).map((item: any) => ({ ...item })), matchedGuestProfileId: undefined }; }

  async list(userId: string, query: InquiryListQueryDto) {
    const scope = await this.scope(userId); const hotelId = resolveRequestedHotel(scope, query.hotelId); const today = new Date(); today.setHours(0, 0, 0, 0); const where: Prisma.BookingInquiryWhereInput = { hotelId: hotelId ?? undefined, status: query.status, source: query.source, assignedToId: query.assignedToId, OR: query.search ? [{ inquiryNo: { contains: query.search, mode: 'insensitive' } }, { guestName: { contains: query.search, mode: 'insensitive' } }, { mobile: { contains: query.search } }] : undefined, checkIn: query.stayFrom || query.stayTo ? { gte: query.stayFrom ? new Date(query.stayFrom) : undefined, lte: query.stayTo ? new Date(query.stayTo) : undefined } : undefined, nextFollowUpAt: query.followUpTo ? { lte: new Date(query.followUpTo) } : undefined };
    const [rows, counts] = await Promise.all([this.p.bookingInquiry.findMany({ where, include: this.include, orderBy: [{ nextFollowUpAt: 'asc' }, { createdAt: 'desc' }] }), this.p.bookingInquiry.groupBy({ by: ['status'], where: { hotelId: hotelId ?? undefined }, _count: { status: true } })]); const metrics = Object.fromEntries(Object.values(InquiryStatus).map((status) => [status, counts.find((row) => row.status === status)?._count.status ?? 0])); const followUpDue = await this.p.bookingInquiry.count({ where: { ...where, nextFollowUpAt: { lte: today }, status: { notIn: [InquiryStatus.CONVERTED, InquiryStatus.LOST] } } }); return { inquiries: rows.map((row) => this.view(row)), metrics: { ...metrics, followUpDue } };
  }
  async detail(userId: string, id: string) { const scope = await this.scope(userId); const row = await this.p.bookingInquiry.findUnique({ where: { id }, include: this.include }); if (!row || (scope.hotelId && row.hotelId !== scope.hotelId)) throw new NotFoundException('Inquiry not found.'); return this.view(row); }
  async create(userId: string, body: InquiryCreateDto) {
    const hotel = await this.assertHotel(userId, body.hotelId);
    if (body.checkIn && body.checkOut && body.checkOut <= body.checkIn) throw new BadRequestException('checkOut must be after checkIn.');
    if (body.roomTypeId && !(await this.p.roomType.findFirst({ where: { id: body.roomTypeId, hotelId: body.hotelId, active: true } }))) throw new BadRequestException('Room type is not available for this hotel.');
    if (body.assignedToId && !(await this.p.user.findFirst({ where: { id: body.assignedToId, role: UserRole.RESERVATION, staffHotelId: body.hotelId, active: true } }))) throw new BadRequestException('Assigned user is not available at this hotel.');
    const year = getHotelOperationalDate(hotel.timezoneName ?? 'UTC').getUTCFullYear();
    const inquiryNo = await nextDocumentNumber(this.p, body.hotelId, DocumentSequenceType.INQUIRY, year, 'INQ');
    const matched = await this.p.guestProfile.findFirst({ where: { OR: [{ normalizedMobile: normalizeMobile(body.mobile) }, ...(body.email ? [{ normalizedEmail: body.email.toLowerCase() }] : [])] }, select: { id: true } });
    const row = await this.p.bookingInquiry.create({ data: { hotelId: body.hotelId, inquiryNo, guestName: body.guestName.trim(), mobile: body.mobile.trim(), email: body.email?.toLowerCase(), source: body.source, checkIn: body.checkIn ? new Date(body.checkIn) : null, checkOut: body.checkOut ? new Date(body.checkOut) : null, adults: body.adults, children: body.children, roomTypeId: body.roomTypeId || null, assignedToId: body.assignedToId || null, nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null, notes: body.notes?.trim() || null }, include: this.include });
    await this.audit.log({ actorUserId: userId, action: 'INQUIRY_CREATED', entityType: 'BookingInquiry', entityId: row.id, after: { hotelId: row.hotelId, inquiryNo: row.inquiryNo, matchedExistingGuestProfile: Boolean(matched) } });
    return { ...this.view(row), matchedGuestProfileId: matched?.id ?? null };
  }
  async update(userId: string, id: string, body: InquiryUpdateDto) {
    const current = await this.detail(userId, id);
    const hasRoomType = Object.prototype.hasOwnProperty.call(body, 'roomTypeId');
    const hasAssignee = Object.prototype.hasOwnProperty.call(body, 'assignedToId');
    const effectiveRoomTypeId = hasRoomType ? body.roomTypeId ?? null : current.roomTypeId ?? null;
    const effectiveAssignedToId = hasAssignee ? body.assignedToId ?? null : current.assignedToId ?? null;
    const effectiveCheckIn = body.checkIn ?? (current.checkIn ? new Date(current.checkIn).toISOString().slice(0, 10) : undefined);
    const effectiveCheckOut = body.checkOut ?? (current.checkOut ? new Date(current.checkOut).toISOString().slice(0, 10) : undefined);
    if (effectiveCheckIn && effectiveCheckOut && effectiveCheckOut <= effectiveCheckIn) throw new BadRequestException('checkOut must be after checkIn.');
    if (effectiveRoomTypeId && !(await this.p.roomType.findFirst({ where: { id: effectiveRoomTypeId, hotelId: current.hotelId, active: true } }))) throw new BadRequestException('Room type is not available for this hotel.');
    if (effectiveAssignedToId && !(await this.p.user.findFirst({ where: { id: effectiveAssignedToId, role: UserRole.RESERVATION, staffHotelId: current.hotelId, active: true } }))) throw new BadRequestException('Assigned user is not available at this hotel.');
    const data: Prisma.BookingInquiryUpdateInput = { guestName: body.guestName?.trim(), mobile: body.mobile?.trim(), email: body.email?.toLowerCase(), source: body.source, checkIn: body.checkIn ? new Date(body.checkIn) : undefined, checkOut: body.checkOut ? new Date(body.checkOut) : undefined, adults: body.adults, children: body.children, roomType: hasRoomType ? effectiveRoomTypeId ? { connect: { id: effectiveRoomTypeId } } : { disconnect: true } : undefined, assignedTo: hasAssignee ? effectiveAssignedToId ? { connect: { id: effectiveAssignedToId } } : { disconnect: true } : undefined, nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : undefined, notes: body.notes?.trim() };
    const row = await this.p.bookingInquiry.update({ where: { id: current.id }, data, include: this.include });
    await this.audit.log({ actorUserId: userId, action: 'INQUIRY_UPDATED', entityType: 'BookingInquiry', entityId: id, after: { fields: Object.keys(body) } });
    return this.view(row);
  }
  async followUp(userId: string, id: string, body: InquiryFollowUpDto) { const current = await this.detail(userId, id); if ([InquiryStatus.CONVERTED, InquiryStatus.LOST].includes(current.status)) throw new ConflictException('Closed inquiries cannot receive follow-ups.'); const row = await this.p.$transaction(async (tx) => { await tx.inquiryFollowUp.create({ data: { inquiryId: id, method: body.method, note: body.note.trim(), nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null, createdById: userId } }); return tx.bookingInquiry.update({ where: { id }, data: { status: InquiryStatus.FOLLOW_UP, lastFollowUpAt: new Date(), nextFollowUpAt: body.nextFollowUpAt ? new Date(body.nextFollowUpAt) : null }, include: this.include }); }); await this.audit.log({ actorUserId: userId, action: 'INQUIRY_FOLLOWUP_ADDED', entityType: 'BookingInquiry', entityId: id, after: { method: body.method } }); return this.view(row); }
  async quote(userId: string, id: string, body: InquiryQuoteDto) {
    const current = await this.detail(userId, id);
    if ([InquiryStatus.CONVERTED, InquiryStatus.LOST].includes(current.status)) throw new ConflictException('Closed inquiries cannot be quoted.');
    if (!this.availability) throw new BadRequestException('Authoritative quote pricing is unavailable.');
    if (!current.checkIn || !current.checkOut || !current.roomTypeId) throw new BadRequestException('Inquiry must have stay dates and a room type before quoting.');
    const scope = await this.scope(userId);
    const quote = await this.availability.quoteSelection(this.p, { hotelId: current.hotelId, roomTypeId: current.roomTypeId, ratePlanId: body.ratePlanId, checkIn: new Date(current.checkIn).toISOString().slice(0, 10), checkOut: new Date(current.checkOut).toISOString().slice(0, 10), rooms: body.rooms, adults: body.adults, children: body.children, source: current.source, corporateAccountId: body.corporateAccountId }, { checkInventory: false, channel: current.source, promotionCode: body.promotionCode, corporateAccountId: body.corporateAccountId, actor: { id: userId, role: scope.role } });
    const quotedAt = new Date();
    const snapshot = { hotelId: current.hotelId, stay: { checkIn: current.checkIn, checkOut: current.checkOut }, roomTypeId: current.roomTypeId, ratePlanId: body.ratePlanId, occupancy: { rooms: body.rooms, adults: body.adults, children: body.children }, corporateAccountId: body.corporateAccountId ?? null, quote: { ...quote, quotedAt: quotedAt.toISOString() } };
    const row = await this.p.bookingInquiry.update({ where: { id }, data: { quotedAmount: quote.total, quotedAt, quoteSnapshot: snapshot as Prisma.InputJsonValue, status: InquiryStatus.QUOTE_SENT }, include: this.include });
    await this.audit.log({ actorUserId: userId, action: 'INQUIRY_QUOTED', entityType: 'BookingInquiry', entityId: id, after: { quotedAmount: quote.total, authoritative: true } });
    return this.view(row);
  }

  async markLost(userId: string, id: string, body: InquiryLostDto) {
    const current = await this.detail(userId, id);
    if ([InquiryStatus.CONVERTED, InquiryStatus.LOST].includes(current.status)) throw new ConflictException('Closed inquiries cannot be marked lost.');
    const reason = body.lostReason.trim();
    if (!reason) throw new BadRequestException('A lost reason is required.');
    const row = await this.p.bookingInquiry.update({ where: { id }, data: { status: InquiryStatus.LOST, lostReason: reason, nextFollowUpAt: null }, include: this.include });
    await this.audit.log({ actorUserId: userId, action: 'INQUIRY_LOST', entityType: 'BookingInquiry', entityId: id, after: { lostReason: reason } });
    return this.view(row);
  }
  async convert(userId: string, id: string, body: InquiryConvertDto) { const scope = await this.scope(userId); const inquiry = await this.p.bookingInquiry.findUnique({ where: { id } }); if (!inquiry || (scope.hotelId && inquiry.hotelId !== scope.hotelId)) throw new NotFoundException('Inquiry not found.'); if (inquiry.status === InquiryStatus.LOST) throw new ConflictException('Lost inquiries cannot be converted.'); const reservation = await this.p.reservation.findUnique({ where: { reference: body.reservationReference }, select: { id: true, reference: true, hotelId: true } }); if (!reservation || reservation.hotelId !== inquiry.hotelId) throw new BadRequestException('Reservation does not belong to this inquiry hotel.'); if (inquiry.convertedReservationId && inquiry.convertedReservationId !== reservation.id) throw new ConflictException('Inquiry is already linked to another reservation.'); if (inquiry.convertedReservationId === reservation.id) return { status: InquiryStatus.CONVERTED, reservation }; if (inquiry.status === InquiryStatus.CONVERTED) throw new ConflictException('Inquiry is already converted.'); const updated = await this.p.bookingInquiry.updateMany({ where: { id, convertedReservationId: null, status: { notIn: [InquiryStatus.LOST, InquiryStatus.CONVERTED] } }, data: { status: InquiryStatus.CONVERTED, convertedReservationId: reservation.id, nextFollowUpAt: null } }); if (updated.count !== 1) { const retry = await this.p.bookingInquiry.findUnique({ where: { id }, select: { convertedReservationId: true } }); if (retry?.convertedReservationId === reservation.id) return { status: InquiryStatus.CONVERTED, reservation }; throw new ConflictException('Inquiry conversion was already completed.'); } await this.audit.log({ actorUserId: userId, action: 'INQUIRY_CONVERTED', entityType: 'BookingInquiry', entityId: id, after: { reservationId: reservation.id, reference: reservation.reference } }); return { status: InquiryStatus.CONVERTED, reservation }; }
  async report(userId: string, query: InquiryListQueryDto) { const result = await this.list(userId, query); const grouped = (key: (row: any) => string) => result.inquiries.reduce((map: Record<string, number>, row: any) => { const label = key(row); map[label] = (map[label] ?? 0) + 1; return map; }, {}); const total = result.inquiries.length; const converted = result.inquiries.filter((row: any) => row.status === InquiryStatus.CONVERTED).length; return { total, quoteSent: result.inquiries.filter((row: any) => row.status === InquiryStatus.QUOTE_SENT).length, converted, lost: result.inquiries.filter((row: any) => row.status === InquiryStatus.LOST).length, conversionRate: total ? Number((converted / total * 100).toFixed(2)) : 0, bySource: grouped((row) => row.source), byHotel: grouped((row) => row.hotel?.name ?? 'Unknown'), byAssignedUser: grouped((row) => row.assignedTo?.name ?? 'Unassigned') }; }
}

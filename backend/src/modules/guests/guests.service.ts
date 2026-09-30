import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { GuestNoteCategory, GuestNoteVisibility, Prisma, ReservationStatus, StayStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { normalizeGuestEmail, normalizeGuestMobile } from './guest-normalization';
import { CreateGuestNoteDto, GuestListQueryDto, UpdateGuestProfileDto } from './guests.dto';

const OPERATIONAL_PREFERENCE_KEYS = ['extraPillow', 'quietRoom', 'babyCot', 'vegetarian', 'vegan', 'allergyNote', 'dietaryNote'] as const;

export function guestArrivalContext(profile: any, includePreferences = false) {
  if (!profile) return null;
  const completed = (profile.reservations ?? []).filter((row: any) => row.status !== ReservationStatus.CANCELLED && row.status !== ReservationStatus.EXPIRED && (row.stayStatus === StayStatus.CHECKED_OUT || row.status === ReservationStatus.COMPLETED)).sort((a: any, b: any) => new Date(b.checkOut).getTime() - new Date(a.checkOut).getTime());
  const preferences = profile.preferences && typeof profile.preferences === 'object' ? profile.preferences as Record<string, unknown> : {};
  const operationalPreferences = Object.fromEntries(OPERATIONAL_PREFERENCE_KEYS.filter((key) => preferences[key] !== undefined && preferences[key] !== null && preferences[key] !== '').map((key) => [key, preferences[key]]));
  return { id: profile.id, repeatGuest: completed.length >= 2, completedStays: completed.length, lastStay: completed[0]?.checkOut ?? null, ...(includePreferences ? { operationalPreferences } : {}) };
}

@Injectable()
export class GuestsService {
  constructor(private readonly p: PrismaService) {}

  async resolveForReservation(input: { hotelId: string; guestName?: string; mobile?: string; email?: string }) {
    const normalizedMobile = normalizeGuestMobile(input.mobile);
    const normalizedEmail = normalizeGuestEmail(input.email);
    const matches = await this.p.guestProfile.findMany({ where: { OR: [...(normalizedMobile ? [{ normalizedMobile }] : []), ...(normalizedEmail ? [{ normalizedEmail }] : [])] }, select: { id: true, normalizedMobile: true, normalizedEmail: true } });
    const byMobile = normalizedMobile ? matches.find((profile) => profile.normalizedMobile === normalizedMobile) : undefined;
    const byEmail = normalizedEmail ? matches.find((profile) => profile.normalizedEmail === normalizedEmail) : undefined;
    if (byMobile && byEmail && byMobile.id !== byEmail.id) return { guestProfileId: null, conflict: true };
    if (byMobile || byEmail) return { guestProfileId: (byMobile ?? byEmail)!.id, conflict: false };
    if (!normalizedMobile && !normalizedEmail) return { guestProfileId: null, conflict: false };
    const profile = await this.p.guestProfile.create({ data: { displayName: input.guestName?.trim() || 'Guest', mobile: input.mobile?.trim() || null, email: input.email?.trim() || null, normalizedMobile, normalizedEmail, preferredHotelId: input.hotelId } });
    return { guestProfileId: profile.id, conflict: false };
  }

  private async authorisedUser(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { role: true, staffHotelId: true } });
    if (!user || !([UserRole.ADMIN, UserRole.CORPORATE_ADMIN, UserRole.SUPER_ADMIN, UserRole.RESERVATION] as any).includes(user.role)) throw new ForbiddenException('Guest CRM access is restricted to authorised staff.');
    return user;
  }

  private async scope(userId: string, requestedHotelId?: string) {
    const user = await this.authorisedUser(userId);
    if (user.staffHotelId && requestedHotelId && user.staffHotelId !== requestedHotelId) throw new ForbiddenException('Hotel scope does not allow this guest data.');
    return user.staffHotelId ?? requestedHotelId;
  }

  private async assertGuestAccessibleForHotel(userId: string, guestProfileId: string, operation: 'update' | 'note') {
    const user = await this.authorisedUser(userId);
    const guest = user.staffHotelId
      ? await this.p.guestProfile.findFirst({ where: { id: guestProfileId, reservations: { some: { hotelId: user.staffHotelId } } }, select: { id: true } })
      : await this.p.guestProfile.findUnique({ where: { id: guestProfileId }, select: { id: true } });
    if (!guest) throw new NotFoundException('Guest profile not found.');
    return { user, hotelId: user.staffHotelId, operation };
  }

  private profileWhere(scopeHotelId?: string, search?: string): Prisma.GuestProfileWhereInput {
    const text = search?.trim();
    return { ...(text ? { OR: [{ displayName: { contains: text, mode: 'insensitive' } }, { email: { contains: text, mode: 'insensitive' } }, { mobile: { contains: text } }, { normalizedEmail: { contains: text.toLowerCase() } }, { normalizedMobile: { contains: text.replace(/\D/g, '') } }] } : {}), ...(scopeHotelId ? { reservations: { some: { hotelId: scopeHotelId } } } : {}) };
  }

  private metrics(reservations: any[]) {
    const completed = reservations.filter((row) => row.status !== ReservationStatus.CANCELLED && (row.stayStatus === StayStatus.CHECKED_OUT || row.status === ReservationStatus.COMPLETED));
    const active = reservations.filter((row) => row.status !== ReservationStatus.CANCELLED && row.status !== ReservationStatus.EXPIRED);
    const roomNights = completed.reduce((sum, row) => sum + row.lines.reduce((lineSum: number, line: any) => lineSum + line.nights.reduce((nightSum: number, night: any) => nightSum + night.rooms, 0), 0), 0);
    const roomRevenue = completed.reduce((sum, row) => sum + row.lines.reduce((lineSum: number, line: any) => lineSum + line.nights.reduce((nightSum: number, night: any) => nightSum + Number(night.totalAmount), 0), 0), 0);
    const incidentalRevenue = completed.reduce((sum, row) => sum + row.folioCharges.reduce((chargeSum: number, charge: any) => chargeSum + Number(charge.totalAmount), 0), 0);
    const paid = completed.reduce((sum, row) => sum + row.payments.reduce((paymentSum: number, payment: any) => paymentSum + Number(payment.amount), 0), 0);
    const next = active.filter((row) => row.stayStatus !== StayStatus.CHECKED_OUT).sort((a, b) => a.checkIn.getTime() - b.checkIn.getTime())[0];
    return { completedStays: completed.length, repeatGuest: completed.length >= 2, roomNights, roomRevenue, incidentalRevenue, grossRevenue: roomRevenue + incidentalRevenue, verifiedPayments: paid, lastStay: completed.sort((a, b) => b.checkOut.getTime() - a.checkOut.getTime())[0]?.checkOut ?? null, nextStay: next?.checkIn ?? null };
  }

  private reservationInclude(scopeHotelId?: string): any {
    return { where: { ...(scopeHotelId ? { hotelId: scopeHotelId } : {}), status: { notIn: [ReservationStatus.CANCELLED, ReservationStatus.EXPIRED] } }, orderBy: { checkIn: 'desc' as const }, include: { hotel: { select: { id: true, name: true } }, lines: { include: { nights: true, roomType: { select: { name: true } } } }, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } }, payments: { where: { verified: true }, select: { amount: true } } } };
  }

  async list(userId: string, query: GuestListQueryDto) {
    const scope = await this.scope(userId, query.hotelId);
    const profiles: any[] = await this.p.guestProfile.findMany({ where: this.profileWhere(scope, query.search), orderBy: { updatedAt: 'desc' }, take: 100, include: { reservations: this.reservationInclude(scope) } } as any);
    return profiles.map((profile) => ({ id: profile.id, displayName: profile.displayName, mobile: profile.mobile, email: profile.email, vipLevel: profile.vipLevel, blacklisted: profile.blacklisted, metrics: this.metrics(profile.reservations) })).filter((profile) => !query.repeat || profile.metrics.repeatGuest);
  }

  async detail(userId: string, id: string, requestedHotelId?: string) {
    const scope = await this.scope(userId, requestedHotelId);
    const profile: any = await this.p.guestProfile.findUnique({ where: { id }, include: { preferredHotel: { select: { id: true, name: true } }, preferredRoomType: { select: { id: true, name: true } }, reservations: this.reservationInclude(scope), notes: { where: scope ? { OR: [{ hotelId: scope }, { hotelId: null, visibility: { not: GuestNoteVisibility.MANAGEMENT_ONLY } }] } : undefined, orderBy: { createdAt: 'desc' }, include: { hotel: { select: { id: true, name: true } }, createdBy: { select: { name: true } } } } } } as any);
    if (!profile) throw new NotFoundException('Guest profile not found.');
    return { id: profile.id, displayName: profile.displayName, mobile: profile.mobile, email: profile.email, gstin: profile.gstin, preferredLanguage: profile.preferredLanguage, preferences: profile.preferences, vipLevel: profile.vipLevel, blacklisted: profile.blacklisted, preferredHotel: profile.preferredHotel, preferredRoomType: profile.preferredRoomType, metrics: this.metrics(profile.reservations), stays: profile.reservations.map((row: any) => ({ reference: row.reference, hotel: row.hotel, status: row.status, stayStatus: row.stayStatus, checkIn: row.checkIn, checkOut: row.checkOut, totalAmount: row.totalAmount, roomNights: row.lines.reduce((sum: number, line: any) => sum + line.nights.reduce((n: number, night: any) => n + night.rooms, 0), 0), roomTypes: [...new Set(row.lines.map((line: any) => line.roomType.name))] })), notes: profile.notes };
  }

  async match(userId: string, mobile?: string, email?: string) {
    await this.scope(userId);
    const normalizedMobile = normalizeGuestMobile(mobile); const normalizedEmail = normalizeGuestEmail(email);
    const matches = await this.p.guestProfile.findMany({ where: { OR: [...(normalizedMobile ? [{ normalizedMobile }] : []), ...(normalizedEmail ? [{ normalizedEmail }] : [])] }, select: { id: true, displayName: true, mobile: true, email: true, normalizedMobile: true, normalizedEmail: true } });
    const mobileProfile = matches.find((row) => row.normalizedMobile === normalizedMobile); const emailProfile = matches.find((row) => row.normalizedEmail === normalizedEmail);
    return { conflict: Boolean(mobileProfile && emailProfile && mobileProfile.id !== emailProfile.id), matches };
  }

  async update(userId: string, id: string, body: UpdateGuestProfileDto) {
    const { user, hotelId: scope } = await this.assertGuestAccessibleForHotel(userId, id, 'update');
    if (user.role === UserRole.RESERVATION && (body.vipLevel !== undefined || body.blacklisted !== undefined)) throw new ForbiddenException('Reservation users cannot change global VIP or blacklist flags.');
    if (body.preferredRoomTypeId) { const roomType = await this.p.roomType.findFirst({ where: { id: body.preferredRoomTypeId, ...(scope ? { hotelId: scope } : {}) }, select: { id: true } }); if (!roomType) throw new BadRequestException('Preferred room type is outside the current hotel scope.'); }
    const data: Prisma.GuestProfileUpdateInput = { ...body, ...(body.preferences !== undefined ? { preferences: body.preferences as Prisma.InputJsonValue } : {}), ...(body.mobile !== undefined ? { mobile: body.mobile || null, normalizedMobile: normalizeGuestMobile(body.mobile) } : {}), ...(body.email !== undefined ? { email: body.email || null, normalizedEmail: normalizeGuestEmail(body.email) } : {}) } as any;
    return this.p.guestProfile.update({ where: { id }, data, select: { id: true, displayName: true, mobile: true, email: true, preferences: true, vipLevel: true, blacklisted: true } });
  }

  async addNote(userId: string, id: string, body: CreateGuestNoteDto) {
    const { user, hotelId: scope } = await this.assertGuestAccessibleForHotel(userId, id, 'note');
    if (body.visibility === GuestNoteVisibility.MANAGEMENT_ONLY) { const user = await this.p.user.findUnique({ where: { id: userId }, select: { role: true } }); if (!user || !([UserRole.ADMIN, UserRole.CORPORATE_ADMIN, UserRole.SUPER_ADMIN] as any).includes(user.role)) throw new ForbiddenException('Management notes require Admin access.'); }
    if (!body.note.trim()) throw new BadRequestException('Note cannot be empty.');
    const hotelId = scope ?? body.hotelId ?? null;
    if (!scope && hotelId && user.role !== UserRole.SUPER_ADMIN && user.role !== UserRole.CORPORATE_ADMIN && user.role !== UserRole.ADMIN) throw new ForbiddenException('Only global Admin users may choose a note hotel.');
    return this.p.guestNote.create({ data: { guestProfileId: id, category: body.category, visibility: body.visibility, note: body.note.trim(), hotelId, createdById: userId }, select: { id: true, category: true, visibility: true, note: true, hotelId: true, createdAt: true } });
  }
}

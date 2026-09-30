import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolioChargeCategory, StaffDepartment, StayStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { toDateOnly } from '../../common/dates';
import { getHotelOperationalDate } from '../../common/hotel-dates';
import { ReservationsService } from '../reservations/reservations.service';
import { StaffFolioChargeDto, StaffFoundItemDto, StaffStaysQueryDto } from './staff.dto';
import { GuestServicesService } from '../guest-services/guest-services.service';
import { allowedStaffFolioCategories } from './staff-rules';

@Injectable()
export class StaffService {
  constructor(private p: PrismaService, private reservations: ReservationsService, private guestServices?: GuestServicesService) {}

  private async profile(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, active: true, staffDepartment: true, jobTitle: true, staffHotelId: true, staffHotel: { select: { id: true, name: true, active: true, timezoneName: true } } } });
    if (!user || user.role !== UserRole.SERVICE_STAFF || !user.active || !user.staffHotelId || !user.staffHotel?.active) throw new ForbiddenException('Service staff must have an active assigned hotel.');
    return user;
  }

  private operationalWhere(staffHotelId: string, q?: string) {
    const search = q?.trim();
    return {
      hotelId: staffHotelId,
      stayStatus: StayStatus.CHECKED_IN,
      ...(search ? { OR: [{ reference: { contains: search, mode: 'insensitive' as const } }, { guestName: { contains: search, mode: 'insensitive' as const } }, { mobile: { contains: search } }, { roomAssignments: { some: { unassignedAt: null, room: { roomNumber: { contains: search, mode: 'insensitive' as const } } } } }] } : {}),
    };
  }

  private assertGuestOperationsAllowed(user: { staffDepartment: StaffDepartment | null }) {
    if (user.staffDepartment === StaffDepartment.HOUSEKEEPING) throw new ForbiddenException('Housekeeping staff must use the housekeeping room board.');
  }

  private operationalPreferences(row: any, department: StaffDepartment | null) {
    const preferences = row.guestProfile?.preferences && typeof row.guestProfile.preferences === 'object' ? row.guestProfile.preferences as Record<string, unknown> : {};
    const allowed = department === StaffDepartment.FOOD_BEVERAGE ? ['vegetarian', 'vegan', 'allergyNote', 'dietaryNote'] : ['extraPillow', 'quietRoom', 'babyCot'];
    const scoped = Object.fromEntries(allowed.filter((key) => preferences[key] !== undefined && preferences[key] !== null && preferences[key] !== '').map((key) => [key, preferences[key]]));
    const notes = (row.guestProfile?.notes ?? []).map((note: any) => ({ category: note.category, note: note.note }));
    return { ...scoped, notes };
  }

  private summarize(row: any, department: StaffDepartment | null = null) {
    const roomTypes = [...new Map(row.lines.map((line: any) => [line.roomType.id, line.roomType.name])).values()];
    const rooms = row.lines.reduce((sum: number, line: any) => sum + line.rooms, 0);
    const adults = row.lines.reduce((sum: number, line: any) => sum + line.adults, 0);
    const children = row.lines.reduce((sum: number, line: any) => sum + line.children, 0);
    return { reference: row.reference, guestName: row.guestName, checkIn: row.checkIn, checkOut: row.checkOut, status: row.status, stayStatus: row.stayStatus, rooms, roomTypes, adults, children, pax: adults + children, hotel: row.hotel, assignedRooms: (row.roomAssignments ?? []).map((assignment: any) => ({ id: assignment.id, roomNumber: assignment.room.roomNumber, floor: assignment.room.floor, wing: assignment.room.wing, roomType: assignment.room.roomType?.name ?? null })), operationalPreferences: this.operationalPreferences(row, department) };
  }

  async getMe(userId: string) {
    const user = await this.profile(userId);
    const hotel = user.staffHotel!;
    return { id: user.id, name: user.name, role: user.role, department: user.staffDepartment, jobTitle: user.jobTitle, hotel: { id: hotel.id, name: hotel.name }, allowedCategories: allowedStaffFolioCategories(user.staffDepartment) };
  }

  async listStays(userId: string, query: StaffStaysQueryDto) {
    const user = await this.profile(userId);
    this.assertGuestOperationsAllowed(user);
    const rows = await this.p.reservation.findMany({ where: this.operationalWhere(user.staffHotelId!, query.q), orderBy: [{ checkIn: 'asc' }, { guestName: 'asc' }], select: { reference: true, guestName: true, checkIn: true, checkOut: true, status: true, stayStatus: true, hotel: { select: { id: true, name: true } }, guestProfile: { select: { preferences: true, notes: { where: { visibility: 'SERVICE_STAFF' }, select: { category: true, note: true } } } }, lines: { select: { rooms: true, adults: true, children: true, roomType: { select: { id: true, name: true } } } }, roomAssignments: { where: { unassignedAt: null }, select: { id: true, room: { select: { roomNumber: true, floor: true, wing: true, roomType: { select: { name: true } } } } } } } });
    return rows.map((row) => this.summarize(row, user.staffDepartment));
  }

  private async staffStay(userId: string, reference: string) {
    const user = await this.profile(userId);
    this.assertGuestOperationsAllowed(user);
    const row = await this.p.reservation.findUnique({ where: { reference }, select: { reference: true, guestName: true, checkIn: true, checkOut: true, status: true, stayStatus: true, hotelId: true, hotel: { select: { id: true, name: true } }, guestProfile: { select: { preferences: true, notes: { where: { visibility: 'SERVICE_STAFF' }, select: { category: true, note: true } } } }, lines: { select: { rooms: true, adults: true, children: true, roomType: { select: { id: true, name: true } } } }, roomAssignments: { where: { unassignedAt: null }, select: { id: true, room: { select: { roomNumber: true, floor: true, wing: true, roomType: { select: { name: true } } } } } } } });
    if (!row || row.hotelId !== user.staffHotelId) throw new NotFoundException('Operational stay not found');
    if (row.stayStatus !== StayStatus.CHECKED_IN) throw new NotFoundException('Operational stay not found');
    return { user, row };
  }

  async getStay(userId: string, reference: string) {
    const { user, row } = await this.staffStay(userId, reference);
    return this.summarize(row, user.staffDepartment);
  }

  private staffFolio(folio: any) {
    return {
      reference: folio.reference,
      charges: folio.charges.map((charge: any) => ({ id: charge.id, category: charge.category, description: charge.description, quantity: charge.quantity, unitAmount: charge.unitAmount, totalAmount: charge.totalAmount, postingDate: charge.postingDate, note: charge.note, status: charge.status, postedBy: charge.postedBy?.name ?? 'RainWood staff', voidedAt: charge.voidedAt, voidedBy: charge.voidedBy?.name ?? null, voidReason: charge.voidReason, createdAt: charge.createdAt })),
      totals: { incidentalCharges: folio.totals.incidentalCharges, incidentalBalance: folio.totals.incidentalBalance, totalOutstanding: folio.totals.totalOutstanding },
    };
  }

  async getFolio(userId: string, reference: string) {
    await this.staffStay(userId, reference);
    const folio = await this.reservations.getFolio(reference);
    return this.staffFolio(folio);
  }

  async postCharge(userId: string, reference: string, body: StaffFolioChargeDto) {
    const { user } = await this.staffStay(userId, reference);
    const department = user.staffDepartment as StaffDepartment | null;
    const allowed = allowedStaffFolioCategories(department);
    if (!allowed.includes(body.category as FolioChargeCategory)) throw new ForbiddenException('Your department cannot post this folio category.');
    const postingDate = getHotelOperationalDate(user.staffHotel?.timezoneName ?? 'Asia/Kolkata');
    await this.reservations.postFolioCharge(reference, { category: body.category, description: body.description, quantity: body.quantity, unitAmount: body.unitAmount, note: body.note, postingDate: toDateOnly(postingDate) }, { id: user.id }, { allowedCategories: allowed, staffOnly: true, postingDate, idempotencyKey: body.idempotencyKey });
    return this.staffFolio(await this.reservations.getFolio(reference));
  }

  async reportFoundItem(userId: string, body: StaffFoundItemDto) { const user = await this.profile(userId); if (!user.staffHotelId || !this.guestServices) throw new ForbiddenException('Staff hotel is required.'); return this.guestServices.reportLost(userId, { ...body, hotelId: user.staffHotelId, type: body.type }); }
}

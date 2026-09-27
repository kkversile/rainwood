import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { FolioChargeCategory, StaffDepartment, StayStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { todayUtc, toDateOnly } from '../../common/dates';
import { ReservationsService } from '../reservations/reservations.service';
import { StaffFolioChargeDto, StaffStaysQueryDto } from './staff.dto';
import { allowedStaffFolioCategories } from './staff-rules';

@Injectable()
export class StaffService {
  constructor(private p: PrismaService, private reservations: ReservationsService) {}

  private async profile(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { id: true, name: true, role: true, active: true, staffDepartment: true, jobTitle: true, staffHotelId: true, staffHotel: { select: { id: true, name: true, active: true } } } });
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

  private summarize(row: any) {
    const roomTypes = [...new Map(row.lines.map((line: any) => [line.roomType.id, line.roomType.name])).values()];
    const rooms = row.lines.reduce((sum: number, line: any) => sum + line.rooms, 0);
    const adults = row.lines.reduce((sum: number, line: any) => sum + line.adults, 0);
    const children = row.lines.reduce((sum: number, line: any) => sum + line.children, 0);
    return { reference: row.reference, guestName: row.guestName, checkIn: row.checkIn, checkOut: row.checkOut, status: row.status, stayStatus: row.stayStatus, rooms, roomTypes, adults, children, pax: adults + children, hotel: row.hotel, assignedRooms: (row.roomAssignments ?? []).map((assignment: any) => ({ id: assignment.id, roomNumber: assignment.room.roomNumber, floor: assignment.room.floor, wing: assignment.room.wing, roomType: assignment.room.roomType?.name ?? null })) };
  }

  async getMe(userId: string) {
    const user = await this.profile(userId);
    const hotel = user.staffHotel!;
    return { id: user.id, name: user.name, role: user.role, department: user.staffDepartment, jobTitle: user.jobTitle, hotel: { id: hotel.id, name: hotel.name }, allowedCategories: allowedStaffFolioCategories(user.staffDepartment) };
  }

  async listStays(userId: string, query: StaffStaysQueryDto) {
    const user = await this.profile(userId);
    const rows = await this.p.reservation.findMany({ where: this.operationalWhere(user.staffHotelId!, query.q), orderBy: [{ checkIn: 'asc' }, { guestName: 'asc' }], select: { reference: true, guestName: true, checkIn: true, checkOut: true, status: true, stayStatus: true, hotel: { select: { id: true, name: true } }, lines: { select: { rooms: true, adults: true, children: true, roomType: { select: { id: true, name: true } } } }, roomAssignments: { where: { unassignedAt: null }, select: { id: true, room: { select: { roomNumber: true, floor: true, wing: true, roomType: { select: { name: true } } } } } } } });
    return rows.map((row) => this.summarize(row));
  }

  private async staffStay(userId: string, reference: string) {
    const user = await this.profile(userId);
    const row = await this.p.reservation.findUnique({ where: { reference }, select: { reference: true, guestName: true, checkIn: true, checkOut: true, status: true, stayStatus: true, hotelId: true, hotel: { select: { id: true, name: true } }, lines: { select: { rooms: true, adults: true, children: true, roomType: { select: { id: true, name: true } } } }, roomAssignments: { where: { unassignedAt: null }, select: { id: true, room: { select: { roomNumber: true, floor: true, wing: true, roomType: { select: { name: true } } } } } } } });
    if (!row || row.hotelId !== user.staffHotelId) throw new NotFoundException('Operational stay not found');
    if (row.stayStatus !== StayStatus.CHECKED_IN) throw new NotFoundException('Operational stay not found');
    return { user, row };
  }

  async getStay(userId: string, reference: string) {
    const { row } = await this.staffStay(userId, reference);
    return this.summarize(row);
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
    await this.reservations.postFolioCharge(reference, { category: body.category, description: body.description, quantity: body.quantity, unitAmount: body.unitAmount, note: body.note, postingDate: toDateOnly(todayUtc()) }, { id: user.id }, { allowedCategories: allowed, staffOnly: true, postingDate: todayUtc(), idempotencyKey: body.idempotencyKey });
    return this.staffFolio(await this.reservations.getFolio(reference));
  }
}

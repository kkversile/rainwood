import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SupplementaryChargeScope } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { parseDateOnly, toDateOnly } from '../../common/dates';
import { SupplementaryChargeDto, UpdateSupplementaryChargeDto } from './supplementary-charges.dto';

@Injectable()
export class SupplementaryChargesService {
  constructor(private p: PrismaService, private audit: AuditService) {}

  list(hotelId?: string) {
    return this.p.hotelSupplementaryCharge.findMany({ where: hotelId ? { hotelId } : undefined, include: { hotel: { select: { id: true, name: true, city: true } } }, orderBy: [{ active: 'desc' }, { startDate: 'asc' }, { name: 'asc' }] });
  }

  async create(hotelId: string, body: SupplementaryChargeDto, actorUserId: string) {
    const normalized = this.normalize({ ...body, scope: body.scope ?? SupplementaryChargeScope.AGENTS, active: body.active ?? true });
    await this.p.hotel.findUniqueOrThrow({ where: { id: hotelId } });
    const item = await this.p.hotelSupplementaryCharge.create({ data: { hotelId, ...normalized } });
    await this.audit.log({ actorUserId, action: 'SUPPLEMENTARY_CHARGE_CREATED', entityType: 'HotelSupplementaryCharge', entityId: item.id, after: { hotelId, name: item.name, startDate: item.startDate, endDate: item.endDate, amountPerRoomNight: item.amountPerRoomNight, scope: item.scope, active: item.active } });
    return item;
  }

  async update(id: string, body: UpdateSupplementaryChargeDto, actorUserId: string) {
    const current = await this.p.hotelSupplementaryCharge.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Supplementary charge not found');
    const normalized = this.normalize({
      name: body.name !== undefined ? body.name : current.name,
      startDate: body.startDate !== undefined ? body.startDate : toDateOnly(current.startDate),
      endDate: body.endDate !== undefined ? body.endDate : toDateOnly(current.endDate),
      amountPerRoomNight: body.amountPerRoomNight !== undefined ? body.amountPerRoomNight : Number(current.amountPerRoomNight),
      scope: body.scope !== undefined ? body.scope : current.scope,
      active: body.active !== undefined ? body.active : current.active,
    });
    const data: Prisma.HotelSupplementaryChargeUpdateInput = {};
    if (body.name !== undefined) data.name = normalized.name;
    if (body.startDate !== undefined) data.startDate = normalized.startDate;
    if (body.endDate !== undefined) data.endDate = normalized.endDate;
    if (body.amountPerRoomNight !== undefined) data.amountPerRoomNight = normalized.amountPerRoomNight;
    if (body.scope !== undefined) data.scope = normalized.scope;
    if (body.active !== undefined) data.active = normalized.active;
    const item = await this.p.hotelSupplementaryCharge.update({ where: { id }, data });
    await this.audit.log({ actorUserId, action: body.active === false ? 'SUPPLEMENTARY_CHARGE_DEACTIVATED' : 'SUPPLEMENTARY_CHARGE_UPDATED', entityType: 'HotelSupplementaryCharge', entityId: item.id, before: { name: current.name, active: current.active, amountPerRoomNight: current.amountPerRoomNight }, after: { name: item.name, active: item.active, amountPerRoomNight: item.amountPerRoomNight } });
    return item;
  }

  async deactivate(id: string, actorUserId: string) { return this.update(id, { active: false }, actorUserId); }

  async applicable(hotelId: string, from: Date, to: Date, scope: SupplementaryChargeScope) {
    return this.p.hotelSupplementaryCharge.findMany({ where: { hotelId, active: true, scope: { in: [scope, SupplementaryChargeScope.ALL] }, startDate: { lte: to }, endDate: { gte: from } }, orderBy: { name: 'asc' } });
  }

  private normalize(body: { name?: string; startDate: string; endDate: string; amountPerRoomNight: number; scope: SupplementaryChargeScope; active: boolean }) {
    const name = body.name?.trim() ?? '';
    if (name.length < 2) throw new BadRequestException('Supplementary charge name must be at least 2 characters');
    const startDate = parseDateOnly(body.startDate, 'supplementary charge start date');
    const endDate = parseDateOnly(body.endDate, 'supplementary charge end date');
    if (startDate > endDate) throw new BadRequestException('Supplementary charge start date cannot be after end date');
    if (!Number.isFinite(Number(body.amountPerRoomNight)) || Number(body.amountPerRoomNight) <= 0) throw new BadRequestException('Supplementary charge amount must be greater than zero');
    if (!Object.values(SupplementaryChargeScope).includes(body.scope)) throw new BadRequestException('Invalid supplementary charge scope');
    if (typeof body.active !== 'boolean') throw new BadRequestException('Supplementary charge active must be boolean');
    return { name, startDate, endDate, amountPerRoomNight: Number(body.amountPerRoomNight), scope: body.scope, active: body.active };
  }
}

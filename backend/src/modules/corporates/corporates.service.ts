import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CorporatePricingType, UserRole } from '@prisma/client';
import { AuditService } from '../../common/audit.service';
import { PrismaService } from '../../common/prisma.service';
import { assertActorCanManageHotel, getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { CorporateCreateDto, CorporateLinkHotelDto, CorporateListQueryDto, CorporateRateDto, CorporateRateUpdateDto, CorporateReceivableQueryDto } from './corporates.dto';
import { authoritativeReceivable } from '../reservations/settlement-totals';

const MANAGEMENT: UserRole[] = [UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN, UserRole.ADMIN];
const readRoles: UserRole[] = [...MANAGEMENT, UserRole.RESERVATION, UserRole.ACCOUNTS];
const amount = (value: unknown) => Number(value ?? 0);

@Injectable()
export class CorporatesService {
  constructor(private readonly p: PrismaService, private readonly audit: AuditService) {}
  private async scope(userId: string, write = false) { const scope = await getActorScope(this.p, userId); const roles = write ? MANAGEMENT : readRoles; if (!roles.includes(scope.role)) throw new ForbiddenException('Corporate account access is not available to this account.'); return scope; }
  private async accountForHotel(userId: string, accountId: string, hotelId: string) { const scope = await this.scope(userId); if (!scope.isGlobal && scope.hotelId !== hotelId) throw new ForbiddenException('You cannot access another hotel.'); const account = await this.p.corporateAccount.findUnique({ where: { id: accountId }, include: { hotels: { where: { hotelId, active: true }, include: { hotel: { select: { id: true, name: true } } } } } }); if (!account || account.active === false || !account.hotels.length) throw new NotFoundException('Corporate account is not linked to this hotel.'); return account; }

  private validateRateValues(input: { pricingType?: CorporatePricingType; fixedRate?: number | null; discountPercent?: number | null }) {
    if (input.pricingType === CorporatePricingType.FIXED) {
      if (input.fixedRate === undefined || input.fixedRate === null || input.fixedRate < 0) throw new BadRequestException('fixedRate is required and must be non-negative for a fixed agreement.');
      return { fixedRate: input.fixedRate, discountPercent: null };
    }
    if (input.pricingType === CorporatePricingType.DISCOUNT_PERCENT) {
      if (input.discountPercent === undefined || input.discountPercent === null || input.discountPercent < 0 || input.discountPercent > 100) throw new BadRequestException('discountPercent must be between 0 and 100 for a discount agreement.');
      return { fixedRate: null, discountPercent: input.discountPercent };
    }
    throw new BadRequestException('pricingType is required.');
  }

  private async assertNoOverlap(excludeId: string | undefined, input: { corporateAccountId: string; hotelId: string; roomTypeId: string; ratePlanId: string; validFrom: Date; validTo: Date; active: boolean }) {
    if (!input.active) return;
    const overlap = await this.p.corporateRateAgreement.findFirst({ where: { ...(excludeId ? { id: { not: excludeId } } : {}), corporateAccountId: input.corporateAccountId, hotelId: input.hotelId, roomTypeId: input.roomTypeId, ratePlanId: input.ratePlanId, active: true, validFrom: { lte: input.validTo }, validTo: { gte: input.validFrom } }, select: { id: true } });
    if (overlap) throw new ConflictException('An active corporate rate agreement overlaps this hotel, room type, rate plan, and date range.');
  }
  private view(row: any) { return { ...row, creditLimit: row.creditLimit === null ? null : amount(row.creditLimit), hotels: (row.hotels ?? []).map((link: any) => ({ ...link, creditLimitOverride: link.creditLimitOverride === null ? null : amount(link.creditLimitOverride), hotel: link.hotel })), rateAgreements: (row.rateAgreements ?? []).map((rate: any) => ({ ...rate, fixedRate: rate.fixedRate === null ? null : amount(rate.fixedRate), discountPercent: rate.discountPercent === null ? null : amount(rate.discountPercent) })) }; }
  async list(userId: string, query: CorporateListQueryDto) { const scope = await this.scope(userId); const hotelId = resolveRequestedHotel(scope, query.hotelId); const rows = await this.p.corporateAccount.findMany({ where: { active: query.active ?? undefined, name: query.search ? { contains: query.search, mode: 'insensitive' } : undefined, hotels: hotelId ? { some: { hotelId, active: true } } : undefined }, include: { hotels: { where: hotelId ? { hotelId } : undefined, include: { hotel: { select: { id: true, name: true } } } }, _count: { select: { reservations: true } } }, orderBy: { name: 'asc' } }); return rows.map((row) => this.view(row)); }
  async detail(userId: string, id: string) { const scope = await this.scope(userId); const row = await this.p.corporateAccount.findUnique({ where: { id }, include: { hotels: { where: scope.hotelId ? { hotelId: scope.hotelId } : undefined, include: { hotel: { select: { id: true, name: true } } } }, rateAgreements: { where: scope.hotelId ? { hotelId: scope.hotelId } : undefined, include: { hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } }, ratePlan: { select: { id: true, name: true } } } } } }); if (!row || (scope.hotelId && !row.hotels.length)) throw new NotFoundException('Corporate account not found.'); return this.view(row); }
  async create(userId: string, body: CorporateCreateDto) { await this.scope(userId, true); const row = await this.p.corporateAccount.create({ data: { ...body, name: body.name.trim(), legalName: body.legalName?.trim(), creditLimit: body.creditLimit, creditDays: body.creditDays } }); await this.audit.log({ actorUserId: userId, action: 'CORPORATE_ACCOUNT_CREATED', entityType: 'CorporateAccount', entityId: row.id, after: { name: row.name } }); return this.view(row); }
  async update(userId: string, id: string, body: CorporateCreateDto) { const scope = await this.scope(userId, true); const current = await this.p.corporateAccount.findUnique({ where: { id }, include: { hotels: true } }); if (!current || (scope.hotelId && !current.hotels.some((link) => link.hotelId === scope.hotelId))) throw new NotFoundException('Corporate account not found.'); const row = await this.p.corporateAccount.update({ where: { id }, data: { ...body, name: body.name?.trim(), creditLimit: body.creditLimit, creditDays: body.creditDays } }); await this.audit.log({ actorUserId: userId, action: 'CORPORATE_ACCOUNT_UPDATED', entityType: 'CorporateAccount', entityId: id, after: { fields: Object.keys(body) } }); return this.view(row); }
  async linkHotel(userId: string, accountId: string, body: CorporateLinkHotelDto) { const scope = await this.scope(userId, true); await assertActorCanManageHotel(this.p, userId, body.hotelId); const account = await this.p.corporateAccount.findUnique({ where: { id: accountId } }); if (!account) throw new NotFoundException('Corporate account not found.'); const row = await this.p.corporateAccountHotel.upsert({ where: { corporateAccountId_hotelId: { corporateAccountId: accountId, hotelId: body.hotelId } }, create: { corporateAccountId: accountId, hotelId: body.hotelId, accountCode: body.accountCode, creditLimitOverride: body.creditLimitOverride, creditDaysOverride: body.creditDaysOverride, active: body.active ?? true }, update: { accountCode: body.accountCode, creditLimitOverride: body.creditLimitOverride, creditDaysOverride: body.creditDaysOverride, active: body.active ?? true } }); await this.audit.log({ actorUserId: userId, action: 'CORPORATE_HOTEL_LINKED', entityType: 'CorporateAccountHotel', entityId: `${accountId}:${body.hotelId}`, after: { corporateAccountId: accountId, hotelId: body.hotelId, active: row.active } }); return row; }
  async createRate(userId: string, accountId: string, body: CorporateRateDto) {
    await this.accountForHotel(userId, accountId, body.hotelId);
    if (body.validTo < body.validFrom) throw new BadRequestException('validTo must be on or after validFrom.');
    const values = this.validateRateValues(body);
    const targets = await this.p.ratePlan.findFirst({ where: { id: body.ratePlanId, roomTypeId: body.roomTypeId, roomType: { hotelId: body.hotelId } }, select: { id: true } });
    if (!targets) throw new BadRequestException('Rate plan and room type do not belong to the selected hotel.');
    const active = body.active ?? true;
    await this.assertNoOverlap(undefined, { corporateAccountId: accountId, hotelId: body.hotelId, roomTypeId: body.roomTypeId, ratePlanId: body.ratePlanId, validFrom: new Date(body.validFrom), validTo: new Date(body.validTo), active });
    const row = await this.p.corporateRateAgreement.create({ data: { corporateAccountId: accountId, hotelId: body.hotelId, roomTypeId: body.roomTypeId, ratePlanId: body.ratePlanId, validFrom: new Date(body.validFrom), validTo: new Date(body.validTo), pricingType: body.pricingType, ...values, active }, include: { hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } }, ratePlan: { select: { id: true, name: true } } } });
    await this.audit.log({ actorUserId: userId, action: 'CORPORATE_RATE_CREATED', entityType: 'CorporateRateAgreement', entityId: row.id, after: { corporateAccountId: accountId, hotelId: body.hotelId, pricingType: body.pricingType } });
    return this.view(row);
  }

  async updateRate(userId: string, id: string, body: CorporateRateUpdateDto) {
    const current = await this.p.corporateRateAgreement.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Corporate rate agreement not found.');
    const hotelId = body.hotelId ?? current.hotelId;
    const roomTypeId = body.roomTypeId ?? current.roomTypeId;
    const ratePlanId = body.ratePlanId ?? current.ratePlanId;
    const validFrom = body.validFrom ? new Date(body.validFrom) : current.validFrom;
    const validTo = body.validTo ? new Date(body.validTo) : current.validTo;
    const pricingType = body.pricingType ?? current.pricingType;
    const fixedRate = body.fixedRate === undefined ? (current.fixedRate === null ? null : Number(current.fixedRate)) : body.fixedRate;
    const discountPercent = body.discountPercent === undefined ? (current.discountPercent === null ? null : Number(current.discountPercent)) : body.discountPercent;
    const active = body.active ?? current.active;
    if (validTo < validFrom) throw new BadRequestException('validTo must be on or after validFrom.');
    await this.accountForHotel(userId, current.corporateAccountId, hotelId);
    const values = this.validateRateValues({ pricingType, fixedRate, discountPercent });
    const targets = await this.p.ratePlan.findFirst({ where: { id: ratePlanId, roomTypeId, roomType: { hotelId } }, select: { id: true } });
    if (!targets) throw new BadRequestException('Rate plan and room type do not belong to the selected hotel.');
    await this.assertNoOverlap(id, { corporateAccountId: current.corporateAccountId, hotelId, roomTypeId, ratePlanId, validFrom, validTo, active });
    const row = await this.p.corporateRateAgreement.update({ where: { id }, data: { hotelId, roomTypeId, ratePlanId, validFrom, validTo, pricingType, ...values, active }, include: { hotel: { select: { id: true, name: true } }, roomType: { select: { id: true, name: true } }, ratePlan: { select: { id: true, name: true } } } });
    await this.audit.log({ actorUserId: userId, action: 'CORPORATE_RATE_UPDATED', entityType: 'CorporateRateAgreement', entityId: id, after: { fields: Object.keys(body) } });
    return this.view(row);
  }

  async receivables(userId: string, id: string, query: CorporateReceivableQueryDto = {}) {
    const scope = await this.scope(userId);
    const account = await this.p.corporateAccount.findUnique({ where: { id }, include: { hotels: { select: { hotelId: true } } } });
    if (!account || (scope.hotelId && !account.hotels.some((link) => link.hotelId === scope.hotelId))) throw new NotFoundException('Corporate account not found.');
    const rows = await this.p.reservation.findMany({ where: { corporateAccountId: id, hotelId: scope.hotelId ?? undefined }, include: { hotel: { select: { id: true, name: true } }, payments: { where: { verified: true }, select: { amount: true, verified: true } }, folioCharges: { where: { status: 'POSTED' }, select: { totalAmount: true } }, settlement: { select: { status: true, grossAmount: true, paidAmount: true, balanceAmount: true, settledAt: true, finalFolioNumber: true } } }, orderBy: { checkOut: 'desc' } });
    return rows.map((row) => ({ reference: row.reference, guestName: row.guestName, hotel: row.hotel, checkoutDate: row.checkOut, checkoutAt: row.checkedOutAt ?? null, ...authoritativeReceivable(row) })).filter((row) => !(query as any).onlyOutstanding || row.outstanding > 0.005);
  }
  async applyCorporateRate(userId: string, accountId: string, hotelId: string, roomTypeId: string, ratePlanId: string, stayDate: string, publicPrePromoRate: number) { await this.accountForHotel(userId, accountId, hotelId); const agreement = await this.p.corporateRateAgreement.findFirst({ where: { corporateAccountId: accountId, hotelId, roomTypeId, ratePlanId, active: true, validFrom: { lte: new Date(stayDate) }, validTo: { gte: new Date(stayDate) } } }); if (!agreement) return { agreement: null, resolvedRate: publicPrePromoRate, precedence: 'Public pre-promo rate' }; const resolvedRate = agreement.pricingType === CorporatePricingType.FIXED ? amount(agreement.fixedRate) : Number((publicPrePromoRate * (1 - amount(agreement.discountPercent) / 100)).toFixed(2)); return { agreement: { id: agreement.id, pricingType: agreement.pricingType }, resolvedRate, precedence: agreement.pricingType === CorporatePricingType.FIXED ? 'Corporate fixed rate overrides public Season/Yield rate; promotion eligibility remains explicit.' : 'Corporate discount applies to resolved public pre-promo rate; promotion eligibility remains explicit.' }; }
}

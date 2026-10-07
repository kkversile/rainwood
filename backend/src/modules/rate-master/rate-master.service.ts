import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assertActorCanManageHotel, getActorScope, resolveRequestedHotel } from '../../common/role-scope';
import { addDays, eachNight, parseDateOnly, toDateOnly } from '../../common/dates';
import { PrismaService } from '../../common/prisma.service';
import { AgentMappingDto, AgentMappingQueryDto, RateMasterQueryDto, RateMasterUpdateDto } from './rate-master.dto';
import { validateCategoryBandInput, validateNewB2cBaseRate } from './rate-master.validation';

type Db = PrismaService | Prisma.TransactionClient;
type Category = 'A' | 'B' | 'C' | 'D' | 'E';
const CANONICAL_MEAL_PLANS = ['EP', 'CP', 'MAP', 'AP'] as const;

const categoryField: Record<Category, string> = { A: 'categoryAAmount', B: 'categoryBAmount', C: 'categoryCAmount', D: 'categoryDAmount', E: 'categoryEAmount' };

function date(value: string, field: string) {
  return parseDateOnly(value, field);
}

function validBand(from: Date, to: Date) {
  if (from > to) throw new BadRequestException('validFrom must be on or before validTo.');
}

function overlaps(leftFrom: Date, leftTo: Date, rightFrom: Date, rightTo: Date) {
  return leftFrom <= rightTo && rightFrom <= leftTo;
}

function numberOr(value: unknown, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Injectable()
export class RateMasterService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: RateMasterQueryDto, actorId?: string) {
    const from = query.from ? date(query.from, 'from') : undefined;
    const to = query.to ? date(query.to, 'to') : undefined;
    if (from && to) validBand(from, to);
    const scopedHotelId = actorId ? resolveRequestedHotel(await getActorScope(this.prisma, actorId), query.hotelId) : query.hotelId;
    const rows = await (this.prisma as any).ratePlan.findMany({
      where: {
        active: query.status === 'inactive' ? false : true,
        roomTypeId: query.roomTypeId,
        roomType: scopedHotelId ? { hotelId: scopedHotelId } : undefined,
        master: { active: true, kind: 'CANONICAL_MEAL', mealPlan: query.mealPlan?.trim().toUpperCase() || { in: [...CANONICAL_MEAL_PLANS] } },
      },
      orderBy: [{ roomType: { hotelId: 'asc' } }, { roomType: { code: 'asc' } }, { mealPlan: 'asc' }],
      include: {
        roomType: { select: { id: true, code: true, name: true, hotelId: true, hotel: { select: { id: true, code: true, name: true } } } },
        master: { select: { id: true, code: true, name: true, mealPlan: true, kind: true } },
        agentCategoryBands: { where: { active: true, ...(from && to ? { validFrom: { lte: to }, validTo: { gte: from } } : {}) }, orderBy: [{ validFrom: 'asc' }] },
        rates: { where: from && to ? { date: { gte: from, lte: to } } : undefined, orderBy: { date: 'asc' } },
      },
    });
    const keys = Array.from(new Set(rows.map((row: any) => `${row.roomType.hotelId}:${String(row.mealPlan || row.master?.mealPlan).toUpperCase()}`))) as string[];
    const supplements = keys.length ? await (this.prisma as any).mealPlanGuestSupplementBand.findMany({
      where: { hotelId: { in: keys.map((key) => key.split(':')[0]) }, mealPlan: { in: keys.map((key) => key.split(':')[1]) }, active: true, ...(from && to ? { validFrom: { lte: to }, validTo: { gte: from } } : {}) },
      orderBy: [{ validFrom: 'asc' }],
    }) : [];
    return rows.map((row: any) => this.ratePlanView(row, supplements.filter((band: any) => band.hotelId === row.roomType.hotelId && String(band.mealPlan).toUpperCase() === String(row.mealPlan || row.master?.mealPlan).toUpperCase())));
  }

  async get(ratePlanId: string, query: RateMasterQueryDto = {}, actorId?: string) {
    const rows = await this.list({ ...query, status: query.status }, actorId);
    const row = rows.find((item: any) => item.id === ratePlanId);
    if (!row) throw new NotFoundException('Rate plan not found.');
    return row;
  }

  async update(ratePlanId: string, body: RateMasterUpdateDto, actorId: string) {
    const from = date(body.validFrom, 'validFrom');
    const to = date(body.validTo, 'validTo');
    validBand(from, to);
    const current = await (this.prisma as any).ratePlan.findUnique({ where: { id: ratePlanId }, include: { roomType: { select: { hotelId: true } }, master: true } });
    if (!current || !current.active || !current.master?.active) throw new NotFoundException('Rate plan not found.');
    await assertActorCanManageHotel(this.prisma, actorId, current.roomType.hotelId);
    const nights = eachNight(from, addDays(to, 1));
    const hasB2c = [body.single, body.double, body.triple, body.taxAmount, body.extraAdultAmount, body.childAmount].some((value) => value !== undefined);
    const hasCategory = [body.categoryAAmount, body.categoryBAmount, body.categoryCAmount, body.categoryDAmount, body.categoryEAmount].some((value) => value !== undefined);
    const hasSupplement = [body.supplementExtraAdultAmount, body.supplementChildWithBedAmount, body.supplementChildWithoutBedAmount].some((value) => value !== undefined);
    if (!hasB2c && !hasCategory && !hasSupplement) throw new BadRequestException('At least one rate, category, or supplement value is required.');
    const result = await this.prisma.$transaction(async (tx) => {
      const db = tx as any;
      // Serialise writes for the same rate plan so two admins cannot create
      // competing periods while each is checking overlap.
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `rate-master:${ratePlanId}`);
      const existingBands = await db.agentCategoryRateBand.findMany({ where: { ratePlanId, active: true } });
      if (hasCategory) {
        const conflicting = existingBands.find((band: any) => !(toDateOnly(band.validFrom) === toDateOnly(from) && toDateOnly(band.validTo) === toDateOnly(to)) && overlaps(new Date(band.validFrom), new Date(band.validTo), from, to));
        if (conflicting) throw new ConflictException('Overlapping active category rate periods must be resolved before saving.');
      }
      if (hasB2c) {
        const rateDays = new Map<string, any>((await db.rateDay.findMany({ where: { ratePlanId, date: { gte: from, lte: to } } })).map((row: any) => [toDateOnly(row.date), row]));
        const existingValues = [...rateDays.values()].map((row: any) => JSON.stringify({ amount: row.amount, baseAmount: row.baseAmount, taxAmount: row.taxAmount, extraAdultAmount: row.extraAdultAmount, childAmount: row.childAmount, occupancyPrices: row.occupancyPrices ?? null }));
        if (new Set(existingValues).size > 1) throw new ConflictException('MULTIPLE_PERIODS: select one uniform RateDay period before changing public rates.');
        for (const night of nights) {
          const key = toDateOnly(night);
          const existing = rateDays.get(key);
          validateNewB2cBaseRate(body.double, Boolean(existing));
          const prices = existing?.occupancyPrices && typeof existing.occupancyPrices === 'object' ? existing.occupancyPrices : {};
          const data: any = {
            amount: body.double ?? existing?.amount ?? body.single ?? 0,
            baseAmount: body.double ?? existing?.baseAmount ?? existing?.amount ?? body.single ?? 0,
            occupancyPrices: { ...prices, ...(body.single === undefined ? {} : { single: body.single }), ...(body.double === undefined ? {} : { double: body.double }), ...(body.triple === undefined ? {} : { triple: body.triple }) },
            taxAmount: body.taxAmount ?? existing?.taxAmount ?? 0,
            extraAdultAmount: body.extraAdultAmount ?? existing?.extraAdultAmount ?? 0,
            childAmount: body.childAmount ?? existing?.childAmount ?? 0,
          };
          if (existing) await db.rateDay.update({ where: { id: existing.id }, data });
          else await db.rateDay.create({ data: { ratePlanId, date: night, ...data } });
        }
      }
      let categoryBand: any = null;
      if (hasCategory) {
        const previous = existingBands.find((band: any) => toDateOnly(band.validFrom) === toDateOnly(from) && toDateOnly(band.validTo) === toDateOnly(to));
        const categoryInputs = [body.categoryAAmount, body.categoryBAmount, body.categoryCAmount, body.categoryDAmount, body.categoryEAmount];
        validateCategoryBandInput(categoryInputs, Boolean(previous));
        const data = {
          categoryAAmount: body.categoryAAmount ?? previous?.categoryAAmount ?? 0,
          categoryBAmount: body.categoryBAmount ?? previous?.categoryBAmount ?? 0,
          categoryCAmount: body.categoryCAmount ?? previous?.categoryCAmount ?? 0,
          categoryDAmount: body.categoryDAmount ?? previous?.categoryDAmount ?? 0,
          categoryEAmount: body.categoryEAmount ?? previous?.categoryEAmount ?? 0,
          active: body.active ?? true,
          updatedById: actorId,
        };
        categoryBand = previous ? await db.agentCategoryRateBand.update({ where: { id: previous.id }, data }) : await db.agentCategoryRateBand.create({ data: { ratePlanId, validFrom: from, validTo: to, createdById: actorId, ...data } });
        await db.auditLog.create({ data: { actorUserId: actorId, action: previous ? 'AGENT_CATEGORY_RATE_UPDATED' : 'AGENT_CATEGORY_RATE_CREATED', entityType: 'AgentCategoryRateBand', entityId: categoryBand.id, after: { ratePlanId, validFrom: toDateOnly(from), validTo: toDateOnly(to) } } });
      }
      if (hasSupplement) {
        const mealPlan = String(current.mealPlan || current.master.mealPlan).trim().toUpperCase();
        await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `rate-master-supplement:${current.roomType.hotelId}:${mealPlan}`);
        const overlapping = await db.mealPlanGuestSupplementBand.findMany({ where: { hotelId: current.roomType.hotelId, mealPlan, active: true, validFrom: { lte: to }, validTo: { gte: from } } });
        const conflict = overlapping.find((band: any) => !(toDateOnly(band.validFrom) === toDateOnly(from) && toDateOnly(band.validTo) === toDateOnly(to)));
        if (conflict) throw new ConflictException('Overlapping active guest supplement periods must be resolved before saving.');
        const previous = await db.mealPlanGuestSupplementBand.findUnique({ where: { hotelId_mealPlan_validFrom_validTo: { hotelId: current.roomType.hotelId, mealPlan, validFrom: from, validTo: to } } }).catch(() => null);
        const data = { extraAdultAmount: body.supplementExtraAdultAmount ?? previous?.extraAdultAmount ?? 0, childWithBedAmount: body.supplementChildWithBedAmount ?? previous?.childWithBedAmount ?? 0, childWithoutBedAmount: body.supplementChildWithoutBedAmount ?? previous?.childWithoutBedAmount ?? 0, active: body.active ?? true, updatedById: actorId };
        const saved = previous ? await db.mealPlanGuestSupplementBand.update({ where: { id: previous.id }, data }) : await db.mealPlanGuestSupplementBand.create({ data: { hotelId: current.roomType.hotelId, mealPlan, validFrom: from, validTo: to, createdById: actorId, ...data } });
        await db.auditLog.create({ data: { actorUserId: actorId, action: previous ? 'MEAL_PLAN_GUEST_SUPPLEMENT_UPDATED' : 'MEAL_PLAN_GUEST_SUPPLEMENT_CREATED', entityType: 'MealPlanGuestSupplementBand', entityId: saved.id, after: { hotelId: current.roomType.hotelId, mealPlan, validFrom: toDateOnly(from), validTo: toDateOnly(to) } } });
      }
      return categoryBand;
    });
    return this.get(ratePlanId, { from: body.validFrom, to: body.validTo }, actorId);
  }

  async mappings(agentId: string, query: AgentMappingQueryDto = {}, actorId?: string) {
    const from = query.from ? date(query.from, 'from') : undefined;
    const to = query.to ? date(query.to, 'to') : undefined;
    if (from && to) validBand(from, to);
    const rows = await (this.prisma as any).agentHotelRateCategoryAssignment.findMany({ where: { agentId, hotelId: query.hotelId, active: true, ...(from && to ? { validFrom: { lte: to }, validTo: { gte: from } } : {}) }, include: { hotel: { select: { id: true, code: true, name: true, city: true } } }, orderBy: [{ hotelId: 'asc' }, { validFrom: 'desc' }] });
    if (actorId) for (const row of rows) await assertActorCanManageHotel(this.prisma, actorId, row.hotelId);
    return rows;
  }

  async createMapping(agentId: string, body: AgentMappingDto, actorId: string) {
    const from = date(body.validFrom, 'validFrom'); const to = date(body.validTo, 'validTo'); validBand(from, to);
    await assertActorCanManageHotel(this.prisma, actorId, body.hotelId);
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `agent-category:${agentId}:${body.hotelId}`);
      const active = await tx.agentHotelRateCategoryAssignment.findMany({ where: { agentId, hotelId: body.hotelId, active: true } });
      if ((body.active ?? true) && active.some((item) => overlaps(new Date(item.validFrom), new Date(item.validTo), from, to))) throw new ConflictException('An active agent hotel category mapping overlaps this period.');
      return tx.agentHotelRateCategoryAssignment.create({ data: { agentId, hotelId: body.hotelId, category: body.category, validFrom: from, validTo: to, active: body.active ?? true, createdById: actorId, updatedById: actorId }, include: { hotel: true } });
    });
    await this.prisma.auditLog.create({ data: { actorUserId: actorId, action: 'AGENT_HOTEL_CATEGORY_ASSIGNED', entityType: 'AgentHotelRateCategoryAssignment', entityId: row.id, after: { agentId, hotelId: body.hotelId, category: body.category, validFrom: toDateOnly(from), validTo: toDateOnly(to) } } });
    return row;
  }

  async updateMapping(agentId: string, mappingId: string, body: Partial<AgentMappingDto>, actorId: string) {
    const db = this.prisma as any;
    const current = await db.agentHotelRateCategoryAssignment.findFirst({ where: { id: mappingId, agentId } });
    if (!current) throw new NotFoundException('Agent hotel category mapping not found.');
    const from = body.validFrom ? date(body.validFrom, 'validFrom') : new Date(current.validFrom); const to = body.validTo ? date(body.validTo, 'validTo') : new Date(current.validTo); validBand(from, to);
    const hotelId = body.hotelId ?? current.hotelId; await assertActorCanManageHotel(this.prisma, actorId, hotelId);
    const nextActive = body.active ?? current.active;
    const row = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtext($1))', `agent-category:${agentId}:${hotelId}`);
      if (nextActive) {
        const other = await tx.agentHotelRateCategoryAssignment.findMany({ where: { id: { not: mappingId }, agentId, hotelId, active: true } });
        if (other.some((item) => overlaps(new Date(item.validFrom), new Date(item.validTo), from, to))) throw new ConflictException('An active agent hotel category mapping overlaps this period.');
      }
      return tx.agentHotelRateCategoryAssignment.update({ where: { id: mappingId }, data: { hotelId, category: body.category ?? current.category, validFrom: from, validTo: to, active: nextActive, updatedById: actorId }, include: { hotel: true } });
    });
    await this.prisma.auditLog.create({ data: { actorUserId: actorId, action: 'AGENT_HOTEL_CATEGORY_CHANGED', entityType: 'AgentHotelRateCategoryAssignment', entityId: mappingId, after: { hotelId, category: row.category, validFrom: toDateOnly(from), validTo: toDateOnly(to) } } });
    return row;
  }

  async removeMapping(agentId: string, mappingId: string, actorId: string) {
    const db = this.prisma as any;
    const current = await db.agentHotelRateCategoryAssignment.findFirst({ where: { id: mappingId, agentId } });
    if (!current) throw new NotFoundException('Agent hotel category mapping not found.');
    await assertActorCanManageHotel(this.prisma, actorId, current.hotelId);
    const row = await db.agentHotelRateCategoryAssignment.update({ where: { id: mappingId }, data: { active: false, updatedById: actorId } });
    await this.prisma.auditLog.create({ data: { actorUserId: actorId, action: 'AGENT_HOTEL_CATEGORY_REMOVED', entityType: 'AgentHotelRateCategoryAssignment', entityId: mappingId, after: { agentId, hotelId: current.hotelId } } });
    return row;
  }

  async mappingRates(agentId: string, mappingId: string, query: AgentMappingQueryDto = {}, actorId?: string) {
    const db = this.prisma as any;
    const mapping = await db.agentHotelRateCategoryAssignment.findFirst({ where: { id: mappingId, agentId, active: true } });
    if (!mapping) throw new NotFoundException('Agent hotel category mapping not found.');
    if (actorId) await assertActorCanManageHotel(this.prisma, actorId, mapping.hotelId);
    const from = query.from ? date(query.from, 'from') : new Date(mapping.validFrom); const to = query.to ? date(query.to, 'to') : new Date(mapping.validTo); validBand(from, to);
    const supplements = await db.mealPlanGuestSupplementBand.findMany({ where: { hotelId: mapping.hotelId, active: true, validFrom: { lte: to }, validTo: { gte: from } }, orderBy: { validFrom: 'asc' } });
    const rows = await db.ratePlan.findMany({ where: { roomType: { hotelId: mapping.hotelId, active: true }, active: true, master: { active: true, kind: 'CANONICAL_MEAL', mealPlan: { in: [...CANONICAL_MEAL_PLANS] } } }, include: { roomType: { select: { code: true, name: true, hotel: { select: { id: true, name: true } } } }, master: { select: { mealPlan: true, name: true } }, agentCategoryBands: { where: { active: true, validFrom: { lte: to }, validTo: { gte: from } }, orderBy: { validFrom: 'asc' } } }, orderBy: [{ roomType: { code: 'asc' } }, { mealPlan: 'asc' }] });
    const results: any[] = [];
    for (const row of rows) {
      const mealPlan = String(row.master.mealPlan).toUpperCase();
      const planSupplements = supplements.filter((item: any) => String(item.mealPlan).toUpperCase() === mealPlan);
      const boundaries = new Set<string>([toDateOnly(from), toDateOnly(addDays(to, 1))]);
      for (const band of row.agentCategoryBands) { boundaries.add(toDateOnly(new Date(Math.max(new Date(band.validFrom).getTime(), from.getTime())))); boundaries.add(toDateOnly(addDays(new Date(Math.min(new Date(band.validTo).getTime(), to.getTime())), 1))); }
      for (const supplement of planSupplements) { boundaries.add(toDateOnly(new Date(Math.max(new Date(supplement.validFrom).getTime(), from.getTime())))); boundaries.add(toDateOnly(addDays(new Date(Math.min(new Date(supplement.validTo).getTime(), to.getTime())), 1))); }
      const ordered = [...boundaries].sort();
      for (let index = 0; index < ordered.length - 1; index += 1) {
        const segmentFrom = parseDateOnly(ordered[index], 'validFrom'); const segmentTo = addDays(parseDateOnly(ordered[index + 1], 'validTo'), -1);
        if (segmentFrom > segmentTo) continue;
        const band = row.agentCategoryBands.find((item: any) => new Date(item.validFrom) <= segmentFrom && new Date(item.validTo) >= segmentTo);
        if (!band) continue;
        const supplement = planSupplements.find((item: any) => new Date(item.validFrom) <= segmentFrom && new Date(item.validTo) >= segmentTo);
        results.push({ hotel: row.roomType.hotel, room: row.roomType, mealPlan, contractRate: Number(band[`category${mapping.category}Amount`]), extraAdultAmount: supplement ? Number(supplement.extraAdultAmount) : 0, childWithBedAmount: supplement ? Number(supplement.childWithBedAmount) : 0, childWithoutBedAmount: supplement ? Number(supplement.childWithoutBedAmount) : 0, category: mapping.category, validFrom: toDateOnly(segmentFrom), validTo: toDateOnly(segmentTo), categoryBandId: band.id, supplementBandId: supplement?.id ?? null });
      }
    }
    return results;
  }

  async effectiveRatesForAgent(agentId: string, from: Date, to: Date) {
    const db = this.prisma as any;
    const mappings = await db.agentHotelRateCategoryAssignment.findMany({ where: { agentId, active: true, validFrom: { lte: to }, validTo: { gte: from } }, include: { hotel: { select: { id: true, code: true, name: true, city: true } } }, orderBy: [{ hotelId: 'asc' }, { validFrom: 'desc' }] });
    if (!mappings.length) return null;
    const nights = eachNight(from, to);
    const results: any[] = [];
    const hotelIds = [...new Set(mappings.map((mapping: any) => mapping.hotelId))];
    for (const hotelId of hotelIds) {
      const hotelMappings = mappings.filter((mapping: any) => mapping.hotelId === hotelId);
      const assignmentByDate = new Map(nights.map((night) => [toDateOnly(night), hotelMappings.filter((mapping: any) => new Date(mapping.validFrom) <= night && new Date(mapping.validTo) >= night)]));
      if ([...assignmentByDate.values()].some((items: any[]) => items.length !== 1)) throw new BadRequestException('Contract rate is not available for all selected nights.');
      const supplements = await db.mealPlanGuestSupplementBand.findMany({ where: { hotelId, active: true, validFrom: { lte: to }, validTo: { gte: from } } });
      const plans = await db.ratePlan.findMany({ where: { active: true, master: { active: true, kind: 'CANONICAL_MEAL', mealPlan: { in: [...CANONICAL_MEAL_PLANS] } }, roomType: { active: true, hotelId } }, include: { roomType: { select: { id: true, code: true, name: true, hotel: { select: { id: true, code: true, name: true, city: true } } } }, rates: { where: { date: { gte: from, lt: to } }, orderBy: { date: 'asc' } }, agentCategoryBands: { where: { active: true, validFrom: { lte: to }, validTo: { gte: from } }, orderBy: { validFrom: 'asc' } } }, orderBy: [{ roomType: { name: 'asc' } }, { mealPlan: 'asc' }] });
      for (const plan of plans) {
        const resolvedRates = plan.rates.map((rate: any) => { const key = toDateOnly(rate.date); const assignment = assignmentByDate.get(key)?.[0]; const band = plan.agentCategoryBands.filter((item: any) => new Date(item.validFrom) <= new Date(rate.date) && new Date(item.validTo) >= new Date(rate.date)); const supplement = supplements.find((item: any) => String(item.mealPlan).toUpperCase() === String(plan.mealPlan).toUpperCase() && new Date(item.validFrom) <= new Date(rate.date) && new Date(item.validTo) >= new Date(rate.date)); if (!assignment || band.length !== 1) return null; return { date: rate.date, validFrom: rate.date, validTo: rate.date, amount: band[0][`category${assignment.category}Amount`], taxAmount: rate.taxAmount, taxRatePercent: Number(rate.baseAmount ?? rate.amount) > 0 ? Number((Number(rate.taxAmount) / Number(rate.baseAmount ?? rate.amount) * 100).toFixed(4)) : 0, taxPolicy: 'RATE_DAY_PERCENTAGE', extraAdultAmount: Number(supplement?.extraAdultAmount ?? 0), childAmount: Number(supplement?.childWithBedAmount ?? 0), extraChildWithBedAmount: Number(supplement?.childWithBedAmount ?? 0), childWithoutBedAmount: Number(supplement?.childWithoutBedAmount ?? 0), occupancyPrices: null, priceSource: 'AGENT_CATEGORY' }; }).filter(Boolean);
        if (resolvedRates.length !== nights.length) continue;
        results.push({ id: plan.id, code: plan.code, name: plan.name, mealPlan: plan.mealPlan, description: plan.description, hotel: plan.roomType.hotel, room: { id: plan.roomType.id, code: plan.roomType.code, name: plan.roomType.name }, contract: { source: 'AGENT_CATEGORY', code: 'Mapped rates', name: 'Assigned hotel rates', version: 1, validFrom: toDateOnly(from), validTo: toDateOnly(to) }, rates: resolvedRates });
      }
    }
    return { source: 'AGENT_CATEGORY', mappings: mappings.map((mapping: any) => ({ id: mapping.id, hotelId: mapping.hotelId, hotel: mapping.hotel, validFrom: toDateOnly(mapping.validFrom), validTo: toDateOnly(mapping.validTo) })), rates: results };
  }

  async categoryContext(agentId: string, hotelId: string, from: Date, to: Date, db: Db = this.prisma) {
    const client = db as any;
    const assignments = await client.agentHotelRateCategoryAssignment.findMany({ where: { agentId, hotelId, active: true, validFrom: { lte: to }, validTo: { gte: from } }, orderBy: [{ validFrom: 'asc' }, { createdAt: 'asc' }] });
    if (!assignments.length) return null;
    const nights = eachNight(from, to);
    const assignmentForNight = nights.map((night) => assignments.filter((row: any) => new Date(row.validFrom) <= night && new Date(row.validTo) >= night));
    const categoryByDate: Record<string, Category> = {};
    const assignmentByDate: Record<string, any> = {};
    for (let index = 0; index < nights.length; index += 1) { const rows = assignmentForNight[index]; if (rows.length === 1) { categoryByDate[toDateOnly(nights[index])] = rows[0].category; assignmentByDate[toDateOnly(nights[index])] = rows[0]; } }
    const category = assignmentForNight[0]?.[0]?.category as Category | undefined;
    const complete = nights.every((night) => Boolean(categoryByDate[toDateOnly(night)]));
    const overlapsFound = assignmentForNight.some((rows) => rows.length > 1);
    const bands = await client.agentCategoryRateBand.findMany({ where: { active: true, ratePlan: { roomType: { hotelId } }, validFrom: { lte: to }, validTo: { gte: from } } });
    const supplements = await client.mealPlanGuestSupplementBand.findMany({ where: { hotelId, active: true, validFrom: { lte: to }, validTo: { gte: from } } });
    return { agentId, hotelId, category: category ?? null, categoryByDate, assignmentByDate, assignments, bands, supplements, complete, coverageError: !complete || overlapsFound };
  }

  private ratePlanView(row: any, supplementBands: any[] = []) {
    const categoryBands = row.agentCategoryBands ?? [];
    const configuredPeriods = Array.from(new Map([...categoryBands, ...supplementBands].map((band: any) => {
      const key = `${toDateOnly(band.validFrom)}:${toDateOnly(band.validTo)}`;
      return [key, { validFrom: toDateOnly(band.validFrom), validTo: toDateOnly(band.validTo) }];
    })).values());
    const b2cPeriods: Array<{ validFrom: string; validTo: string; single: number | null; double: number | null; triple: number | null; taxAmount: number | null }> = [];
    const sortedRates = [...(row.rates ?? [])].sort((left: any, right: any) => new Date(left.date).getTime() - new Date(right.date).getTime());
    for (const rate of sortedRates) {
      const prices = rate.occupancyPrices && typeof rate.occupancyPrices === 'object' ? rate.occupancyPrices : {};
      const current = { validFrom: toDateOnly(rate.date), validTo: toDateOnly(rate.date), single: rateValue(prices.single), double: rateValue(prices.double ?? rate.baseAmount ?? rate.amount), triple: rateValue(prices.triple), taxAmount: rateValue(rate.taxAmount) };
      const previous = b2cPeriods[b2cPeriods.length - 1];
      if (previous && toDateOnly(addDays(new Date(previous.validTo), 1)) === current.validFrom && JSON.stringify({ single: previous.single, double: previous.double, triple: previous.triple, taxAmount: previous.taxAmount }) === JSON.stringify({ single: current.single, double: current.double, triple: current.triple, taxAmount: current.taxAmount })) previous.validTo = current.validTo;
      else b2cPeriods.push(current);
    }
    const periods = Array.from(new Map([...configuredPeriods, ...b2cPeriods.map((period) => ({ validFrom: period.validFrom, validTo: period.validTo }))].map((period: any) => [`${period.validFrom}:${period.validTo}`, period])).values());
    const multiplePeriods = b2cPeriods.length > 1 || configuredPeriods.length > 1;
    return { id: row.id, hotelId: row.roomType?.hotelId, active: Boolean(row.active), hotel: row.roomType?.hotel, roomType: row.roomType ? { id: row.roomType.id, code: row.roomType.code, name: row.roomType.name } : null, master: row.master, categoryBands, supplementBands, rates: row.rates ?? [], b2cPeriods, periodState: { code: multiplePeriods ? 'MULTIPLE_PERIODS' : 'UNIFORM', periods } };
  }
}

function rateValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

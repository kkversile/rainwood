import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, AgentRateSlabStatus, RatePlanMasterKind } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { assertActorCanManageHotel } from '../../common/role-scope';
import { parseDateOnly, toDateOnly } from '../../common/dates';
import { AgentRateSlabAssignmentDto, AgentRateSlabDto, AgentRateSlabRateDto } from './agent-rate-slabs.dto';
import { AgentRateSheetRenderer } from './agent-rate-sheet-renderer';

type Database = PrismaService | Prisma.TransactionClient;
type DateBand = { validFrom: Date; validTo: Date };

function band(from: string, to: string): DateBand {
  const validFrom = parseDateOnly(from, 'validFrom');
  const validTo = parseDateOnly(to, 'validTo');
  if (validFrom > validTo) throw new BadRequestException('validFrom must be on or before validTo.');
  return { validFrom, validTo };
}

function overlaps(left: DateBand, right: DateBand) {
  return left.validFrom <= right.validTo && right.validFrom <= left.validTo;
}

function jsonValue(value: unknown) {
  return value == null ? undefined : value as Prisma.InputJsonValue;
}

@Injectable()
export class AgentRateSlabsService {
  constructor(private readonly prisma: PrismaService, @Optional() private readonly audit?: AuditService, @Optional() private readonly renderer?: AgentRateSheetRenderer) {}

  private async auditEvent(actorUserId: string | undefined, action: string, entityType: string, entityId?: string, after?: unknown) {
    if (this.audit) await this.audit.log({ actorUserId, action, entityType, entityId, after });
  }

  private async assertActor(actorId: string, hotelId?: string) {
    if (hotelId) await assertActorCanManageHotel(this.prisma, actorId, hotelId);
  }

  private rateInclude() {
    return { ratePlan: { include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true, code: true, description: true, canonicalPath: true, amenities: { where: { active: true }, include: { amenity: { select: { name: true } } } } } } } } } } } as const;
  }

  async list(search?: string) {
    const query = search?.trim();
    const rows = await this.prisma.agentRateSlab.findMany({
      where: query ? { OR: [{ code: { contains: query, mode: 'insensitive' } }, { name: { contains: query, mode: 'insensitive' } }] } : undefined,
      orderBy: [{ active: 'desc' }, { code: 'asc' }, { version: 'desc' }],
      include: { _count: { select: { assignments: true, rates: true } } },
    });
    return rows.map((row) => ({ ...row, agentCount: row._count.assignments, rateCount: row._count.rates, _count: undefined }));
  }

  get(id: string) {
    return this.prisma.agentRateSlab.findUniqueOrThrow({ where: { id }, include: { rates: { include: this.rateInclude(), orderBy: [{ validFrom: 'asc' }, { ratePlan: { mealPlan: 'asc' } }] }, assignments: { include: { agent: { select: { id: true, name: true, email: true } } }, orderBy: { validFrom: 'asc' } } } });
  }

  async create(body: AgentRateSlabDto, actorId: string) {
    const dates = band(body.validFrom, body.validTo);
    await this.assertActor(actorId);
    const row = await this.prisma.agentRateSlab.create({ data: { code: body.code.trim().toUpperCase(), name: body.name.trim(), description: body.description?.trim() || null, ...dates, active: body.active ?? true, createdById: actorId, updatedById: actorId } });
    await this.auditEvent(actorId, 'AGENT_RATE_SLAB_CREATED', 'AgentRateSlab', row.id, { code: row.code, version: row.version });
    return row;
  }

  async update(id: string, body: Partial<AgentRateSlabDto>, actorId: string) {
    const existing = await this.prisma.agentRateSlab.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Agent rate slab not found.');
    if (existing.status === AgentRateSlabStatus.PUBLISHED) throw new ConflictException('Published slabs are immutable. Clone the slab to create a new version.');
    const dates = body.validFrom && body.validTo ? band(body.validFrom, body.validTo) : undefined;
    const row = await this.prisma.agentRateSlab.update({ where: { id }, data: { code: body.code?.trim().toUpperCase(), name: body.name?.trim(), description: body.description === undefined ? undefined : body.description.trim() || null, ...(dates ?? {}), active: body.active, updatedById: actorId } });
    await this.auditEvent(actorId, 'AGENT_RATE_SLAB_UPDATED', 'AgentRateSlab', row.id, { fields: Object.keys(body) });
    return row;
  }

  async clone(id: string, actorId: string) {
    const copy = await this.prisma.$transaction(async (tx) => {
      const source = await tx.agentRateSlab.findUnique({ where: { id }, include: { rates: true } });
      if (!source) throw new NotFoundException('Agent rate slab not found.');
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-rate-slab-clone:${source.code}`}, 0))`;
      const latest = await tx.agentRateSlab.findFirst({ where: { code: source.code }, orderBy: { version: 'desc' }, select: { version: true } });
      const nextVersion = (latest?.version ?? source.version) + 1;
      const copy = await tx.agentRateSlab.create({ data: { code: source.code, name: source.name, description: source.description, validFrom: source.validFrom, validTo: source.validTo, version: nextVersion, status: AgentRateSlabStatus.DRAFT, active: true, createdById: actorId, updatedById: actorId, rates: { create: source.rates.map((rate) => ({ ratePlanId: rate.ratePlanId, validFrom: rate.validFrom, validTo: rate.validTo, amount: rate.amount, extraAdultAmount: rate.extraAdultAmount, extraChildWithBedAmount: rate.extraChildWithBedAmount, childWithoutBedAmount: rate.childWithoutBedAmount, occupancyPrices: rate.occupancyPrices ?? undefined, active: rate.active })) } } });
      return copy;
    });
    await this.auditEvent(actorId, 'AGENT_RATE_SLAB_CLONED', 'AgentRateSlab', copy.id, { sourceId: id, code: copy.code, version: copy.version });
    return copy;
  }

  async replaceRates(slabId: string, inputs: AgentRateSlabRateDto[], actorId?: string) {
    const slab = await this.prisma.agentRateSlab.findUnique({ where: { id: slabId } });
    if (!slab) throw new NotFoundException('Agent rate slab not found.');
    if (slab.status === AgentRateSlabStatus.PUBLISHED) throw new ConflictException('Published slabs are immutable. Clone the slab before changing rates.');
    const plans = await this.prisma.ratePlan.findMany({ where: { id: { in: inputs.map((item) => item.ratePlanId) }, active: true, master: { active: true } }, include: { roomType: true, master: true } });
    if (plans.length !== new Set(inputs.map((item) => item.ratePlanId)).size) throw new BadRequestException('Every selected rate plan must be active and valid.');
    if (plans.some((plan) => plan.master.kind !== RatePlanMasterKind.CANONICAL_MEAL)) throw new BadRequestException('Agent slabs can only use canonical meal plans (EP, CP, MAP, AP).');
    const parsed = inputs.map((item) => ({ item, dates: band(item.validFrom, item.validTo) }));
    for (const current of parsed) {
      if (current.dates.validFrom < slab.validFrom || current.dates.validTo > slab.validTo) throw new BadRequestException('Slab rates must stay within the slab validity.');
      for (const other of parsed) if (current !== other && current.item.ratePlanId === other.item.ratePlanId && overlaps(current.dates, other.dates)) throw new ConflictException('An Agent slab rate already covers part of this date range.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.agentRateSlabRate.deleteMany({ where: { slabId } });
      if (parsed.length) await tx.agentRateSlabRate.createMany({ data: parsed.map(({ item, dates }) => ({ slabId, ratePlanId: item.ratePlanId, ...dates, amount: item.amount, extraAdultAmount: item.extraAdultAmount ?? 0, extraChildWithBedAmount: item.extraChildWithBedAmount ?? 0, childWithoutBedAmount: item.childWithoutBedAmount ?? 0, occupancyPrices: jsonValue(item.occupancyPrices), active: item.active ?? true })) });
      return tx.agentRateSlab.findUniqueOrThrow({ where: { id: slabId }, include: { rates: { include: this.rateInclude() } } });
    });
    await this.auditEvent(actorId, 'AGENT_RATE_SLAB_RATES_UPDATED', 'AgentRateSlab', slabId, { rateCount: parsed.length });
    return result;
  }

  async publish(id: string, actorId: string) {
    const slab = await this.prisma.agentRateSlab.findUnique({ where: { id }, include: { rates: true } });
    if (!slab) throw new NotFoundException('Agent rate slab not found.');
    if (!slab.rates.length) throw new BadRequestException('Add at least one slab rate before publishing.');
    const result = await this.prisma.agentRateSlab.update({ where: { id }, data: { status: AgentRateSlabStatus.PUBLISHED, active: true, updatedById: actorId } });
    await this.auditEvent(actorId, 'AGENT_RATE_SLAB_PUBLISHED', 'AgentRateSlab', id, { version: result.version });
    return result;
  }

  async assign(agentId: string, body: AgentRateSlabAssignmentDto, actorId: string) {
    const dates = band(body.validFrom, body.validTo);
    const [agent, slab] = await Promise.all([this.prisma.user.findFirst({ where: { id: agentId, role: 'AGENT' }, select: { id: true } }), this.prisma.agentRateSlab.findUnique({ where: { id: body.slabId } })]);
    if (!agent) throw new NotFoundException('Agent not found.');
    if (!slab || !slab.active || slab.status !== AgentRateSlabStatus.PUBLISHED) throw new BadRequestException('Only an active published slab can be assigned.');
    if (dates.validFrom < slab.validFrom || dates.validTo > slab.validTo) throw new BadRequestException('The assignment must stay within the slab validity.');
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-rate-assignment:${agentId}`}, 0))`;
      const conflict = await tx.agentRateSlabAssignment.findFirst({ where: { agentId, active: true, validFrom: { lte: dates.validTo }, validTo: { gte: dates.validFrom } } });
      if (conflict) throw new ConflictException('This agent already has an overlapping active rate slab assignment.');
      return tx.agentRateSlabAssignment.create({ data: { agentId, slabId: body.slabId, ...dates, active: body.active ?? true, createdById: actorId }, include: { slab: true, agent: { select: { id: true, name: true, email: true } } } });
    });
    await this.auditEvent(actorId, 'AGENT_SLAB_ASSIGNED', 'AgentRateSlabAssignment', result.id, { agentId, slabId: body.slabId, validFrom: dates.validFrom, validTo: dates.validTo });
    return result;
  }

  async removeAssignment(agentId: string, assignmentId: string, actorId: string) {
    const assignment = await this.prisma.agentRateSlabAssignment.findFirst({ where: { id: assignmentId, agentId } });
    if (!assignment) throw new NotFoundException('Agent rate slab assignment not found.');
    const result = await this.prisma.agentRateSlabAssignment.update({ where: { id: assignmentId }, data: { active: false } });
    await this.auditEvent(actorId, 'AGENT_SLAB_ASSIGNMENT_REMOVED', 'AgentRateSlabAssignment', assignmentId, { agentId });
    return result;
  }

  assignmentsForAgent(agentId: string) {
    return this.prisma.agentRateSlabAssignment.findMany({ where: { agentId }, orderBy: { validFrom: 'desc' }, include: { slab: { select: { id: true, code: true, name: true, version: true, status: true } } } });
  }

  async context(agentId: string, from: Date, to: Date, db: Database = this.prisma) {
    const assignment = await db.agentRateSlabAssignment.findFirst({ where: { agentId, active: true, validFrom: { lte: to }, validTo: { gte: from }, slab: { active: true, status: AgentRateSlabStatus.PUBLISHED } }, orderBy: [{ validFrom: 'desc' }, { createdAt: 'desc' }], include: { slab: true } });
    if (!assignment) return null;
    const rates = await db.agentRateSlabRate.findMany({ where: { slabId: assignment.slabId, active: true, validFrom: { lte: to }, validTo: { gte: from } } });
    return { assignment, rates, fullAssignmentCoverage: assignment.validFrom <= from && assignment.validTo >= to };
  }

  async effectiveRates(agentId: string, from?: string, to?: string) {
    const start = parseDateOnly(from ?? toDateOnly(new Date()), 'from');
    const end = parseDateOnly(to ?? toDateOnly(new Date(Date.now() + 180 * 86_400_000)), 'to');
    const context = await this.context(agentId, start, end);
    if (!context) return { source: 'LEGACY_AGENT_RATE_PLAN', rates: [] };
    if (!context.fullAssignmentCoverage) throw new BadRequestException('Contract rate is not available for all selected nights.');
    const rows = await this.prisma.agentRateSlabRate.findMany({ where: { slabId: context.assignment.slabId, active: true, validFrom: { lte: end }, validTo: { gte: start } }, include: this.rateInclude() });
    return { source: 'AGENT_SLAB', slab: context.assignment.slab, rates: rows };
  }

  private async snapshot(agentId: string, slabId: string, unassignedPreview = false) {
    const [agent, slab] = await Promise.all([this.prisma.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true, name: true, email: true, companyName: true } }), this.prisma.agentRateSlab.findUniqueOrThrow({ where: { id: slabId }, include: { rates: { where: { active: true }, include: this.rateInclude(), orderBy: [{ ratePlan: { roomType: { hotel: { name: 'asc' } } } }, { ratePlan: { roomType: { name: 'asc' } } }, { ratePlan: { mealPlan: 'asc' } }] } } })]);
    const hotels = new Map<string, any>();
    for (const rate of slab.rates) {
      const hotel = rate.ratePlan.roomType.hotel;
      const room = rate.ratePlan.roomType;
      const entry = hotels.get(hotel.id) ?? { hotel, rooms: new Map<string, any>() };
      const roomEntry = entry.rooms.get(room.id) ?? { room, rates: [] };
      roomEntry.rates.push({ id: rate.id, mealPlan: rate.ratePlan.mealPlan, code: rate.ratePlan.master.code, name: rate.ratePlan.master.name, ratePlanId: rate.ratePlanId, validFrom: toDateOnly(rate.validFrom), validTo: toDateOnly(rate.validTo), amount: Number(rate.amount), extraAdultAmount: Number(rate.extraAdultAmount), extraChildWithBedAmount: Number(rate.extraChildWithBedAmount), childWithoutBedAmount: Number(rate.childWithoutBedAmount), occupancyPrices: rate.occupancyPrices ?? null });
      entry.rooms.set(room.id, roomEntry); hotels.set(hotel.id, entry);
    }
    const resultHotels = [];
    for (const entry of hotels.values()) {
      const hotel = entry.hotel;
      const [supplements, policy, banks] = await Promise.all([
        this.prisma.hotelSupplementaryCharge.findMany({ where: { hotelId: hotel.id, active: true, scope: { in: ['AGENTS', 'ALL'] }, startDate: { lte: slab.validTo }, endDate: { gte: slab.validFrom } }, orderBy: { startDate: 'asc' } }),
        this.prisma.hotelPolicy.findUnique({ where: { hotelId: hotel.id }, select: { houseRules: true, termsAndConditions: true, cancellationRules: true } }),
        this.prisma.hotelBankAccount.findMany({ where: { hotelId: hotel.id, active: true, displayOnAgentRateSheet: true }, orderBy: { createdAt: 'asc' } }),
      ]);
      const mealInclusions = ['EP — Room only', 'CP — Breakfast included', 'MAP — Breakfast + Dinner', 'AP — Breakfast + Lunch + Dinner'];
      const configuredAmenities = (hotel.amenities ?? []).map((item: any) => item.amenity?.name).filter(Boolean);
      const inclusions = [mealInclusions.join('; '), configuredAmenities.length ? `Configured property amenities: ${configuredAmenities.join(', ')}` : null].filter(Boolean).join('. ');
      resultHotels.push({ id: hotel.id, code: hotel.code, name: hotel.name, city: hotel.city, description: hotel.description, canonicalLink: hotel.canonicalPath ? `${process.env.PUBLIC_SITE_URL ?? ''}${hotel.canonicalPath}` : null, rooms: [...entry.rooms.values()].map((roomEntry: any) => ({ id: roomEntry.room.id, code: roomEntry.room.code, name: roomEntry.room.name, rates: roomEntry.rates })), supplements: supplements.map((item) => ({ id: item.id, name: item.name, startDate: toDateOnly(item.startDate), endDate: toDateOnly(item.endDate), amountPerRoomNight: Number(item.amountPerRoomNight), scope: item.scope })), inclusions, guidelines: policy?.houseRules ?? 'Subject to property availability and the published booking terms.', terms: policy?.termsAndConditions ?? null, bankAccounts: banks.map((bank) => ({ accountName: bank.accountName, bankName: bank.bankName, branch: bank.branch, accountNumber: bank.accountNumber, ifsc: bank.ifsc, accountType: bank.accountType })) });
    }
    return { agent, slab: { id: slab.id, code: slab.code, name: slab.name, version: slab.version, validFrom: toDateOnly(slab.validFrom), validTo: toDateOnly(slab.validTo) }, unassignedPreview, hotels: resultHotels };
  }

  async previewSheet(agentId: string, slabId: string) {
    const slab = await this.prisma.agentRateSlab.findUniqueOrThrow({ where: { id: slabId }, select: { validFrom: true, validTo: true } });
    const assignment = await this.prisma.agentRateSlabAssignment.findFirst({ where: { agentId, slabId, active: true, validFrom: { lte: slab.validTo }, validTo: { gte: slab.validFrom } } });
    const fullCoverage = Boolean(assignment && assignment.validFrom <= slab.validFrom && assignment.validTo >= slab.validTo);
    const previewState = fullCoverage ? 'ASSIGNED_CONTRACT_PREVIEW' : assignment ? 'PARTIAL_ASSIGNMENT_PREVIEW' : 'UNASSIGNED_PREVIEW';
    const snapshot = await this.snapshot(agentId, slabId, !fullCoverage);
    const stateSnapshot = { ...snapshot, previewState };
    return { source: 'AGENT_RATE_SLAB', previewState, unassignedPreview: !fullCoverage, snapshot: stateSnapshot, html: this.renderer?.render(stateSnapshot) ?? '' };
  }

  async publishSheet(agentId: string, slabId: string, actorId: string) {
    const slab = await this.prisma.agentRateSlab.findUnique({ where: { id: slabId } });
    if (!slab || slab.status !== AgentRateSlabStatus.PUBLISHED) throw new BadRequestException('Publish the slab before publishing a rate sheet.');
    const assignment = await this.prisma.agentRateSlabAssignment.findFirst({ where: { agentId, slabId, active: true, validFrom: { lte: slab.validFrom }, validTo: { gte: slab.validTo } } });
    if (!assignment) throw new BadRequestException('Published agent rate sheets require an active matching assignment.');
    const snapshot = await this.snapshot(agentId, slabId);
    const sheet = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`agent-rate-sheet:${agentId}:${slabId}`}, 0))`;
      const latest = await tx.agentRateSheet.findFirst({ where: { agentId, slabId }, orderBy: { version: 'desc' }, select: { version: true } });
      return tx.agentRateSheet.create({ data: { agentId, slabId, version: (latest?.version ?? 0) + 1, snapshotJson: snapshot as Prisma.InputJsonValue, publishedById: actorId } });
    });
    await this.auditEvent(actorId, 'AGENT_RATE_SHEET_PUBLISHED', 'AgentRateSheet', sheet.id, { agentId, slabId, version: sheet.version });
    return sheet;
  }

  sheets(agentId: string) { return this.prisma.agentRateSheet.findMany({ where: { agentId }, orderBy: [{ publishedAt: 'desc' }, { version: 'desc' }] }); }

  async downloadSheet(agentId: string, sheetId: string) {
    const sheet = await this.prisma.agentRateSheet.findFirst({ where: { id: sheetId, agentId } });
    if (!sheet) throw new NotFoundException('Agent rate sheet not found.');
    const html = this.renderer?.render(sheet.snapshotJson) ?? '';
    await this.auditEvent(undefined, 'AGENT_RATE_SHEET_DOWNLOADED', 'AgentRateSheet', sheet.id, { agentId, version: sheet.version });
    return { html, filename: `rainwood-${agentId}-rate-sheet-v${sheet.version}.html` };
  }
}

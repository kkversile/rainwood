import { BadRequestException, Body, Controller, Delete, Get, GoneException, Header, Optional, Param, Patch, Post, Put, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsArray, IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AgentPaymentMilestonesDto, AgentRateBatchDto, AgentRatePlanUpdateDto, PaymentMilestoneDto } from './users.dto';
import { normalizeOccupancyPrices } from '../../common/rate-pricing';
import { parseDateOnly } from '../../common/dates';
import { AgentsService } from '../agents/agents.service';
import { AgentDocumentStatus, AgentPaymentPolicy } from '@prisma/client';
import { legacyPaymentMilestones, paymentMilestonesForAgent, validateAgentPaymentTerms, validatePaymentMilestones } from '../../common/agent-payment-terms';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsEnum(['SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'HOUSEKEEPING', 'VIEWER', 'AGENT']) role?: string;
  @IsString() @MinLength(12) password!: string;
  @IsOptional() @IsEnum(AgentPaymentPolicy) agentPaymentPolicy?: AgentPaymentPolicy;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) bookingPaymentPercent?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentMilestoneDto) paymentMilestones?: PaymentMilestoneDto[];
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEnum(['SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'HOUSEKEEPING', 'VIEWER', 'AGENT']) role?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() revokeSessions?: boolean;
}

class AgentRatePlanMappingDto {
  @IsOptional() @IsArray() @IsString({ each: true }) ratePlanIds?: string[];
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsString() masterId?: string;
}

class AgentHotelRatePlanDto {
  @IsString() hotelId!: string;
  @IsString() masterId!: string;
}

class AgentApprovalDto {
  @IsBoolean() active!: boolean;
  @IsOptional() @IsEnum(AgentPaymentPolicy) paymentPolicy?: AgentPaymentPolicy;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) bookingPaymentPercent?: number;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => PaymentMilestoneDto) paymentMilestones?: PaymentMilestoneDto[];
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class UsersController {
  constructor(private p: PrismaService, @Optional() private agentsService?: AgentsService) {}
  @Get('') list() { return this.p.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true, createdAt: true } }); }
  @Get('agents') agents() { return this.p.user.findMany({ where: { role: 'AGENT' }, select: { id: true, email: true, name: true, companyName: true, contactPerson: true, mobile: true, gstin: true, place: true, addressLine1: true, addressLine2: true, state: true, pinCode: true, additionalInformation: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, createdAt: true, agentDocuments: { select: { status: true } }, paymentMilestones: { orderBy: { sortOrder: 'asc' } }, assignedRatePlans: { include: { ratePlan: { include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } }, orderBy: { createdAt: 'asc' } }); }
  @Get('agents/rate-import-template.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="rainwood-agent-rate-template.xlsx"')
  async agentRateTemplate() {
    throw new GoneException('Agent rate Excel import is no longer supported. Import rates into the Hotel Rate Plan.');
  }
  @Post('agents/rates/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importAgentRates(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: any) {
    throw new GoneException('Agent rate Excel import is no longer supported. Import rates into the Hotel Rate Plan.');
  }
  @Get('agents/:agentId') agent(@Param('agentId') agentId: string) { return this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true, email: true, name: true, companyName: true, contactPerson: true, mobile: true, gstin: true, place: true, addressLine1: true, addressLine2: true, state: true, pinCode: true, additionalInformation: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, createdAt: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } }, agentDocuments: { include: { file: { select: { originalName: true, mimeType: true, size: true } } }, orderBy: { createdAt: 'desc' } }, assignedRatePlans: { include: { ratePlan: { include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } } }); }
  @Post('') async create(@Body() d: CreateUserDto) { return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, role: (d.role || 'RESERVATION') as any, passwordHash: await bcrypt.hash(d.password, 12), active: true }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Post('agents') async createAgent(@Body() d: CreateUserDto) {
    const milestones = d.paymentMilestones?.length ? validatePaymentMilestones(d.paymentMilestones) : paymentMilestonesForAgent({ agentPaymentPolicy: d.agentPaymentPolicy, bookingPaymentPercent: d.bookingPaymentPercent });
    const legacy = d.paymentMilestones?.length ? { policy: null, percentage: null } : validateAgentPaymentTerms({ agentPaymentPolicy: d.agentPaymentPolicy, bookingPaymentPercent: d.bookingPaymentPercent }, true);
    return this.p.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email: d.email.toLowerCase(), name: d.name, passwordHash: await bcrypt.hash(d.password, 12), role: 'AGENT', active: true, agentPaymentPolicy: legacy.policy as any, bookingPaymentPercent: legacy.percentage, paymentMilestones: { create: milestones.map((item) => ({ percentage: item.percentage, dueType: item.dueType, daysBeforeCheckIn: item.daysBeforeCheckIn, sortOrder: item.sortOrder })) } }, select: { id: true, email: true, name: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } } } });
      return user;
    });
  }
  @Patch(':id') update(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.p.user.update({ where: { id }, data: { name: d.name, role: d.role as any, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Patch('agents/:id') async updateAgent(@Param('id') id: string, @Body() d: UpdateUserDto) {
    const current = await this.p.user.findFirstOrThrow({ where: { id, role: 'AGENT' }, include: { paymentMilestones: { orderBy: { sortOrder: 'asc' } } } });
    if (d.active === true && !current.paymentMilestones?.length && !current.agentPaymentPolicy) throw new BadRequestException('Assign payment milestones before activating this agent');
    return this.p.user.update({ where: { id, role: 'AGENT' }, data: { name: d.name, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true } });
  }
  @Patch('agents/:agentId/approval') async approveAgent(@Param('agentId') agentId: string, @Body() body: AgentApprovalDto, @CurrentUser() actor: any) {
    const current = await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, include: { paymentMilestones: { orderBy: { sortOrder: 'asc' } } } });
    const existingMilestones = current.paymentMilestones ?? [];
    const hasNewMilestones = body.paymentMilestones !== undefined;
    const hasLegacyBodyTerms = body.paymentPolicy !== undefined || body.bookingPaymentPercent !== undefined;
    const milestones = hasNewMilestones
      ? validatePaymentMilestones(body.paymentMilestones)
      : hasLegacyBodyTerms
        ? paymentMilestonesForAgent({ agentPaymentPolicy: body.paymentPolicy, bookingPaymentPercent: body.bookingPaymentPercent })
      : existingMilestones.length
        ? validatePaymentMilestones(existingMilestones.map((item) => ({ percentage: Number(item.percentage), dueType: item.dueType, daysBeforeCheckIn: item.daysBeforeCheckIn, sortOrder: item.sortOrder })))
        : current.agentPaymentPolicy
          ? paymentMilestonesForAgent(current)
          : null;
    if (body.active && !current.active && !existingMilestones.length && !current.agentPaymentPolicy && current.bookingPaymentPercent == null) {
      const documents = await this.p.agentDocument.findMany({ where: { agentId: current.id }, select: { status: true } });
      if (!documents.length || documents.some((document) => document.status !== AgentDocumentStatus.APPROVED)) throw new BadRequestException('Complete and verify the required KYC documents before approving this agent.');
    }
    if (body.active && !milestones) throw new BadRequestException('Payment milestones are required before approval');
    const updated = await this.p.$transaction(async (tx) => {
      if (milestones && (hasNewMilestones || hasLegacyBodyTerms || !existingMilestones.length)) {
        await tx.agentPaymentMilestone.deleteMany({ where: { agentId: current.id } });
        await tx.agentPaymentMilestone.createMany({ data: milestones.map((item) => ({ agentId: current.id, percentage: item.percentage, dueType: item.dueType, daysBeforeCheckIn: item.daysBeforeCheckIn, sortOrder: item.sortOrder })) });
      }
      const legacyTerms = body.paymentPolicy !== undefined || body.bookingPaymentPercent !== undefined ? validateAgentPaymentTerms({ agentPaymentPolicy: body.paymentPolicy, bookingPaymentPercent: body.bookingPaymentPercent }) : null;
      const legacy = hasNewMilestones ? { agentPaymentPolicy: null, bookingPaymentPercent: null } : legacyTerms ? { agentPaymentPolicy: legacyTerms.policy as any, bookingPaymentPercent: legacyTerms.percentage } : { agentPaymentPolicy: current.agentPaymentPolicy, bookingPaymentPercent: current.bookingPaymentPercent };
      const result = await tx.user.update({ where: { id: current.id }, data: { active: body.active, agentPaymentPolicy: legacy.agentPaymentPolicy, bookingPaymentPercent: legacy.bookingPaymentPercent, tokenVersion: body.active === false ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } } } });
      await tx.auditLog.create({ data: { actorUserId: actor.id, action: current.active === false && body.active ? 'AGENT_APPROVED' : 'AGENT_PAYMENT_TERMS_UPDATED', entityType: 'User', entityId: current.id, before: { active: current.active, agentPaymentPolicy: current.agentPaymentPolicy, bookingPaymentPercent: current.bookingPaymentPercent, paymentMilestones: existingMilestones }, after: { active: result.active, agentPaymentPolicy: result.agentPaymentPolicy, bookingPaymentPercent: result.bookingPaymentPercent, paymentMilestones: result.paymentMilestones } } });
      return result;
    });
    return updated;
  }
  @Get('agents/:agentId/payment-terms')
  async paymentTerms(@Param('agentId') agentId: string) {
    const agent = await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { paymentMilestones: { orderBy: { sortOrder: 'asc' } }, agentPaymentPolicy: true, bookingPaymentPercent: true } });
    const milestones = agent.paymentMilestones.length ? agent.paymentMilestones : agent.agentPaymentPolicy ? paymentMilestonesForAgent(agent) : [];
    return { milestones };
  }

  @Put('agents/:agentId/payment-terms')
  async updatePaymentTerms(@Param('agentId') agentId: string, @Body() body: AgentPaymentMilestonesDto, @CurrentUser() actor: any) {
    const agent = await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true, agentPaymentPolicy: true, bookingPaymentPercent: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } } } });
    const milestones = validatePaymentMilestones(body.milestones);
    return this.p.$transaction(async (tx) => {
      await tx.agentPaymentMilestone.deleteMany({ where: { agentId } });
      await tx.agentPaymentMilestone.createMany({ data: milestones.map((item) => ({ agentId, percentage: item.percentage, dueType: item.dueType, daysBeforeCheckIn: item.daysBeforeCheckIn, sortOrder: item.sortOrder })) });
      const updated = await tx.user.update({ where: { id: agentId }, data: { agentPaymentPolicy: null, bookingPaymentPercent: null }, select: { id: true, paymentMilestones: { orderBy: { sortOrder: 'asc' } } } });
      await tx.auditLog.create({ data: { actorUserId: actor.id, action: 'AGENT_PAYMENT_TERMS_UPDATED', entityType: 'User', entityId: agentId, before: { agentPaymentPolicy: agent.agentPaymentPolicy, bookingPaymentPercent: agent.bookingPaymentPercent, paymentMilestones: agent.paymentMilestones }, after: { paymentMilestones: updated.paymentMilestones } } });
      return { milestones: updated.paymentMilestones };
    });
  }

  @Get('agents/:agentId/documents') agentDocuments(@Param('agentId') agentId: string) { return this.agentsService!.listDocuments(agentId); }
  @Patch('agents/:agentId/documents/:id') reviewAgentDocument(@Param('agentId') agentId: string, @Param('id') id: string, @Body() body: { status?: string; reviewRemark?: string }) { return this.agentsService!.reviewDocument(agentId, id, body.status ?? '', body.reviewRemark); }
  @Put('agents/:id/hotel-rate-plan') async assignHotelRatePlan(@Param('id') id: string, @Body() body: AgentHotelRatePlanDto, @CurrentUser() actor: any) {
    if (!this.agentsService) throw new BadRequestException('Agent rate-plan service is unavailable.');
    return this.agentsService.assignAgentHotelRatePlan(id, body.hotelId, body.masterId, actor.id);
  }
  @Delete('agents/:agentId/rate-plan-masters/:masterId') async removeHotelRatePlan(@Param('agentId') agentId: string, @Param('masterId') masterId: string, @CurrentUser() actor: any) {
    if (!this.agentsService) throw new BadRequestException('Agent rate-plan service is unavailable.');
    return this.agentsService.removeAgentHotelRatePlan(agentId, masterId, actor.id);
  }
  @Put('agents/:id/rate-plans') async mapRatePlans(@Param('id') id: string, @Body() d: AgentRatePlanMappingDto, @CurrentUser() actor?: any) {
    const agent = await this.p.user.findFirstOrThrow({ where: { id, role: 'AGENT' }, select: { id: true } });
    const ratePlanIds = [...new Set(d.ratePlanIds ?? [])];
    const validPlans = await this.p.ratePlan.findMany({ where: { id: { in: ratePlanIds }, active: true, master: { active: true } }, select: { id: true, masterId: true, roomType: { select: { hotelId: true } } } });
    if (validPlans.length !== ratePlanIds.length) throw new BadRequestException('One or more selected rate plans are invalid or inactive.');
    if (d.hotelId && validPlans.some((plan) => plan.roomType.hotelId !== d.hotelId)) throw new BadRequestException('One or more selected rate plans do not belong to the selected hotel.');
    const hasMasterMetadata = validPlans.length > 0 && validPlans.every((plan) => Boolean(plan.masterId && plan.roomType?.hotelId));
    const masterByHotel = new Map<string, string>();
    if (hasMasterMetadata) for (const plan of validPlans) {
      const previous = masterByHotel.get(plan.roomType.hotelId);
      if (previous && previous !== plan.masterId) throw new BadRequestException('An agent can have only one commercial rate plan per hotel.');
      masterByHotel.set(plan.roomType.hotelId, plan.masterId);
    }
    const normalizedRatePlanIds = hasMasterMetadata
      ? Array.from(new Set((await this.p.ratePlan.findMany({ where: { active: true, master: { active: true }, masterId: { in: Array.from(masterByHotel.values()) }, roomType: { active: true, hotelId: d.hotelId ? d.hotelId : undefined } }, select: { id: true } })).map((plan) => plan.id)))
      : ratePlanIds;
    const currentMappings = typeof this.p.agentRatePlan.findMany === 'function' ? await this.p.agentRatePlan.findMany({ where: { agentId: agent.id, active: true, ...(d.hotelId ? { ratePlan: { roomType: { hotelId: d.hotelId } } } : {}) }, select: { id: true, ratePlanId: true } }) : [];
    const currentIds = new Set(currentMappings.map((mapping) => mapping.ratePlanId));
    const selected = new Set(normalizedRatePlanIds);
    await this.p.$transaction(async (tx) => {
      await Promise.all(normalizedRatePlanIds.map((ratePlanId) => tx.agentRatePlan.upsert({ where: { agentId_ratePlanId: { agentId: agent.id, ratePlanId } }, create: { agentId: agent.id, ratePlanId, active: true }, update: { active: true } })));
      await tx.agentRatePlan.updateMany({ where: { agentId: agent.id, ratePlanId: { notIn: [...selected] }, ...(d.hotelId ? { ratePlan: { roomType: { hotelId: d.hotelId } } } : {}) }, data: { active: false } });
      if (tx.auditLog?.create) await tx.auditLog.create({ data: { actorUserId: actor?.id, action: 'AGENT_RATE_PLANS_UPDATED', entityType: 'User', entityId: agent.id, before: { ratePlanIds: [...currentIds] }, after: { addedRatePlanIds: normalizedRatePlanIds.filter((ratePlanId) => !currentIds.has(ratePlanId)), removedRatePlanIds: [...currentIds].filter((ratePlanId) => !selected.has(ratePlanId)), ratePlanIds: normalizedRatePlanIds } } });
    });
    return this.p.user.findFirstOrThrow({ where: { id: agent.id }, select: { id: true, email: true, name: true, role: true, active: true, assignedRatePlans: { include: { ratePlan: { include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } } });
  }

  @Patch('agents/:agentId/rate-plans/:ratePlanId')
  async updateAgentRatePlan(@Param('agentId') agentId: string, @Param('ratePlanId') ratePlanId: string, @Body() body: AgentRatePlanUpdateDto) {
    const mapping = await this.p.agentRatePlan.findUnique({ where: { agentId_ratePlanId: { agentId, ratePlanId } }, include: { agent: { select: { role: true } }, ratePlan: { select: { active: true, master: { select: { active: true } } } } } });
    if (!mapping || mapping.agent.role !== 'AGENT') throw new BadRequestException('Agent rate-plan mapping not found.');
    if (!mapping.ratePlan.active || !mapping.ratePlan.master.active) throw new BadRequestException('The room rate plan is inactive.');
    if (body.pricingMode === 'OVERRIDE' && body.active === false) throw new BadRequestException('An inactive mapping cannot use agent contract pricing.');
    return this.p.agentRatePlan.update({ where: { id: mapping.id }, data: { active: body.active, pricingMode: body.pricingMode } });
  }

  @Get('agents/:agentId/rate-plans/:ratePlanId/rates')
  async agentRates(@Param('agentId') agentId: string, @Param('ratePlanId') ratePlanId: string) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const assignment = await this.p.agentRatePlan.findUnique({ where: { agentId_ratePlanId: { agentId, ratePlanId } }, include: { rates: { where: { date: { gte: today } }, orderBy: { date: 'asc' } }, ratePlan: { include: { master: true, roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } }, rates: { where: { date: { gte: today } }, orderBy: { date: 'asc' } } } } } });
    if (!assignment) throw new BadRequestException('Agent is not assigned to this rate plan.');
    return assignment;
  }

  @Put('agents/:agentId/rate-plans/:ratePlanId/rates')
  async saveAgentRates(@Param('agentId') agentId: string, @Param('ratePlanId') ratePlanId: string, @Body() body: AgentRateBatchDto) {
    const assignment = await this.p.agentRatePlan.findUnique({ where: { agentId_ratePlanId: { agentId, ratePlanId } }, include: { ratePlan: { select: { active: true, master: { select: { active: true } } } } } });
    if (!assignment) throw new BadRequestException('Agent is not assigned to this rate plan.');
    if (!assignment.active || !assignment.ratePlan.active || !assignment.ratePlan.master.active) throw new BadRequestException('Only active agent, room rate-plan and master assignments can be priced.');
    await this.p.$transaction(async (tx) => {
      for (const day of body.days) {
        const date = parseDateOnly(day.date, 'agent rate date');
        const occupancyPrices = normalizeOccupancyPrices(day.occupancyPrices);
        const hasValue = [day.amount, day.taxAmount, day.childAmount, day.extraAdultAmount].some((value) => value !== undefined && value !== null) || (day.occupancyPrices !== undefined && day.occupancyPrices !== null && Object.keys(day.occupancyPrices).length > 0);
        if (!hasValue) {
          await tx.agentRateDay.deleteMany({ where: { agentRatePlanId: assignment.id, date } });
          continue;
        }
        await tx.agentRateDay.upsert({
          where: { agentRatePlanId_date: { agentRatePlanId: assignment.id, date } },
          create: { agentRatePlanId: assignment.id, date, amount: day.amount ?? null, taxAmount: day.taxAmount ?? null, childAmount: day.childAmount ?? null, extraAdultAmount: day.extraAdultAmount ?? null, occupancyPrices: occupancyPrices ?? undefined },
          update: { amount: day.amount === undefined ? undefined : day.amount, taxAmount: day.taxAmount === undefined ? undefined : day.taxAmount, childAmount: day.childAmount === undefined ? undefined : day.childAmount, extraAdultAmount: day.extraAdultAmount === undefined ? undefined : day.extraAdultAmount, occupancyPrices: occupancyPrices === undefined ? undefined : occupancyPrices === null ? Prisma.DbNull : occupancyPrices },
        });
      }
    });
    return this.agentRates(agentId, ratePlanId);
  }

  @Delete('agents/:agentId/rate-plans/:ratePlanId/rates/:date')
  async clearAgentRate(@Param('agentId') agentId: string, @Param('ratePlanId') ratePlanId: string, @Param('date') dateText: string) {
    const assignment = await this.p.agentRatePlan.findUnique({ where: { agentId_ratePlanId: { agentId, ratePlanId } }, select: { id: true } });
    if (!assignment) throw new BadRequestException('Agent is not assigned to this rate plan.');
    const date = parseDateOnly(dateText, 'agent rate date');
    await this.p.agentRateDay.deleteMany({ where: { agentRatePlanId: assignment.id, date } });
    return { cleared: true, date: dateText.slice(0, 10) };
  }
}

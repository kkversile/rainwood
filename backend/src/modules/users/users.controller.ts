import { BadRequestException, Body, Controller, Delete, Get, Optional, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AgentRateBatchDto, AgentRatePlanUpdateDto } from './users.dto';
import { normalizeOccupancyPrices } from '../../common/rate-pricing';
import { parseDateOnly } from '../../common/dates';
import { AgentsService } from '../agents/agents.service';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsEnum(['SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'HOUSEKEEPING', 'VIEWER', 'AGENT']) role?: string;
  @IsString() @MinLength(12) password!: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEnum(['SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'HOUSEKEEPING', 'VIEWER', 'AGENT']) role?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() revokeSessions?: boolean;
}

class AgentRatePlanMappingDto {
  @IsOptional() @IsString({ each: true }) ratePlanIds?: string[];
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class UsersController {
  constructor(private p: PrismaService, @Optional() private agentsService?: AgentsService) {}
  @Get('') list() { return this.p.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true, createdAt: true } }); }
  @Get('agents') agents() { return this.p.user.findMany({ where: { role: 'AGENT' }, select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, assignedRatePlans: { include: { ratePlan: { include: { roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } }, orderBy: { createdAt: 'asc' } }); }
  @Post('') async create(@Body() d: CreateUserDto) { return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, role: (d.role || 'RESERVATION') as any, passwordHash: await bcrypt.hash(d.password, 12), active: true }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Post('agents') async createAgent(@Body() d: CreateUserDto) { return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, passwordHash: await bcrypt.hash(d.password, 12), role: 'AGENT', active: true }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Patch(':id') update(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.p.user.update({ where: { id }, data: { name: d.name, role: d.role as any, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Patch('agents/:id') updateAgent(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.p.user.update({ where: { id, role: 'AGENT' }, data: { name: d.name, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Get('agents/:agentId/documents') agentDocuments(@Param('agentId') agentId: string) { return this.agentsService!.listDocuments(agentId); }
  @Patch('agents/:agentId/documents/:id') reviewAgentDocument(@Param('agentId') agentId: string, @Param('id') id: string, @Body() body: { status?: string; reviewRemark?: string }) { return this.agentsService!.reviewDocument(agentId, id, body.status ?? '', body.reviewRemark); }
  @Put('agents/:id/rate-plans') async mapRatePlans(@Param('id') id: string, @Body() d: AgentRatePlanMappingDto) {
    const agent = await this.p.user.findFirstOrThrow({ where: { id, role: 'AGENT' }, select: { id: true } });
    const ratePlanIds = [...new Set(d.ratePlanIds ?? [])];
    const validPlans = await this.p.ratePlan.findMany({ where: { id: { in: ratePlanIds }, active: true, master: { active: true } }, select: { id: true } });
    if (validPlans.length !== ratePlanIds.length) throw new BadRequestException('One or more selected rate plans are invalid or inactive.');
    await this.p.$transaction(async (tx) => {
      const selected = new Set(ratePlanIds);
      await Promise.all(ratePlanIds.map((ratePlanId) => tx.agentRatePlan.upsert({ where: { agentId_ratePlanId: { agentId: agent.id, ratePlanId } }, create: { agentId: agent.id, ratePlanId, active: true }, update: { active: true } })));
      await tx.agentRatePlan.updateMany({ where: { agentId: agent.id, ratePlanId: { notIn: [...selected] } }, data: { active: false } });
    });
    return this.p.user.findFirstOrThrow({ where: { id: agent.id }, select: { id: true, email: true, name: true, role: true, active: true, assignedRatePlans: { include: { ratePlan: { include: { roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } } });
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
    const assignment = await this.p.agentRatePlan.findUnique({ where: { agentId_ratePlanId: { agentId, ratePlanId } }, include: { rates: { where: { date: { gte: today } }, orderBy: { date: 'asc' } }, ratePlan: { include: { roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } }, rates: { where: { date: { gte: today } }, orderBy: { date: 'asc' } } } } } });
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

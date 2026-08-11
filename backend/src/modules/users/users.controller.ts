import { Body, Controller, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import bcrypt from 'bcryptjs';

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
  constructor(private p: PrismaService) {}
  @Get('') list() { return this.p.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true, createdAt: true } }); }
  @Get('agents') agents() { return this.p.user.findMany({ where: { role: 'AGENT' }, select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, assignedRatePlans: { include: { ratePlan: { include: { roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } }, orderBy: { createdAt: 'asc' } }); }
  @Post('') async create(@Body() d: CreateUserDto) { return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, role: (d.role || 'RESERVATION') as any, passwordHash: await bcrypt.hash(d.password, 12), active: true }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Post('agents') async createAgent(@Body() d: CreateUserDto) { return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, passwordHash: await bcrypt.hash(d.password, 12), role: 'AGENT', active: true }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Patch(':id') update(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.p.user.update({ where: { id }, data: { name: d.name, role: d.role as any, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Patch('agents/:id') updateAgent(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.p.user.update({ where: { id, role: 'AGENT' }, data: { name: d.name, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Put('agents/:id/rate-plans') async mapRatePlans(@Param('id') id: string, @Body() d: AgentRatePlanMappingDto) {
    const agent = await this.p.user.findFirstOrThrow({ where: { id, role: 'AGENT' }, select: { id: true } });
    const ratePlanIds = [...new Set(d.ratePlanIds ?? [])];
    const validPlans = await this.p.ratePlan.findMany({ where: { id: { in: ratePlanIds }, active: true }, select: { id: true } });
    if (validPlans.length !== ratePlanIds.length) throw new Error('One or more selected rate plans are invalid or inactive.');
    await this.p.$transaction([
      this.p.agentRatePlan.deleteMany({ where: { agentId: agent.id } }),
      ...ratePlanIds.map((ratePlanId) => this.p.agentRatePlan.create({ data: { agentId: agent.id, ratePlanId } })),
    ]);
    return this.p.user.findFirstOrThrow({ where: { id: agent.id }, select: { id: true, email: true, name: true, role: true, active: true, assignedRatePlans: { include: { ratePlan: { include: { roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } } });
  }
}

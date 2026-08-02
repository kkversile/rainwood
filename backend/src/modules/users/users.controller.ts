import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import bcrypt from 'bcryptjs';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsEnum(['SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'HOUSEKEEPING', 'VIEWER']) role?: string;
  @IsString() @MinLength(12) password!: string;
}

class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEnum(['SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'HOUSEKEEPING', 'VIEWER']) role?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsBoolean() revokeSessions?: boolean;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class UsersController {
  constructor(private p: PrismaService) {}
  @Get('') list() { return this.p.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true, createdAt: true } }); }
  @Post('') async create(@Body() d: CreateUserDto) { return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, role: (d.role || 'RESERVATION') as any, passwordHash: await bcrypt.hash(d.password, 12), active: true }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Patch(':id') update(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.p.user.update({ where: { id }, data: { name: d.name, role: d.role as any, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true } }); }
}

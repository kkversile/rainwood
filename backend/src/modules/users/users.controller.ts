import { BadRequestException, Body, Controller, Delete, Get, Header, Optional, Param, Patch, Post, Put, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { IsBoolean, IsEmail, IsEnum, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { AgentRateBatchDto, AgentRatePlanUpdateDto } from './users.dto';
import { normalizeOccupancyPrices } from '../../common/rate-pricing';
import { parseDateOnly, parseExcelDateOnly } from '../../common/dates';
import { AgentsService } from '../agents/agents.service';
import { AgentDocumentStatus, AgentPaymentPolicy } from '@prisma/client';
import { validateAgentPaymentTerms } from '../../common/agent-payment-terms';
import ExcelJS from 'exceljs';
import { mapImportedRateFields } from '../../common/excel-rate-fields';

class CreateUserDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsEnum(['SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'HOUSEKEEPING', 'VIEWER', 'AGENT']) role?: string;
  @IsString() @MinLength(12) password!: string;
  @IsOptional() @IsEnum(AgentPaymentPolicy) agentPaymentPolicy?: AgentPaymentPolicy;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) bookingPaymentPercent?: number;
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

class AgentApprovalDto {
  @IsBoolean() active!: boolean;
  @IsOptional() @IsEnum(AgentPaymentPolicy) paymentPolicy?: AgentPaymentPolicy;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) bookingPaymentPercent?: number;
}

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class UsersController {
  constructor(private p: PrismaService, @Optional() private agentsService?: AgentsService) {}
  @Get('') list() { return this.p.user.findMany({ select: { id: true, email: true, name: true, role: true, active: true, createdAt: true } }); }
  @Get('agents') agents() { return this.p.user.findMany({ where: { role: 'AGENT' }, select: { id: true, email: true, name: true, companyName: true, contactPerson: true, mobile: true, gstin: true, place: true, addressLine1: true, addressLine2: true, state: true, pinCode: true, additionalInformation: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, createdAt: true, agentDocuments: { select: { status: true } }, assignedRatePlans: { include: { ratePlan: { include: { roomType: { include: { hotel: { select: { id: true, name: true, city: true } } } } } } } } }, orderBy: { createdAt: 'asc' } }); }
  @Get('agents/rate-import-template.xlsx')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="rainwood-agent-rate-template.xlsx"')
  async agentRateTemplate() {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet('Agent Rates');
    const columns = ['Agent Email', 'Hotel', 'Room Code', 'Rate Plan Code', 'Date', 'Agent Contract Rate', 'Contract Tax', 'Single', 'Double', 'Triple', 'Quad', 'Extra Adult Charge', 'Child Charge'];
    const header = sheet.addRow(columns); header.font = { bold: true, color: { argb: 'FFFFFFFF' } }; header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '0F4569' } }; header.alignment = { wrapText: true };
    sheet.addRow(['agent@example.com', 'RW-OOTY', 'DLX', 'BAR', new Date().toISOString().slice(0, 10), '', '', '', '', '', '', '', '']);
    sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.autoFilter = { from: 'A1', to: `M${sheet.rowCount}` }; sheet.columns.forEach((column) => { column.width = 20; });
    return new StreamableFile(Buffer.from(await workbook.xlsx.writeBuffer()));
  }
  @Post('agents/rates/import')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  async importAgentRates(@UploadedFile() file: Express.Multer.File, @CurrentUser() actor: any) {
    if (!file?.buffer || !/\.(xlsx|xlsm)$/i.test(file.originalname ?? '')) throw new BadRequestException('Upload an .xlsx workbook');
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.buffer as any); const sheet = workbook.worksheets[0]; if (!sheet) throw new BadRequestException('Workbook must contain a worksheet');
    const headers = new Map<string, number>(); sheet.getRow(1).eachCell((cell, index) => { const key = String(cell.value ?? '').trim().toLowerCase(); if (key) headers.set(key, index); });
    const required = ['agent email', 'hotel', 'room code', 'rate plan code', 'date']; const missing = required.filter((key) => !headers.has(key)); if (missing.length) throw new BadRequestException(`Missing required columns: ${missing.join(', ')}`);
    const headerIndex = (...names: string[]) => names.map((name) => headers.get(name)).find((index): index is number => index !== undefined);
    const cellValue = (row: ExcelJS.Row, ...names: string[]) => { const index = headerIndex(...names); return index ? row.getCell(index).value : undefined; };
    const text = (row: ExcelJS.Row, ...names: string[]) => { const value = cellValue(row, ...names); return value && typeof value === 'object' && 'result' in value ? String(value.result ?? '').trim() : String(value ?? '').trim(); };
    const number = (row: ExcelJS.Row, ...names: string[]) => { const raw = text(row, ...names); if (!raw) return undefined; const value = Number(raw); return Number.isFinite(value) && value >= 0 ? value : null; };
    const errors: { row: number; field: string; message: string }[] = []; const rows: any[] = []; const receivedRows = new Set<number>(); const seen = new Set<string>();
    const agents = await this.p.user.findMany({ where: { role: 'AGENT', email: { in: Array.from({ length: sheet.rowCount - 1 }, (_, index) => text(sheet.getRow(index + 2), 'agent email').toLowerCase()).filter(Boolean) } }, select: { id: true, email: true } });
    const agentByEmail = new Map(agents.map((item) => [item.email.toLowerCase(), item]));
    const mappings = await this.p.agentRatePlan.findMany({ where: { agentId: { in: agents.map((item) => item.id) } }, select: { id: true, agentId: true, ratePlanId: true, active: true } });
    const mappingsByKey = new Map(mappings.map((item) => [`${item.agentId}:${item.ratePlanId}`, item]));
    const hotels = await this.p.hotel.findMany({ include: { rooms: { include: { ratePlans: { include: { master: true } } } } } });
    const hotelFor = (value: string) => hotels.find((hotel) => hotel.id === value || hotel.code.toLowerCase() === value.toLowerCase() || hotel.name.toLowerCase() === value.toLowerCase());
    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber); if (!row.actualCellCount) continue; receivedRows.add(rowNumber);
      const email = text(row, 'agent email').toLowerCase(); const agent = agentByEmail.get(email); const hotel = hotelFor(text(row, 'hotel')); const room = hotel?.rooms.find((item) => item.code.toLowerCase() === text(row, 'room code').toLowerCase()); const plan = room?.ratePlans.find((item) => item.code.toLowerCase() === text(row, 'rate plan code').toLowerCase());
      if (!agent) errors.push({ row: rowNumber, field: 'Agent Email', message: `Unknown agent "${email}"` });
      if (!hotel) errors.push({ row: rowNumber, field: 'Hotel', message: `Unknown hotel "${text(row, 'hotel')}"` });
      if (hotel && !room) errors.push({ row: rowNumber, field: 'Room Code', message: `Unknown room code "${text(row, 'room code')}"` });
      if (room && !plan) errors.push({ row: rowNumber, field: 'Rate Plan Code', message: `Unknown rate plan code "${text(row, 'rate plan code')}"` });
      if (plan && (!plan.active || !plan.master.active)) errors.push({ row: rowNumber, field: 'Rate Plan Code', message: 'Rate plan or master is inactive' });
      let date: Date | undefined; try { date = parseExcelDateOnly(cellValue(row, 'date'), 'date'); } catch { errors.push({ row: rowNumber, field: 'Date', message: 'Invalid date' }); }
      const amount = number(row, 'agent contract rate', 'agent base rate'); const taxAmount = number(row, 'contract tax', 'tax'); const childAmount = number(row, 'child charge', 'extra child'); const extraAdultAmount = number(row, 'extra adult charge', 'extra adult');
      for (const [field, value] of Object.entries({ amount, taxAmount, childAmount, extraAdultAmount })) if (value === null) errors.push({ row: rowNumber, field, message: 'Must be a non-negative number' });
      const occupancy: Record<string, number> = {}; for (const key of ['single', 'double', 'triple', 'quad'] as const) { const value = number(row, key); if (value === null) errors.push({ row: rowNumber, field: key, message: 'Must be a non-negative number' }); else if (value !== undefined) occupancy[key] = value; }
      const mappedGuestFields = mapImportedRateFields({ ...occupancy, extraAdultAmount: extraAdultAmount ?? undefined, childAmount: childAmount ?? undefined });
      const hasOverride = [amount, taxAmount, childAmount, extraAdultAmount].some((value) => value !== undefined) || Object.keys(occupancy).length > 0;
      const values: Record<string, number | null> = { amount: amount ?? null, taxAmount: taxAmount ?? null, childAmount: mappedGuestFields.childAmount ?? null, extraAdultAmount: mappedGuestFields.extraAdultAmount ?? null, ...(mappedGuestFields.occupancyPrices ?? {}) };
      if (!agent || !plan || !date) continue;
      const mapping = mappingsByKey.get(`${agent.id}:${plan.id}`);
      if (!mapping) { errors.push({ row: rowNumber, field: 'Mapping', message: 'Agent is not assigned to this rate plan' }); continue; }
      if (!mapping.active) { errors.push({ row: rowNumber, field: 'Mapping', message: 'Agent rate-plan mapping is inactive' }); continue; }
      const key = `${mapping.id}:${date.toISOString().slice(0, 10)}`; if (seen.has(key)) { errors.push({ row: rowNumber, field: 'Date', message: 'Duplicate row for this agent rate plan and date' }); continue; } seen.add(key);
      rows.push({ rowNumber, mappingId: mapping.id, date, values, hasOverride });
    }
    const invalidRows = new Set(errors.map((error) => error.row));
    if (errors.length) return { rowsReceived: receivedRows.size, rowsValid: receivedRows.size - invalidRows.size, rowsInvalid: invalidRows.size, rowsImported: 0, rowsUpdated: 0, errors };
    let rowsUpdated = 0;
    await this.p.$transaction(async (tx) => { for (const item of rows) { const existing = await tx.agentRateDay.findUnique({ where: { agentRatePlanId_date: { agentRatePlanId: item.mappingId, date: item.date } }, select: { id: true } }); if (!item.hasOverride) { if (existing) await tx.agentRateDay.delete({ where: { id: existing.id } }); continue; } if (existing) rowsUpdated += 1; const occupancy = Object.fromEntries(Object.entries(item.values).filter(([key]) => ['single', 'double', 'triple', 'quad'].includes(key))); await tx.agentRatePlan.update({ where: { id: item.mappingId }, data: { pricingMode: 'OVERRIDE' } }); await tx.agentRateDay.upsert({ where: { agentRatePlanId_date: { agentRatePlanId: item.mappingId, date: item.date } }, create: { agentRatePlanId: item.mappingId, date: item.date, amount: item.values.amount ?? null, taxAmount: item.values.taxAmount ?? null, childAmount: item.values.childAmount ?? null, extraAdultAmount: item.values.extraAdultAmount ?? null, occupancyPrices: Object.keys(occupancy).length ? occupancy as Prisma.InputJsonValue : undefined }, update: { amount: item.values.amount ?? null, taxAmount: item.values.taxAmount ?? null, childAmount: item.values.childAmount ?? null, extraAdultAmount: item.values.extraAdultAmount ?? null, occupancyPrices: Object.keys(occupancy).length ? occupancy as Prisma.InputJsonValue : Prisma.DbNull } }); } });
    await this.p.auditLog.create({ data: { actorUserId: actor.id, action: 'AGENT_RATE_EXCEL_IMPORTED', entityType: 'AgentRatePlan', after: { rowsImported: rows.length, rowsUpdated } } });
    return { rowsReceived: receivedRows.size, rowsValid: receivedRows.size, rowsInvalid: 0, rowsImported: rows.length, rowsUpdated, errors: [] };
  }
  @Get('agents/:agentId') agent(@Param('agentId') agentId: string) { return this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' }, select: { id: true, email: true, name: true, companyName: true, contactPerson: true, mobile: true, gstin: true, place: true, addressLine1: true, addressLine2: true, state: true, pinCode: true, additionalInformation: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true, createdAt: true, agentDocuments: { include: { file: { select: { originalName: true, mimeType: true, size: true } } }, orderBy: { createdAt: 'desc' } } } }); }
  @Post('') async create(@Body() d: CreateUserDto) { return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, role: (d.role || 'RESERVATION') as any, passwordHash: await bcrypt.hash(d.password, 12), active: true }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Post('agents') async createAgent(@Body() d: CreateUserDto) {
    const terms = validateAgentPaymentTerms({ agentPaymentPolicy: d.agentPaymentPolicy, bookingPaymentPercent: d.bookingPaymentPercent }, true);
    return this.p.user.create({ data: { email: d.email.toLowerCase(), name: d.name, passwordHash: await bcrypt.hash(d.password, 12), role: 'AGENT', active: true, agentPaymentPolicy: terms.policy, bookingPaymentPercent: terms.percentage }, select: { id: true, email: true, name: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true } });
  }
  @Patch(':id') update(@Param('id') id: string, @Body() d: UpdateUserDto) { return this.p.user.update({ where: { id }, data: { name: d.name, role: d.role as any, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true } }); }
  @Patch('agents/:id') async updateAgent(@Param('id') id: string, @Body() d: UpdateUserDto) {
    const current = await this.p.user.findFirstOrThrow({ where: { id, role: 'AGENT' } });
    if (d.active === true && !current.agentPaymentPolicy) throw new BadRequestException('Assign payment terms before activating this agent');
    return this.p.user.update({ where: { id, role: 'AGENT' }, data: { name: d.name, active: d.active, tokenVersion: d.revokeSessions ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true } });
  }
  @Patch('agents/:agentId/approval') async approveAgent(@Param('agentId') agentId: string, @Body() body: AgentApprovalDto, @CurrentUser() actor: any) {
    const current = await this.p.user.findFirstOrThrow({ where: { id: agentId, role: 'AGENT' } });
    const hasNewTerms = body.paymentPolicy !== undefined || body.bookingPaymentPercent !== undefined;
    const terms = hasNewTerms
      ? validateAgentPaymentTerms({ agentPaymentPolicy: body.paymentPolicy, bookingPaymentPercent: body.bookingPaymentPercent }, !current.active)
      : validateAgentPaymentTerms(current);
    if (body.active && !terms.policy) throw new BadRequestException('Payment terms are required before approval');
    if (body.active && !current.active && !current.agentPaymentPolicy && current.bookingPaymentPercent == null) {
      const documents = await this.p.agentDocument.findMany({ where: { agentId: current.id }, select: { status: true } });
      if (!documents.length || documents.some((document) => document.status !== AgentDocumentStatus.APPROVED)) throw new BadRequestException('Complete and verify the required KYC documents before approving this agent.');
    }
    const updated = await this.p.$transaction(async (tx) => {
      const result = await tx.user.update({ where: { id: current.id }, data: { active: body.active, agentPaymentPolicy: terms.policy, bookingPaymentPercent: terms.percentage, tokenVersion: body.active === false ? { increment: 1 } : undefined }, select: { id: true, email: true, name: true, role: true, active: true, agentPaymentPolicy: true, bookingPaymentPercent: true } });
      await tx.auditLog.create({ data: { actorUserId: actor.id, action: current.active === false && body.active ? 'AGENT_APPROVED' : 'AGENT_PAYMENT_TERMS_UPDATED', entityType: 'User', entityId: current.id, before: { active: current.active, agentPaymentPolicy: current.agentPaymentPolicy, bookingPaymentPercent: current.bookingPaymentPercent }, after: { active: result.active, agentPaymentPolicy: result.agentPaymentPolicy, bookingPaymentPercent: result.bookingPaymentPercent } } });
      return result;
    });
    return updated;
  }
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

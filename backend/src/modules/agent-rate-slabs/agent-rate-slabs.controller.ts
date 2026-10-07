import { Body, Controller, Get, Param, Patch, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';
import { AgentRateSlabsService } from './agent-rate-slabs.service';
import { AgentRateRangeQueryDto, AgentRateSlabAssignmentDto, AgentRateSlabDto, AgentRateSlabRatesDto } from './agent-rate-slabs.dto';

@Controller('agent-rate-slabs')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('agents')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
export class AgentRateSlabsController {
  constructor(private readonly service: AgentRateSlabsService) {}

  @Get() list(@Query('search') search?: string) { return this.service.list(search); }
  @Post() @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') create(@Body() body: AgentRateSlabDto, @CurrentUser() user: any) { return this.service.create(body, user.id); }
  @Get(':id') get(@Param('id') id: string) { return this.service.get(id); }
  @Patch(':id') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') update(@Param('id') id: string, @Body() body: Partial<AgentRateSlabDto>, @CurrentUser() user: any) { return this.service.update(id, body, user.id); }
  @Post(':id/clone') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') clone(@Param('id') id: string, @CurrentUser() user: any) { return this.service.clone(id, user.id); }
  @Put(':id/rates') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') rates(@Param('id') id: string, @Body() body: AgentRateSlabRatesDto, @CurrentUser() user: any) { return this.service.replaceRates(id, body.rates, user.id); }
  @Post(':id/publish') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') publish(@Param('id') id: string, @CurrentUser() user: any) { return this.service.publish(id, user.id); }
  @Get(':id/agents/:agentId/preview') preview(@Param('id') id: string, @Param('agentId') agentId: string) { return this.service.previewSheet(agentId, id); }
  @Post(':id/agents/:agentId/publish-sheet') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') publishSheet(@Param('id') id: string, @Param('agentId') agentId: string, @CurrentUser() user: any) { return this.service.publishSheet(agentId, id, user.id); }
  @Get(':id/agents/:agentId/sheets') sheets(@Param('agentId') agentId: string) { return this.service.sheets(agentId); }
  @Get(':id/agents/:agentId/sheets/:sheetId.html') async download(@Param('agentId') agentId: string, @Param('sheetId') sheetId: string, @Res() response: Response) { const result = await this.service.downloadSheet(agentId, sheetId); response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`); return response.send(result.html); }
}

@Controller('agents')
export class AgentRateSlabAssignmentController {
  constructor(private readonly service: AgentRateSlabsService) {}

  @Post(':agentId/rate-slab')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('agents')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN')
  assign(@Param('agentId') agentId: string, @Body() body: AgentRateSlabAssignmentDto, @CurrentUser() user: any) { return this.service.assign(agentId, body, user.id); }

  @Post(':agentId/rate-slab/:assignmentId/remove')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('agents')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN')
  remove(@Param('agentId') agentId: string, @Param('assignmentId') assignmentId: string, @CurrentUser() user: any) { return this.service.removeAssignment(agentId, assignmentId, user.id); }

  @Get(':agentId/rate-slab')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('agents')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
  assignments(@Param('agentId') agentId: string) { return this.service.assignmentsForAgent(agentId); }

  @Get('me/rates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('AGENT' as any)
  mine(@CurrentUser() user: any, @Query() query: AgentRateRangeQueryDto) { return this.service.effectiveRates(user.id, query.from, query.to); }

  @Get('me/category-rate-sheet/preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('AGENT' as any)
  categoryMinePreview(@CurrentUser() user: any, @Query() query: AgentRateRangeQueryDto) { return this.service.previewCategorySheet(user.id, query.from, query.to); }

  @Get(':agentId/category-rate-sheet/preview')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('agents')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'VIEWER')
  categoryPreview(@Param('agentId') agentId: string, @Query() query: AgentRateRangeQueryDto) { return this.service.previewCategorySheet(agentId, query.from, query.to); }

  @Post(':agentId/category-rate-sheet/publish')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('agents')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN')
  categoryPublish(@Param('agentId') agentId: string, @CurrentUser() user: any, @Query() query: AgentRateRangeQueryDto) { return this.service.publishCategorySheet(agentId, user.id, query.from, query.to); }

  @Get(':agentId/category-rate-sheet/sheets')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('agents')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'VIEWER')
  categorySheets(@Param('agentId') agentId: string) { return this.service.categorySheets(agentId); }

  @Get(':agentId/category-rate-sheet/sheets/:sheetId.html')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('agents')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'VIEWER')
  async categoryDownload(@Param('agentId') agentId: string, @Param('sheetId') sheetId: string, @Res() response: Response) { const result = await this.service.downloadCategorySheet(agentId, sheetId); response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`); return response.send(result.html); }

  @Get('me/rate-sheets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('AGENT' as any)
  mySheets(@CurrentUser() user: any) { return this.service.sheetsForAgent(user.id); }

  @Get('me/rate-sheets/:sheetId.html')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('AGENT' as any)
  async mySheetDownload(@CurrentUser() user: any, @Param('sheetId') sheetId: string, @Res() response: Response) { const result = await this.service.downloadSheet(user.id, sheetId); response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`); return response.send(result.html); }
}

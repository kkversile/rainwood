import { Get, Param, Post, Query, Res, UseGuards, Controller } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';
import { AgentCategoryRatesService } from './agent-rate-slabs.service';
import { AgentRateRangeQueryDto } from './agent-rate-slabs.dto';

@Controller('agents')
export class AgentCategoryRateSheetController {
  constructor(private readonly service: AgentCategoryRatesService) {}

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

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { BanquetCalendarQueryDto, BanquetEventCreateDto, BanquetEventListQueryDto, BanquetEventUpdateDto, BanquetFunctionCreateDto, BanquetFunctionUpdateDto, BanquetLinkOptionsQueryDto, BeoUpdateDto, FunctionAvailabilityQueryDto, RequirementStatusDto } from './banquets.dto';
import { BanquetsService } from './banquets.service';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';

const READ = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER'] as any;
const WRITE = ['SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION'] as any;

@Controller('banquets')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('banquets')
@Roles(...READ)
export class BanquetsController {
  constructor(private readonly s: BanquetsService) {}
  @Get('function-spaces/availability') availability(@CurrentUser() user: any, @Query() query: FunctionAvailabilityQueryDto) { return this.s.availability(user.id, query); }
  @Get('link-options') linkOptions(@CurrentUser() user: any, @Query() query: BanquetLinkOptionsQueryDto) { return this.s.linkOptions(user.id, query); }
  @Get('calendar') calendar(@CurrentUser() user: any, @Query() query: BanquetCalendarQueryDto) { return this.s.calendar(user.id, query); }
  @Get() list(@CurrentUser() user: any, @Query() query: BanquetEventListQueryDto) { return this.s.list(user.id, query); }
  @Post() @Roles(...WRITE) create(@CurrentUser() user: any, @Body() body: BanquetEventCreateDto) { return this.s.createEvent(user.id, body); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string, @Query('hotelId') hotelId?: string) { return this.s.detail(user.id, id, hotelId); }
  @Patch(':id') @Roles(...WRITE) update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: BanquetEventUpdateDto) { return this.s.updateEvent(user.id, id, body); }
  @Post(':id/functions') @Roles(...WRITE) createFunction(@CurrentUser() user: any, @Param('id') id: string, @Body() body: BanquetFunctionCreateDto) { return this.s.createFunction(user.id, id, body); }
  @Patch(':id/functions/:functionId') @Roles(...WRITE) updateFunction(@CurrentUser() user: any, @Param('id') id: string, @Param('functionId') functionId: string, @Body() body: BanquetFunctionUpdateDto) { return this.s.updateFunction(user.id, id, functionId, body); }
  @Post(':id/functions/:functionId/beo') @Roles(...WRITE) createBeo(@CurrentUser() user: any, @Param('id') id: string, @Param('functionId') functionId: string) { return this.s.createBeo(user.id, id, functionId); }
  @Patch(':id/functions/:functionId/beo') @Roles(...WRITE) updateBeo(@CurrentUser() user: any, @Param('id') id: string, @Param('functionId') functionId: string, @Body() body: BeoUpdateDto) { return this.s.updateBeo(user.id, id, functionId, body); }
  @Post(':id/functions/:functionId/beo/finalize') @Roles(...WRITE) finalizeBeo(@CurrentUser() user: any, @Param('id') id: string, @Param('functionId') functionId: string) { return this.s.finalizeBeo(user.id, id, functionId); }
  @Patch(':id/functions/:functionId/beo/requirements/:requirementId') @Roles(...WRITE) requirement(@CurrentUser() user: any, @Param('id') id: string, @Param('functionId') functionId: string, @Param('requirementId') requirementId: string, @Body() body: RequirementStatusDto) { return this.s.updateRequirement(user.id, id, functionId, requirementId, body.status); }
}

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';
import { AgentMappingDto, AgentMappingQueryDto, RateMasterQueryDto, RateMasterUpdateDto } from './rate-master.dto';
import { RateMasterService } from './rate-master.service';

@Controller('rate-master')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('rates')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'VIEWER')
export class RateMasterController {
  constructor(private readonly service: RateMasterService) {}

  @Get() list(@Query() query: RateMasterQueryDto, @CurrentUser() user: any) { return this.service.list(query, user.id); }
  @Get(':ratePlanId') get(@Param('ratePlanId') id: string, @Query() query: RateMasterQueryDto, @CurrentUser() user: any) { return this.service.get(id, query, user.id); }
  @Put(':ratePlanId') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN') update(@Param('ratePlanId') id: string, @Body() body: RateMasterUpdateDto, @CurrentUser() user: any) { return this.service.update(id, body, user.id); }
}

@Controller('agents')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('agents')
export class AgentCategoryMappingController {
  constructor(private readonly service: RateMasterService) {}

  @Get(':agentId/rate-mappings') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'VIEWER') mappings(@Param('agentId') agentId: string, @Query() query: AgentMappingQueryDto, @CurrentUser() user: any) { return this.service.mappings(agentId, query, user.id); }
  @Post(':agentId/rate-mappings') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') create(@Param('agentId') agentId: string, @Body() body: AgentMappingDto, @CurrentUser() user: any) { return this.service.createMapping(agentId, body, user.id); }
  @Patch(':agentId/rate-mappings/:mappingId') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') update(@Param('agentId') agentId: string, @Param('mappingId') mappingId: string, @Body() body: Partial<AgentMappingDto>, @CurrentUser() user: any) { return this.service.updateMapping(agentId, mappingId, body, user.id); }
  @Delete(':agentId/rate-mappings/:mappingId') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN') remove(@Param('agentId') agentId: string, @Param('mappingId') mappingId: string, @CurrentUser() user: any) { return this.service.removeMapping(agentId, mappingId, user.id); }
  @Get(':agentId/rate-mappings/:mappingId/rates') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'VIEWER') rates(@Param('agentId') agentId: string, @Param('mappingId') mappingId: string, @Query() query: AgentMappingQueryDto, @CurrentUser() user: any) { return this.service.mappingRates(agentId, mappingId, query, user.id); }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FunctionSpaceCreateDto, FunctionSpaceListQueryDto, FunctionSpaceUpdateDto } from './banquets.dto';
import { BanquetsService } from './banquets.service';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';

@Controller('function-spaces')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('functionSpaces')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
export class FunctionSpacesController {
  constructor(private readonly s: BanquetsService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: FunctionSpaceListQueryDto) { return this.s.spaces(user.id, query); }
  @Post() @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') create(@CurrentUser() user: any, @Body() body: FunctionSpaceCreateDto) { return this.s.createSpace(user.id, body); }
  @Patch(':id') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: FunctionSpaceUpdateDto) { return this.s.updateSpace(user.id, id, body); }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { OperationsLogbookService } from './operations-logbook.service';
import { OperationsLogCreateDto, OperationsLogListQueryDto, OperationsLogResolveDto, OperationsLogUpdateDto, OperationsLogUpdateNoteDto } from './operations-logbook.dto';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';

@Controller('operations-logbook')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('logbook')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER', 'SERVICE_STAFF')
export class OperationsLogbookController {
  constructor(private readonly service: OperationsLogbookService) {}

  @Get() list(@CurrentUser() user: any, @Query() query: OperationsLogListQueryDto) { return this.service.list(user.id, query); }
  @Get('handover') handover(@CurrentUser() user: any, @Query() query: OperationsLogListQueryDto) { return this.service.handover(user.id, query); }
  @Get('options') options(@CurrentUser() user: any, @Query('hotelId') hotelId?: string, @Query('reservationRef') reservationRef?: string) { return this.service.options(user.id, hotelId, reservationRef); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string) { return this.service.detail(user.id, id); }
  @Post() create(@CurrentUser() user: any, @Body() body: OperationsLogCreateDto) { return this.service.create(user.id, body); }
  @Patch(':id') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: OperationsLogUpdateDto) { return this.service.update(user.id, id, body); }
  @Post(':id/acknowledge') acknowledge(@CurrentUser() user: any, @Param('id') id: string) { return this.service.acknowledge(user.id, id); }
  @Post(':id/resolve') resolve(@CurrentUser() user: any, @Param('id') id: string, @Body() body: OperationsLogResolveDto) { return this.service.resolve(user.id, id, body); }
  @Post(':id/updates') addUpdate(@CurrentUser() user: any, @Param('id') id: string, @Body() body: OperationsLogUpdateNoteDto) { return this.service.addUpdate(user.id, id, body); }
}

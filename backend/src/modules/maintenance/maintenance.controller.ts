import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';
import { MaintenanceAssignDto, MaintenanceBoardQueryDto, MaintenanceCreateDto, MaintenanceImpactDto, MaintenanceResolveDto, MaintenanceUpdateDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@Controller('maintenance')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('maintenance')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
export class MaintenanceController {
  constructor(private service: MaintenanceService) {}

  @Get('tickets') board(@CurrentUser() user: any, @Query() query: MaintenanceBoardQueryDto) { return this.service.board(user.id, query); }
  @Get('staff') staff(@CurrentUser() user: any) { return this.service.staffList(user.id); }
  @Get('hotels') hotels(@CurrentUser() user: any) { return this.service.hotelList(user.id); }
  @Get('rooms') rooms(@CurrentUser() user: any) { return this.service.roomList(user.id); }
  @Get('tickets/:ticketId') detail(@CurrentUser() user: any, @Param('ticketId') ticketId: string) { return this.service.detail(user.id, ticketId); }
  @Post('tickets') create(@CurrentUser() user: any, @Body() body: MaintenanceCreateDto) { return this.service.create(user.id, body); }
  @Patch('tickets/:ticketId') update(@CurrentUser() user: any, @Param('ticketId') ticketId: string, @Body() body: MaintenanceUpdateDto) { return this.service.update(user.id, ticketId, body); }
  @Post('tickets/:ticketId/assign') assign(@CurrentUser() user: any, @Param('ticketId') ticketId: string, @Body() body: MaintenanceAssignDto) { return this.service.assign(user.id, ticketId, body); }
  @Post('tickets/:ticketId/start') start(@CurrentUser() user: any, @Param('ticketId') ticketId: string) { return this.service.startAsAdmin(user.id, ticketId); }
  @Post('tickets/:ticketId/resolve') resolve(@CurrentUser() user: any, @Param('ticketId') ticketId: string, @Body() body: MaintenanceResolveDto) { return this.service.resolveAsAdmin(user.id, ticketId, body); }
  @Post('tickets/:ticketId/cancel') cancel(@CurrentUser() user: any, @Param('ticketId') ticketId: string) { return this.service.cancel(user.id, ticketId); }
  @Post('tickets/:ticketId/take-room-out-of-order') takeRoomOutOfOrder(@CurrentUser() user: any, @Param('ticketId') ticketId: string, @Body() body: MaintenanceImpactDto) { return this.service.takeRoomOutOfOrder(user.id, ticketId, body); }
}

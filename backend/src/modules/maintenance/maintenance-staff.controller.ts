import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { MaintenanceResolveDto, MaintenanceStaffQueryDto } from './maintenance.dto';
import { MaintenanceService } from './maintenance.service';

@Controller('staff/maintenance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SERVICE_STAFF')
export class MaintenanceStaffController {
  constructor(private service: MaintenanceService) {}

  @Get('tasks') tasks(@CurrentUser() user: any, @Query() query: MaintenanceStaffQueryDto) { return this.service.staffTasks(user.id, query); }
  @Get('tasks/:ticketId') detail(@CurrentUser() user: any, @Param('ticketId') ticketId: string) { return this.service.staffDetail(user.id, ticketId); }
  @Post('tasks/:ticketId/accept') accept(@CurrentUser() user: any, @Param('ticketId') ticketId: string) { return this.service.accept(user.id, ticketId); }
  @Post('tasks/:ticketId/start') start(@CurrentUser() user: any, @Param('ticketId') ticketId: string) { return this.service.startAsStaff(user.id, ticketId); }
  @Post('tasks/:ticketId/resolve') resolve(@CurrentUser() user: any, @Param('ticketId') ticketId: string, @Body() body: MaintenanceResolveDto) { return this.service.resolveAsStaff(user.id, ticketId, body); }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { ManagementDashboardQueryDto } from './management-dashboard.dto';
import { ManagementDashboardService } from './management-dashboard.service';

@Controller('management')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class ManagementDashboardController {
  constructor(private readonly service: ManagementDashboardService) {}
  @Get('dashboard') dashboard(@CurrentUser() user: any, @Query() query: ManagementDashboardQueryDto) { return this.service.dashboard(user.id, query); }
}

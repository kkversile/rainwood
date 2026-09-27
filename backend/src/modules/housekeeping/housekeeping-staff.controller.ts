import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { HousekeepingBoardQueryDto, HousekeepingIssueDto } from './housekeeping.dto';
import { HousekeepingService } from './housekeeping.service';

@Controller('staff/housekeeping')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SERVICE_STAFF')
export class HousekeepingStaffController {
  constructor(private service: HousekeepingService) {}

  @Get('rooms') rooms(@CurrentUser() user: any, @Query() query: HousekeepingBoardQueryDto) { return this.service.staffRooms(user.id, query); }
  @Get('tasks') tasks(@CurrentUser() user: any) { return this.service.staffTasks(user.id); }
  @Post('tasks/:taskId/accept') accept(@CurrentUser() user: any, @Param('taskId') taskId: string) { return this.service.accept(user.id, taskId); }
  @Post('tasks/:taskId/start') start(@CurrentUser() user: any, @Param('taskId') taskId: string) { return this.service.start(user.id, taskId); }
  @Post('tasks/:taskId/complete') complete(@CurrentUser() user: any, @Param('taskId') taskId: string) { return this.service.complete(user.id, taskId); }
  @Post('tasks/:taskId/report-issue') reportIssue(@CurrentUser() user: any, @Param('taskId') taskId: string, @Body() body: HousekeepingIssueDto) { return this.service.reportIssue(user.id, taskId, body); }
}

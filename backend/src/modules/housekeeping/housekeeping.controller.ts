import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';
import { HousekeepingAssignDto, HousekeepingBoardQueryDto, HousekeepingCancelDto, HousekeepingRoomStatusDto } from './housekeeping.dto';
import { HousekeepingService } from './housekeeping.service';

@Controller('housekeeping')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('housekeeping')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
export class HousekeepingController {
  constructor(private service: HousekeepingService) {}

  @Get('board') board(@CurrentUser() user: any, @Query() query: HousekeepingBoardQueryDto) { return this.service.board(user.id, query); }
  @Get('staff') staff(@CurrentUser() user: any) { return this.service.staffList(user.id); }
  @Get('rooms/:roomId/tasks') history(@CurrentUser() user: any, @Param('roomId') roomId: string) { return this.service.history(user.id, roomId); }
  @Post('tasks/:taskId/assign') assign(@CurrentUser() user: any, @Param('taskId') taskId: string, @Body() body: HousekeepingAssignDto) { return this.service.assign(user.id, taskId, body); }
  @Post('tasks/:taskId/cancel') cancel(@CurrentUser() user: any, @Param('taskId') taskId: string, @Body() body: HousekeepingCancelDto) { return this.service.cancel(user.id, taskId, body); }
  @Patch('rooms/:roomId/status') status(@CurrentUser() user: any, @Param('roomId') roomId: string, @Body() body: HousekeepingRoomStatusDto) { return this.service.setManagementRoomStatus(user.id, roomId, body); }
}

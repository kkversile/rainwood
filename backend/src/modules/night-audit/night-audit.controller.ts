import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { NightAuditCloseDto, NightAuditPreviewQueryDto } from './night-audit.dto';
import { NightAuditService } from './night-audit.service';

@Controller('night-audit')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
export class NightAuditController {
  constructor(private readonly service: NightAuditService) {}

  @Get('preview') preview(@CurrentUser() user: any, @Query() query: NightAuditPreviewQueryDto) { return this.service.preview(user.id, query); }

  @Post('close') close(@CurrentUser() user: any, @Body() body: NightAuditCloseDto) { return this.service.close(user.id, body); }
}

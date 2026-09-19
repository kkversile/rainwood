import { BadRequestException, Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { AgentsService } from './agents.service';

@Controller('agents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AgentsController {
  constructor(private s: AgentsService) {}

  @Get('me/profile')
  @Roles('AGENT' as any)
  profile(@CurrentUser() user: any) { return this.s.getProfile(user.id); }

  @Patch('me/profile')
  @Roles('AGENT' as any)
  updateProfile(@CurrentUser() user: any, @Body() body: Record<string, unknown>) { return this.s.updateProfile(user.id, body); }

  @Patch('me/profile/image')
  @Roles('AGENT' as any)
  setProfileImage(@CurrentUser() user: any, @Body() body: { fileId?: string }) {
    if (!body.fileId) throw new BadRequestException('A profile image file is required');
    return this.s.setProfileImage(user.id, body.fileId);
  }

  @Patch('me/password')
  @Roles('AGENT' as any)
  changePassword(@CurrentUser() user: any, @Body() body: { currentPassword?: string; newPassword?: string }) { return this.s.changePassword(user.id, body.currentPassword ?? '', body.newPassword ?? ''); }

  @Get('me/documents')
  @Roles('AGENT' as any)
  documents(@CurrentUser() user: any) { return this.s.listDocuments(user.id); }

  @Post('me/documents')
  @Roles('AGENT' as any)
  addDocument(@CurrentUser() user: any, @Body() body: { documentType?: string; description?: string; fileId?: string }) { return this.s.addDocument(user.id, body); }

  @Patch(':agentId/documents/:id')
  @Roles('SUPER_ADMIN', 'ADMIN')
  review(@Param('agentId') agentId: string, @Param('id') id: string, @Body() body: { status?: string; reviewRemark?: string }) {
    if (!body.status) throw new BadRequestException('Document status is required');
    return this.s.reviewDocument(agentId, id, body.status, body.reviewRemark);
  }
}

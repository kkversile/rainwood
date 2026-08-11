import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { SiteSettingsService } from './site-settings.service';

@Controller('site-settings')
export class SiteSettingsController {
  constructor(private service: SiteSettingsService) {}

  @Get('public') publicSettings() { return this.service.publicSettings(); }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  adminSettings() { return this.service.adminSettings(); }

  @Put('logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  saveLogo(@Body() body: { logoUrl?: string | null }) { return this.service.saveLogo(body.logoUrl?.trim() || null); }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SupplementaryChargesService } from './supplementary-charges.service';
import { SupplementaryChargeDto, UpdateSupplementaryChargeDto } from './supplementary-charges.dto';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';

@Controller('supplementary-charges')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class SupplementaryChargesController {
  constructor(private service: SupplementaryChargesService) {}
  @Get() list(@Query('hotelId') hotelId?: string) { return this.service.list(hotelId); }
  @Post(':hotelId') create(@Param('hotelId') hotelId: string, @Body() body: SupplementaryChargeDto, @CurrentUser() user: any) { return this.service.create(hotelId, body, user.id); }
  @Patch(':id') update(@Param('id') id: string, @Body() body: UpdateSupplementaryChargeDto, @CurrentUser() user: any) { return this.service.update(id, body, user.id); }
  @Post(':id/deactivate') deactivate(@Param('id') id: string, @CurrentUser() user: any) { return this.service.deactivate(id, user.id); }
}

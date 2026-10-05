import { Body, Controller, Delete, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { FeaturesService } from './features.service';

@Controller('features')
@UseGuards(JwtAuthGuard)
export class FeaturesController {
  constructor(private readonly service: FeaturesService) {}

  @Get('effective') effective(@CurrentUser() user: any, @Query('hotelId') hotelId?: string) { return this.service.effectiveForActor(user.id, hotelId); }
  @Get() @UseGuards(RolesGuard) @Roles('SUPER_ADMIN') group() { return this.service.groupSettings(); }
  @Get(':hotelId') @UseGuards(RolesGuard) @Roles('SUPER_ADMIN') hotel(@Param('hotelId') hotelId: string) { return this.service.forHotel(hotelId); }
  @Put() @UseGuards(RolesGuard) @Roles('SUPER_ADMIN') updateGroup(@CurrentUser() user: any, @Body() body: { features: Record<string, boolean> }) { return this.service.updateGroup(user.id, body?.features); }
  @Put(':hotelId') @UseGuards(RolesGuard) @Roles('SUPER_ADMIN') updateHotel(@CurrentUser() user: any, @Param('hotelId') hotelId: string, @Body() body: { features: Record<string, boolean> }) { return this.service.updateHotel(user.id, hotelId, body?.features); }
  @Delete(':hotelId/:featureKey') @UseGuards(RolesGuard) @Roles('SUPER_ADMIN') reset(@CurrentUser() user: any, @Param('hotelId') hotelId: string, @Param('featureKey') featureKey: string) { return this.service.resetHotel(user.id, hotelId, featureKey); }
}

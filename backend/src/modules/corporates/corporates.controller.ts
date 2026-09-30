import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CorporateCreateDto, CorporateLinkHotelDto, CorporateListQueryDto, CorporateRateDto } from './corporates.dto';
import { CorporatesService } from './corporates.service';

@Controller('corporates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS')
export class CorporatesController {
  constructor(private readonly service: CorporatesService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: CorporateListQueryDto) { return this.service.list(user.id, query); }
  @Post() create(@CurrentUser() user: any, @Body() body: CorporateCreateDto) { return this.service.create(user.id, body); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string) { return this.service.detail(user.id, id); }
  @Patch(':id') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: CorporateCreateDto) { return this.service.update(user.id, id, body); }
  @Post(':id/hotels') linkHotel(@CurrentUser() user: any, @Param('id') id: string, @Body() body: CorporateLinkHotelDto) { return this.service.linkHotel(user.id, id, body); }
  @Get(':id/receivables') receivables(@CurrentUser() user: any, @Param('id') id: string) { return this.service.receivables(user.id, id); }
  @Post(':id/rates') createRate(@CurrentUser() user: any, @Param('id') id: string, @Body() body: CorporateRateDto) { return this.service.createRate(user.id, id, body); }
  @Patch('rates/:rateId') updateRate(@CurrentUser() user: any, @Param('rateId') rateId: string, @Body() body: CorporateRateDto) { return this.service.updateRate(user.id, rateId, body); }
  @Get(':id/rate-preview') ratePreview(@CurrentUser() user: any, @Param('id') id: string, @Query('hotelId') hotelId: string, @Query('roomTypeId') roomTypeId: string, @Query('ratePlanId') ratePlanId: string, @Query('stayDate') stayDate: string, @Query('publicPrePromoRate') publicPrePromoRate: string) { return this.service.applyCorporateRate(user.id, id, hotelId, roomTypeId, ratePlanId, stayDate, Number(publicPrePromoRate)); }
}

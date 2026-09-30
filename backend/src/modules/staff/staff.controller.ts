import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { StaffFolioChargeDto, StaffFoundItemDto, StaffServiceOrderDto, StaffStaysQueryDto } from './staff.dto';
import { GuestServicesService } from '../guest-services/guest-services.service';
import { ServiceOrderCreateDto } from '../guest-services/guest-services.dto';
import { StaffService } from './staff.service';

@Controller('staff')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SERVICE_STAFF')
export class StaffController {
  constructor(private service: StaffService, private guestServices: GuestServicesService) {}

  @Get('me') me(@CurrentUser() user: any) { return this.service.getMe(user.id); }
  @Get('stays') stays(@CurrentUser() user: any, @Query() query: StaffStaysQueryDto) { return this.service.listStays(user.id, query); }
  @Get('stays/:reference/folio') folio(@CurrentUser() user: any, @Param('reference') reference: string) { return this.service.getFolio(user.id, reference); }
  @Get('stays/:reference') stay(@CurrentUser() user: any, @Param('reference') reference: string) { return this.service.getStay(user.id, reference); }
  @Post('stays/:reference/folio/charges') postCharge(@CurrentUser() user: any, @Param('reference') reference: string, @Body() body: StaffFolioChargeDto) { return this.service.postCharge(user.id, reference, body); }
  @Get('service-items') serviceItems(@CurrentUser() user: any, @Query() query: any) { return this.guestServices.listItems(user.id, query, true); }
  @Post('stays/:reference/service-orders') serviceOrder(@CurrentUser() user: any, @Param('reference') reference: string, @Body() body: ServiceOrderCreateDto) { return this.guestServices.createOrder(user.id, reference, body); }
  @Post('lost-found') reportFound(@CurrentUser() user: any, @Body() body: StaffFoundItemDto) { return this.service.reportFoundItem(user.id, body); }
}

import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { GuestServicesService } from './guest-services.service';
import { LostFoundCreateDto, LostFoundDisposeDto, LostFoundMatchDto, LostFoundQueryDto, LostFoundReturnDto, ServiceItemCreateDto, ServiceItemQueryDto, ServiceItemUpdateDto, ServiceOrderQueryDto } from './guest-services.dto';

@Controller('service-items')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
export class ServiceItemsController {
  constructor(private readonly service: GuestServicesService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: ServiceItemQueryDto) { return this.service.listItems(user.id, query); }
  @Post() create(@CurrentUser() user: any, @Body() body: ServiceItemCreateDto) { return this.service.createItem(user.id, body); }
  @Patch(':id') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: ServiceItemUpdateDto) { return this.service.updateItem(user.id, id, body); }
}

@Controller('service-orders')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS')
export class ServiceOrdersController {
  constructor(private readonly service: GuestServicesService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: ServiceOrderQueryDto) { return this.service.listOrders(user.id, query); }
  @Get('report') report(@CurrentUser() user: any, @Query() query: ServiceOrderQueryDto) { return this.service.serviceRevenueReport(user.id, query); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string) { return this.service.getOrder(user.id, id); }
  @Post(':id/void') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN') void(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason: string) { return this.service.voidOrder(user.id, id, reason); }
}

@Controller('lost-found')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
export class LostFoundController {
  constructor(private readonly service: GuestServicesService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: LostFoundQueryDto) { return this.service.listLost(user.id, query); }
  @Post() report(@CurrentUser() user: any, @Body() body: LostFoundCreateDto) { return this.service.reportLost(user.id, body); }
  @Post(':id/match') match(@CurrentUser() user: any, @Param('id') id: string, @Body() body: LostFoundMatchDto) { return this.service.matchLost(user.id, id, body); }
  @Post(':id/return') return(@CurrentUser() user: any, @Param('id') id: string, @Body() body: LostFoundReturnDto) { return this.service.returnLost(user.id, id, body); }
  @Post(':id/dispose') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN') dispose(@CurrentUser() user: any, @Param('id') id: string, @Body() body: LostFoundDisposeDto) { return this.service.disposeLost(user.id, id, body); }
}

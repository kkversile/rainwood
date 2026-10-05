import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CashierShiftQueryDto, CloseCashierShiftDto, OpenCashierShiftDto } from './cashier-shifts.dto';
import { CashierShiftsService } from './cashier-shifts.service';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';

@Controller('cashier-shifts')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('cashier')
export class CashierShiftsController {
  constructor(private readonly service: CashierShiftsService) {}

  @Get('current')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS')
  current(@CurrentUser() user: any, @Query('hotelId') hotelId?: string) { return this.service.current(user.id, hotelId); }

  @Get()
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS')
  list(@CurrentUser() user: any, @Query() query: CashierShiftQueryDto) { return this.service.list(user.id, query); }

  @Post('open')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  open(@CurrentUser() user: any, @Body() body: OpenCashierShiftDto) { return this.service.open(user.id, body); }

  @Post(':id/close')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  close(@CurrentUser() user: any, @Param('id') id: string, @Body() body: CloseCashierShiftDto) { return this.service.close(user.id, id, body); }
}

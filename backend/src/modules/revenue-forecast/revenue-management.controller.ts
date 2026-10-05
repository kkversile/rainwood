import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { BookingCurveQueryDto } from './revenue-forecast.dto';
import { RevenueForecastService } from './revenue-forecast.service';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';

@Controller('revenue-management')
@UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
@RequireFeature('rateSimulator')
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
export class RevenueManagementController {
  constructor(private readonly service: RevenueForecastService) {}

  @Get('booking-curve')
  bookingCurve(@CurrentUser() user: any, @Query() query: BookingCurveQueryDto) { return this.service.bookingCurve(user.id, query); }
}

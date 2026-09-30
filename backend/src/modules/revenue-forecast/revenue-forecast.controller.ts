import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { RevenueForecastCaptureDto, RevenueForecastQueryDto } from './revenue-forecast.dto';
import { RevenueForecastService } from './revenue-forecast.service';

@Controller('revenue-forecast')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN')
export class RevenueForecastController {
  constructor(private readonly service: RevenueForecastService) {}

  @Get()
  forecast(@CurrentUser() user: any, @Query() query: RevenueForecastQueryDto) { return this.service.forecast(user.id, query); }

  @Post('snapshots')
  @Roles('SUPER_ADMIN')
  capture(@CurrentUser() user: any, @Body() body: RevenueForecastCaptureDto) { return this.service.capture(user.id, body); }
}

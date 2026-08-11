import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './reports.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION', 'VIEWER')
export class ReportsController {
  constructor(private service: ReportsService) {}
  @Get('dashboard') dashboard() { return this.service.dashboard(); }
  @Get('reservations') reservations(@Query() query: ReportQueryDto) { return this.service.reservations(query); }
  @Get('summary') summary(@Query() query: ReportQueryDto) { return this.service.summary(query); }
  @Get('expected-arrivals') expectedArrivals(@Query() query: ReportQueryDto) { return this.service.expectedArrivals(query); }
  @Get('arrivals') arrivals(@Query() query: ReportQueryDto) { return this.service.arrivals(query); }
  @Get('departures') departures(@Query() query: ReportQueryDto) { return this.service.departures(query); }
  @Get('payments') payments(@Query() query: ReportQueryDto) { return this.service.payments(query); }
  @Get('cancellations') cancellations(@Query() query: ReportQueryDto) { return this.service.cancellations(query); }
  @Get('reservations.csv') @Header('content-type', 'text/csv; charset=utf-8') export(@Query() query: ReportQueryDto) { return this.service.exportCsv(query); }
}

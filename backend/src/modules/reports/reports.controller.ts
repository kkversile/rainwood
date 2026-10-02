import { Controller, ForbiddenException, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { ReportQueryDto, RoomRackQueryDto } from './reports.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { getActorScope } from '../../common/role-scope';

@Controller('reports')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION', 'VIEWER')
export class ReportsController {
  constructor(private service: ReportsService) {}
  @Get('dashboard') async dashboard(@CurrentUser() user: any) { const scope = await getActorScope(this.service.prisma, user.id); const globalReporting = scope.isGlobal || ['ACCOUNTS', 'VIEWER'].includes(scope.role); return this.service.dashboard(globalReporting ? undefined : scope.hotelId!); }
  @Get('reservations') async reservations(@Query() query: ReportQueryDto, @CurrentUser() user: any) { return this.service.reservations(await this.scopedQuery(query, user)); }
  @Get('summary') async summary(@Query() query: ReportQueryDto, @CurrentUser() user: any) { return this.service.summary(await this.scopedQuery(query, user)); }
  @Get('room-rack') async roomRack(@Query() query: RoomRackQueryDto, @CurrentUser() user: any) { return this.service.roomRack(await this.scopedQuery(query, user) as RoomRackQueryDto); }
  @Get('expected-arrivals') async expectedArrivals(@Query() query: ReportQueryDto, @CurrentUser() user: any) { const scoped = await this.scopedQuery(query, user); return this.service.expectedArrivals(scoped, user); }
  @Get('arrivals') async arrivals(@Query() query: ReportQueryDto, @CurrentUser() user: any) { return this.service.arrivals(await this.scopedQuery(query, user)); }
  @Get('departures') async departures(@Query() query: ReportQueryDto, @CurrentUser() user: any) { return this.service.departures(await this.scopedQuery(query, user)); }
  @Get('payments') async payments(@Query() query: ReportQueryDto, @CurrentUser() user: any) { return this.service.payments(await this.scopedQuery(query, user)); }
  @Get('cancellations') async cancellations(@Query() query: ReportQueryDto, @CurrentUser() user: any) { return this.service.cancellations(await this.scopedQuery(query, user)); }
  @Get('reservations.csv') @Header('content-type', 'text/csv; charset=utf-8') async export(@Query() query: ReportQueryDto, @CurrentUser() user: any) { return this.service.exportCsv(await this.scopedQuery(query, user)); }

  private async scopedQuery(query: ReportQueryDto, user: any) {
    const scope = await getActorScope(this.service.prisma, user.id);
    if (scope.isGlobal || ['ACCOUNTS', 'VIEWER'].includes(scope.role)) return query;
    const requested = [...(query.hotelIds ?? []), ...(query.hotelId ? [query.hotelId] : [])];
    if (requested.some((hotelId) => hotelId !== scope.hotelId)) throw new ForbiddenException('Hotel scope does not allow this report.');
    return { ...query, hotelId: scope.hotelId!, hotelIds: [scope.hotelId!] };
  }
}

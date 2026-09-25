import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CancellationDto, CreateReservationDto, ManualReservationDto, ModificationDto, PayDueMilestonesDto, RatePlanListQueryDto, ReconfirmationDto, ReservationListQueryDto } from './reservations.dto';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { OptionalJwtAuthGuard } from '../../common/optional-jwt-auth.guard';
import { ActiveAgentGuard } from '../../common/active-agent.guard';

@Controller('reservations')
export class ReservationsController {
  constructor(private s: ReservationsService) {}

  @Post('from-hold/:token')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  create(@Param('token') token: string, @Body() body: CreateReservationDto, @CurrentUser() user?: any) {
    const source = body.source ?? 'WEBSITE';
    if (source !== 'WEBSITE' && !(source === 'AGENT' && user?.role === 'AGENT')) throw new BadRequestException('Public reservations must use the WEBSITE source');
    return this.s.createFromHold(token, body, user ? { id: user.id, role: user.role } : undefined);
  }

  @Post('manual')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'AGENT' as any)
  manual(@Body() body: ManualReservationDto, @CurrentUser() user: any) {
    const { holdToken, ...reservation } = body;
    return this.s.createFromHold(holdToken, reservation, { id: user.id, role: user.role });
  }

  @Get()
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  list(@Query() query: ReservationListQueryDto) { return this.s.list(query); }

  @Get('mine')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('AGENT' as any)
  mine(@CurrentUser() user: any) { return this.s.listForUser(user.id); }

  @Get('mine/rate-plans')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('AGENT' as any)
  mineRatePlans(@CurrentUser() user: any, @Query() query: RatePlanListQueryDto) { return this.s.listRatePlansForUser(user.id, query.from, query.to); }

  @Get(':reference')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  get(@Param('reference') reference: string) { return this.s.get(reference); }

  @Get(':reference/detail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  detail(@Param('reference') reference: string) { return this.s.get(reference, true); }

  @Post(':reference/pay-due-milestones')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('AGENT' as any)
  payDueMilestones(@Param('reference') reference: string, @Body() body: PayDueMilestonesDto, @CurrentUser() user: any) {
    return this.s.payDueMilestones(reference, body.idempotencyKey, { id: user.id, role: user.role });
  }

  @Post(':reference/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION')
  cancel(@Param('reference') reference: string, @Body() body: CancellationDto, @CurrentUser() user: any) { return this.s.cancel(reference, body, user); }

  @Patch(':reference')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION')
  modify(@Param('reference') reference: string, @Body() body: ModificationDto, @CurrentUser() user: any) { return this.s.modify(reference, body, user); }

  @Patch(':reference/reconfirmation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION')
  reconfirmation(@Param('reference') reference: string, @Body() body: ReconfirmationDto, @CurrentUser() user: any) { return this.s.setReconfirmation(reference, body.reconfirmed, user); }
}

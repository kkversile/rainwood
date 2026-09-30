import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CancellationDto, CheckInDto, CheckOutDto, CheckoutPaymentDto, CreateReservationDto, FolioChargeDto, ManualReservationDto, ModificationDto, PayDueMilestonesDto, RatePlanListQueryDto, ReconfirmationDto, ReservationListQueryDto, RoomChangeDto, VoidFolioChargeDto } from './reservations.dto';
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
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'AGENT' as any)
  manual(@Body() body: ManualReservationDto, @CurrentUser() user: any) {
    const { holdToken, ...reservation } = body;
    return this.s.createFromHold(holdToken, reservation, { id: user.id, role: user.role });
  }

  @Get()
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  list(@Query() query: ReservationListQueryDto, @CurrentUser() user: any) { return this.s.list(query, user?.id); }

  @Get('mine')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('AGENT' as any)
  mine(@CurrentUser() user: any) { return this.s.listForUser(user.id); }

  @Get('mine/rate-plans')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('AGENT' as any)
  mineRatePlans(@CurrentUser() user: any, @Query() query: RatePlanListQueryDto) { return this.s.listRatePlansForUser(user.id, query.from, query.to); }

  @Get('in-house')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  inHouse(@Query('hotelId') hotelId?: string, @CurrentUser() user?: any) { return this.s.inHouse(hotelId, user?.id); }

  @Get(':reference')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  get(@Param('reference') reference: string) { return this.s.get(reference); }

  @Get(':reference/detail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  detail(@Param('reference') reference: string, @CurrentUser() user: any) { return this.s.get(reference, true, user?.role, user?.id); }

  @Get(':reference/available-rooms')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  availableRooms(@Param('reference') reference: string, @CurrentUser() user: any) { return this.s.availableRooms(reference, user?.id); }

  @Post(':reference/check-in')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  checkIn(@Param('reference') reference: string, @Body() body: CheckInDto, @CurrentUser() user: any) { return this.s.checkIn(reference, body, user); }

  @Post(':reference/room-change')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  roomChange(@Param('reference') reference: string, @Body() body: RoomChangeDto, @CurrentUser() user: any) { return this.s.roomChange(reference, body, user); }

  @Post(':reference/check-out')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  checkOut(@Param('reference') reference: string, @Body() body: CheckOutDto, @CurrentUser() user: any) { return this.s.checkOut(reference, body, user); }

  @Get(':reference/checkout-preview')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  checkoutPreview(@Param('reference') reference: string, @CurrentUser() user: any) { return this.s.checkoutPreview(reference, user?.id); }

  @Post(':reference/checkout-payment')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  checkoutPayment(@Param('reference') reference: string, @Body() body: CheckoutPaymentDto, @CurrentUser() user: any) { return this.s.recordCheckoutPayment(reference, body, user); }

  @Get(':reference/final-folio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  finalFolio(@Param('reference') reference: string, @CurrentUser() user: any) { return this.s.finalFolio(reference, user?.id); }

  @Get(':reference/folio')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  folio(@Param('reference') reference: string, @CurrentUser() user: any) { return this.s.getFolio(reference, user?.id); }

  @Post(':reference/folio/charges')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  addFolioCharge(@Param('reference') reference: string, @Body() body: FolioChargeDto, @CurrentUser() user: any) { return this.s.postFolioCharge(reference, body, user); }

  @Post(':reference/folio/charges/:chargeId/void')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  voidFolioCharge(@Param('reference') reference: string, @Param('chargeId') chargeId: string, @Body() body: VoidFolioChargeDto, @CurrentUser() user: any) { return this.s.voidFolioCharge(reference, chargeId, body, user); }

  @Post(':reference/pay-due-milestones')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('AGENT' as any)
  payDueMilestones(@Param('reference') reference: string, @Body() body: PayDueMilestonesDto, @CurrentUser() user: any) {
    return this.s.payDueMilestones(reference, body.idempotencyKey, { id: user.id, role: user.role });
  }

  @Post(':reference/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  cancel(@Param('reference') reference: string, @Body() body: CancellationDto, @CurrentUser() user: any) { return this.s.cancel(reference, body, user); }

  @Patch(':reference')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  modify(@Param('reference') reference: string, @Body() body: ModificationDto, @CurrentUser() user: any) { return this.s.modify(reference, body, user); }

  @Patch(':reference/reconfirmation')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  reconfirmation(@Param('reference') reference: string, @Body() body: ReconfirmationDto, @CurrentUser() user: any) { return this.s.setReconfirmation(reference, body.reconfirmed, user); }
}

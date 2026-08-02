import { BadRequestException, Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ReservationsService } from './reservations.service';
import { CancellationDto, CreateReservationDto, ManualReservationDto, ModificationDto, ReservationListQueryDto } from './reservations.dto';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';

@Controller('reservations')
export class ReservationsController {
  constructor(private s: ReservationsService) {}

  @Post('from-hold/:token')
  create(@Param('token') token: string, @Body() body: CreateReservationDto) {
    if ((body.source ?? 'WEBSITE') !== 'WEBSITE') throw new BadRequestException('Public reservations must use the WEBSITE source');
    return this.s.createFromHold(token, body);
  }

  @Post('manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION')
  manual(@Body() body: ManualReservationDto, @CurrentUser() user: any) {
    const { holdToken, ...reservation } = body;
    return this.s.createFromHold(holdToken, reservation, { id: user.id });
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  list(@Query() query: ReservationListQueryDto) { return this.s.list(query); }

  @Get(':reference')
  get(@Param('reference') reference: string) { return this.s.get(reference); }

  @Get(':reference/detail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS', 'VIEWER')
  detail(@Param('reference') reference: string) { return this.s.get(reference, true); }

  @Post(':reference/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION')
  cancel(@Param('reference') reference: string, @Body() body: CancellationDto, @CurrentUser() user: any) { return this.s.cancel(reference, body, user); }

  @Patch(':reference')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION')
  modify(@Param('reference') reference: string, @Body() body: ModificationDto, @CurrentUser() user: any) { return this.s.modify(reference, body, user); }
}

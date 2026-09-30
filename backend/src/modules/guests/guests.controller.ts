import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreateGuestNoteDto, GuestListQueryDto, UpdateGuestProfileDto } from './guests.dto';
import { GuestsService } from './guests.service';

@Controller('guests')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
export class GuestsController {
  constructor(private readonly guests: GuestsService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: GuestListQueryDto) { return this.guests.list(user.id, query); }
  @Get('match') match(@CurrentUser() user: any, @Query('mobile') mobile?: string, @Query('email') email?: string) { return this.guests.match(user.id, mobile, email); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string, @Query('hotelId') hotelId?: string) { return this.guests.detail(user.id, id, hotelId); }
  @Patch(':id') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: UpdateGuestProfileDto) { return this.guests.update(user.id, id, body); }
  @Post(':id/notes') addNote(@CurrentUser() user: any, @Param('id') id: string, @Body() body: CreateGuestNoteDto) { return this.guests.addNote(user.id, id, body); }
}

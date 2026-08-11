import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { HoldsService } from './holds.service';
import { HoldCreateDto } from './holds.dto';
import { OptionalJwtAuthGuard } from '../../common/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';

@Controller('holds')
export class HoldsController {
  constructor(private s: HoldsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  create(@Body() body: HoldCreateDto, @CurrentUser() user?: any) { return this.s.create(body, user?.role === 'AGENT' ? user.id : undefined); }

  @Get(':token')
  get(@Param('token') token: string) { return this.s.get(token); }
}

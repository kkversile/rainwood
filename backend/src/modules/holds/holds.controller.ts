import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { HoldsService } from './holds.service';
import { HoldCreateDto } from './holds.dto';
import { OptionalJwtAuthGuard } from '../../common/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { ActiveAgentGuard } from '../../common/active-agent.guard';

@Controller('holds')
export class HoldsController {
  constructor(private s: HoldsService) {}

  @Post()
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  create(@Body() body: HoldCreateDto, @CurrentUser() user?: any) { return this.s.create(body, user?.role === 'AGENT' ? user.id : undefined); }

  @Get(':token')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  get(@Param('token') token: string, @CurrentUser() user?: any) { return this.s.get(token, user ? { id: user.id, role: user.role } : undefined); }
}

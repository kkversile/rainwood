import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { HoldsService } from './holds.service';
import { HoldCreateDto } from './holds.dto';

@Controller('holds')
export class HoldsController {
  constructor(private s: HoldsService) {}

  @Post()
  create(@Body() body: HoldCreateDto) { return this.s.create(body); }

  @Get(':token')
  get(@Param('token') token: string) { return this.s.get(token); }
}

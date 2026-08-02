import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { HotelContentDto, HotelUpdateDto } from './hotels.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('hotels')
export class HotelsController {
  constructor(private readonly service: HotelsService) {}

  @Get()
  list() { return this.service.list(); }

  @Get(':slug')
  detail(@Param('slug') slug: string) { return this.service.detail(slug); }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  create(@Body() body: HotelContentDto) { return this.service.create(body); }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN')
  update(@Param('id') id: string, @Body() body: HotelUpdateDto) { return this.service.update(id, body); }
}

import { Controller, Get, Query } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto } from './availability.dto';

@Controller('availability')
export class AvailabilityController {
  constructor(private service: AvailabilityService) {}

  @Get('search')
  search(@Query() query: AvailabilityQueryDto) {
    return this.service.search(query);
  }
}

import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AvailabilityService } from './availability.service';
import { AvailabilityQueryDto } from './availability.dto';
import { OptionalJwtAuthGuard } from '../../common/optional-jwt-auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { ActiveAgentGuard } from '../../common/active-agent.guard';

@Controller('availability')
export class AvailabilityController {
  constructor(private service: AvailabilityService) {}

  @Get('search')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  search(@Query() query: AvailabilityQueryDto, @CurrentUser() user?: any) {
    return this.service.search(query, user?.role === 'AGENT' ? user.id : undefined);
  }
}

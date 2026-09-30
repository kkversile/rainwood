import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { InquiryConvertDto, InquiryCreateDto, InquiryFollowUpDto, InquiryListQueryDto, InquiryLostDto, InquiryQuoteDto, InquiryUpdateDto } from './inquiries.dto';
import { InquiriesService } from './inquiries.service';

@Controller('inquiries')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
export class InquiriesController {
  constructor(private readonly service: InquiriesService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: InquiryListQueryDto) { return this.service.list(user.id, query); }
  @Get('report') report(@CurrentUser() user: any, @Query() query: InquiryListQueryDto) { return this.service.report(user.id, query); }
  @Post() create(@CurrentUser() user: any, @Body() body: InquiryCreateDto) { return this.service.create(user.id, body); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string) { return this.service.detail(user.id, id); }
  @Patch(':id') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: InquiryUpdateDto) { return this.service.update(user.id, id, body); }
  @Post(':id/follow-up') followUp(@CurrentUser() user: any, @Param('id') id: string, @Body() body: InquiryFollowUpDto) { return this.service.followUp(user.id, id, body); }
  @Post(':id/quote') quote(@CurrentUser() user: any, @Param('id') id: string, @Body() body: InquiryQuoteDto) { return this.service.quote(user.id, id, body); }
  @Post(':id/mark-lost') lost(@CurrentUser() user: any, @Param('id') id: string, @Body() body: InquiryLostDto) { return this.service.markLost(user.id, id, body); }
  @Post(':id/convert') convert(@CurrentUser() user: any, @Param('id') id: string, @Body() body: InquiryConvertDto) { return this.service.convert(user.id, id, body); }
}

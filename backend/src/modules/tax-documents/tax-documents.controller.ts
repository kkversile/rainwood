import { Body, Controller, Get, Header, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { CreditNoteDto, TaxInvoiceCustomerDto, TaxInvoiceQueryDto, TaxProfileDto, TaxRuleDto, TdsDto, TdsReverseDto } from './tax-documents.dto';
import { TaxDocumentsService } from './tax-documents.service';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class TaxDocumentsController {
  constructor(private readonly service: TaxDocumentsService) {}

  @Get('tax-settings') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') settings(@CurrentUser() user: any, @Query('hotelId') hotelId?: string) { return this.service.settings(user.id, hotelId); }
  @Put('tax-settings/profile') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') profile(@CurrentUser() user: any, @Body() body: TaxProfileDto) { return this.service.saveProfile(user.id, body); }
  @Post('tax-settings/rules') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') rule(@CurrentUser() user: any, @Body() body: TaxRuleDto) { return this.service.createRule(user.id, body); }

  @Get('tax-invoices') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION') list(@CurrentUser() user: any, @Query() query: TaxInvoiceQueryDto) { return this.service.list(user.id, query); }
  @Get('tax-invoices/:id') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION') detail(@CurrentUser() user: any, @Param('id') id: string) { return this.service.detail(user.id, id); }
  @Get('tax-invoices/:id/print') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION') @Header('content-type', 'text/html; charset=utf-8') print(@CurrentUser() user: any, @Param('id') id: string) { return this.service.print(user.id, id); }
  @Post('reservations/:reference/tax-invoice/preview') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION') preview(@CurrentUser() user: any, @Param('reference') reference: string, @Body() body: TaxInvoiceCustomerDto) { return this.service.preview(user.id, reference, body ?? {}); }
  @Post('reservations/:reference/tax-invoice/issue') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') issue(@CurrentUser() user: any, @Param('reference') reference: string, @Body() body: TaxInvoiceCustomerDto) { return this.service.issue(user.id, reference, body ?? {}); }
  @Get('reservations/:reference/tax-invoice') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION') byReservation(@CurrentUser() user: any, @Param('reference') reference: string) { return this.service.byReservation(user.id, reference); }
  @Post('tax-invoices/:id/cancel') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') cancel(@CurrentUser() user: any, @Param('id') id: string, @Body('reason') reason: string) { return this.service.cancel(user.id, id, reason); }
  @Post('tax-invoices/:id/credit-notes') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') creditNote(@CurrentUser() user: any, @Param('id') id: string, @Body() body: CreditNoteDto) { return this.service.creditNote(user.id, id, body); }
  @Post('tax-invoices/:id/tds') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') tds(@CurrentUser() user: any, @Param('id') id: string, @Body() body: TdsDto) { return this.service.recordTds(user.id, id, body); }
  @Post('tds/:id/reverse') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS') reverseTds(@CurrentUser() user: any, @Param('id') id: string, @Body() body: TdsReverseDto) { return this.service.reverseTds(user.id, id, body); }
  @Get('corporates/:id/statutory-receivables') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION') receivables(@CurrentUser() user: any, @Param('id') id: string) { return this.service.statutoryReceivables(user.id, id); }

  @Get('reports/tax-invoices') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION', 'VIEWER') reportInvoices(@CurrentUser() user: any) { return this.service.reports(user.id, 'tax-invoices'); }
  @Get('reports/credit-notes') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION', 'VIEWER') reportCredits(@CurrentUser() user: any) { return this.service.reports(user.id, 'credit-notes'); }
  @Get('reports/tds') @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS', 'RESERVATION', 'VIEWER') reportTds(@CurrentUser() user: any) { return this.service.reports(user.id, 'tds'); }
}

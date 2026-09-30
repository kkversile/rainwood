import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { ExpenseCategoryDto, ExpenseCreateDto, ExpenseListQueryDto, ExpenseUpdateDto, VendorDto } from './expenses.dto';
import { ExpensesService } from './expenses.service';

@Controller('expenses')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS')
export class ExpensesController {
  constructor(private readonly service: ExpensesService) {}
  @Get() list(@CurrentUser() user: any, @Query() query: ExpenseListQueryDto) { return this.service.list(user.id, query); }
  @Get('report') report(@CurrentUser() user: any, @Query() query: ExpenseListQueryDto) { return this.service.report(user.id, query); }
  @Get('categories') categories(@CurrentUser() user: any, @Query('hotelId') hotelId?: string) { return this.service.categories(user.id, hotelId); }
  @Post('categories') createCategory(@CurrentUser() user: any, @Body() body: ExpenseCategoryDto) { return this.service.createCategory(user.id, body); }
  @Patch('categories/:id') updateCategory(@CurrentUser() user: any, @Param('id') id: string, @Body() body: ExpenseCategoryDto) { return this.service.updateCategory(user.id, id, body); }
  @Get('vendors') vendors(@CurrentUser() user: any, @Query('hotelId') hotelId?: string) { return this.service.vendors(user.id, hotelId); }
  @Post('vendors') createVendor(@CurrentUser() user: any, @Body() body: VendorDto) { return this.service.createVendor(user.id, body); }
  @Patch('vendors/:id') updateVendor(@CurrentUser() user: any, @Param('id') id: string, @Body() body: VendorDto) { return this.service.updateVendor(user.id, id, body); }
  @Get(':id') detail(@CurrentUser() user: any, @Param('id') id: string) { return this.service.detail(user.id, id); }
  @Post() create(@CurrentUser() user: any, @Body() body: ExpenseCreateDto) { return this.service.create(user.id, body); }
  @Patch(':id') update(@CurrentUser() user: any, @Param('id') id: string, @Body() body: ExpenseUpdateDto) { return this.service.update(user.id, id, body); }
  @Post(':id/submit') submit(@CurrentUser() user: any, @Param('id') id: string) { return this.service.submit(user.id, id); }
  @Post(':id/approve') approve(@CurrentUser() user: any, @Param('id') id: string) { return this.service.approve(user.id, id); }
  @Post(':id/mark-paid') paid(@CurrentUser() user: any, @Param('id') id: string) { return this.service.markPaid(user.id, id); }
  @Post(':id/cancel') cancel(@CurrentUser() user: any, @Param('id') id: string) { return this.service.cancel(user.id, id); }
}

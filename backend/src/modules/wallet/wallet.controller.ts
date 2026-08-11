import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { RechargeWalletDto } from './wallet.dto';
import { WalletService } from './wallet.service';

@Controller('wallet')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('AGENT' as any)
export class WalletController {
  constructor(private service: WalletService) {}
  @Get() get(@CurrentUser() user: any) { return this.service.get(user.id); }
  @Post('recharge') recharge(@CurrentUser() user: any, @Body() body: RechargeWalletDto) { return this.service.recharge(user.id, body); }
}

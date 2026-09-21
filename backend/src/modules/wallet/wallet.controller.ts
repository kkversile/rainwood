import { BadRequestException, Body, Controller, Get, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { Roles } from '../../common/roles.decorator';
import { RolesGuard } from '../../common/roles.guard';
import { RechargeWalletDto } from './wallet.dto';
import { WalletService } from './wallet.service';
import { PaymentsService } from '../payments/payments.service';
import { ActiveAgentGuard } from '../../common/active-agent.guard';

@Controller('wallet')
@UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
@Roles('AGENT' as any)
export class WalletController {
  constructor(private service: WalletService, private payments: PaymentsService) {}
  @Get() get(@CurrentUser() user: any) { return this.service.get(user.id); }
  @Post('recharge') recharge(@CurrentUser() user: any, @Body() body: RechargeWalletDto) { return this.service.recharge(user.id, body); }
  @Post('recharge/order') rechargeOrder(@CurrentUser() user: any, @Headers('idempotency-key') key: string, @Body() body: RechargeWalletDto) { return this.payments.createWalletRechargeOrder(user.id, body.amount, key); }
  @Post('recharge/mock-complete') mockComplete(@CurrentUser() user: any, @Body() body: { attemptId?: string; status?: 'SUCCESS' | 'FAILED' }) { if (!body.attemptId || !body.status) throw new BadRequestException('attemptId and status are required'); return this.payments.mockCompleteWalletRecharge(user.id, body.attemptId, body.status); }
  @Get('recharge/attempts/:attemptId') rechargeAttempt(@CurrentUser() user: any, @Param('attemptId') attemptId: string) { return this.payments.getWalletRechargeAttempt(user.id, attemptId); }
}

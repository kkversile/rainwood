import { Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ManualPaymentDto, MockCompletionDto, PaymentOrderDto, RazorpayVerifyPaymentDto, VerifyPaymentDto } from './payments.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../common/optional-jwt-auth.guard';
import { ActiveAgentGuard } from '../../common/active-agent.guard';
import { FeatureGuard } from '../features/feature.guard';
import { RequireFeature } from '../features/require-feature.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private s: PaymentsService) {}

  @Get('wallet-recharge/offline')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('payments')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS')
  offlineWalletRecharges() { return this.s.listOfflineWalletRecharges(); }

  @Post('wallet-recharge/offline/:attemptId/verify')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('payments')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS')
  verifyOfflineWalletRecharge(@Param('attemptId') attemptId: string, @CurrentUser() user: any) { return this.s.verifyOfflineWalletRecharge(attemptId, user.id); }

  @Post(':reference/order')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  order(@Param('reference') reference: string, @Headers('idempotency-key') key: string, @Body() body?: PaymentOrderDto) { return this.s.createOrder(reference, key, body?.amount); }

  @Post(':reference/verify')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  verifyCheckout(@Param('reference') reference: string, @Body() body: RazorpayVerifyPaymentDto) { return this.s.verifyCheckoutPayment(reference, body); }

  @Post(':reference/manual')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('payments')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'RESERVATION')
  manual(@Param('reference') reference: string, @Body() body: ManualPaymentDto, @CurrentUser() user: any) { return this.s.manual(reference, body, user.id); }

  @Post(':reference/offline')
  @UseGuards(JwtAuthGuard, ActiveAgentGuard, RolesGuard)
  @Roles('AGENT' as any)
  offline(@Param('reference') reference: string, @Body() body: ManualPaymentDto, @CurrentUser() user: any) { return this.s.submitOffline(reference, body, user.id); }

  @Post(':reference/manual/:paymentId/verify')
  @UseGuards(JwtAuthGuard, RolesGuard, FeatureGuard)
  @RequireFeature('payments')
  @Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS')
  verify(@Param('paymentId') paymentId: string, @Body() _body: VerifyPaymentDto, @CurrentUser() user: any) { return this.s.verify(paymentId, user.id); }

  @Post(':reference/mock-complete')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  mockComplete(@Param('reference') reference: string, @Body() body: MockCompletionDto) { return this.s.mockComplete(reference, body); }

  @Post('webhooks/:provider')
  webhook(@Param('provider') provider: string, @Req() request: any) { return this.s.webhook(provider, request.rawBody ?? Buffer.from(JSON.stringify(request.body)), request.headers, request.body); }
}

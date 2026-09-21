import { Body, Controller, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ManualPaymentDto, MockCompletionDto, VerifyPaymentDto } from './payments.dto';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { OptionalJwtAuthGuard } from '../../common/optional-jwt-auth.guard';
import { ActiveAgentGuard } from '../../common/active-agent.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private s: PaymentsService) {}

  @Post(':reference/order')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  order(@Param('reference') reference: string, @Headers('idempotency-key') key: string) { return this.s.createOrder(reference, key); }

  @Post(':reference/manual')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'RESERVATION', 'ACCOUNTS')
  manual(@Param('reference') reference: string, @Body() body: ManualPaymentDto, @CurrentUser() user: any) { return this.s.manual(reference, body, user.id); }

  @Post(':reference/manual/:paymentId/verify')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN', 'ADMIN', 'ACCOUNTS')
  verify(@Param('paymentId') paymentId: string, @Body() _body: VerifyPaymentDto, @CurrentUser() user: any) { return this.s.verify(paymentId, user.id); }

  @Post(':reference/mock-complete')
  @UseGuards(OptionalJwtAuthGuard, ActiveAgentGuard)
  mockComplete(@Param('reference') reference: string, @Body() body: MockCompletionDto) { return this.s.mockComplete(reference, body); }

  @Post('webhooks/:provider')
  webhook(@Param('provider') provider: string, @Req() request: any) { return this.s.webhook(provider, request.rawBody ?? Buffer.from(JSON.stringify(request.body)), request.headers, request.body); }
}

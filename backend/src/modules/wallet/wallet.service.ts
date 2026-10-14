import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { MailService } from '../../common/mail.service';
import { RechargeWalletDto } from './wallet.dto';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService, private config: ConfigService, private mail?: MailService) {}
  async get(agentId: string) {
    const wallet = await this.prisma.agentWallet.upsert({ where: { agentId }, update: {}, create: { agentId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 100 } } });
    const pendingOfflineRecharges = await this.prisma.walletRechargeAttempt.findMany({ where: { walletId: wallet.id, provider: 'MANUAL', status: 'PENDING' }, select: { id: true, amount: true, currency: true, createdAt: true, providerPayload: true }, orderBy: { createdAt: 'desc' } });
    return { ...wallet, pendingOfflineRecharges };
  }
  async recharge(agentId: string, body: RechargeWalletDto) {
    if (this.config.get('NODE_ENV', 'development') === 'production' || this.config.get('PAYMENT_PROVIDER', 'mock').toLowerCase() !== 'mock') throw new BadRequestException('Wallet recharge must use the verified payment gateway');
    if (!Number.isFinite(body.amount) || body.amount <= 0) throw new BadRequestException('Recharge amount must be positive');
    const wallet = await this.prisma.$transaction(async (tx) => {
      const wallet = await tx.agentWallet.upsert({ where: { agentId }, update: {}, create: { agentId } });
      const updated = await tx.agentWallet.update({ where: { id: wallet.id }, data: { balance: { increment: body.amount } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'RECHARGE', amount: body.amount, balanceAfter: updated.balance, reference: body.reference || `DEMO-RECHARGE-${Date.now()}`, description: 'Agent wallet recharge' } });
      return tx.agentWallet.findUniqueOrThrow({ where: { id: wallet.id }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 100 } } });
    });
    if (this.mail) {
      const agent = await this.prisma.user.findUnique({ where: { id: agentId }, select: { email: true } });
      if (agent?.email) await this.mail.queue({ to: agent.email, subject: 'RainWood wallet recharge successful', text: `Your wallet was credited with INR ${Number(body.amount).toFixed(2)}. Your new balance is INR ${Number(wallet.balance).toFixed(2)}.` }, `wallet-recharge:${wallet.id}:${body.reference || body.amount}:agent-success`, 'Wallet', wallet.id);
    }
    return wallet;
  }
}

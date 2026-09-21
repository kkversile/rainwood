import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { RechargeWalletDto } from './wallet.dto';

@Injectable()
export class WalletService {
  constructor(private prisma: PrismaService, private config: ConfigService) {}
  async get(agentId: string) { return this.prisma.agentWallet.upsert({ where: { agentId }, update: {}, create: { agentId }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 100 } } }); }
  async recharge(agentId: string, body: RechargeWalletDto) {
    if (this.config.get('NODE_ENV', 'development') === 'production' || this.config.get('PAYMENT_PROVIDER', 'mock').toLowerCase() !== 'mock') throw new BadRequestException('Wallet recharge must use the verified payment gateway');
    if (!Number.isFinite(body.amount) || body.amount <= 0) throw new BadRequestException('Recharge amount must be positive');
    return this.prisma.$transaction(async (tx) => {
      const wallet = await tx.agentWallet.upsert({ where: { agentId }, update: {}, create: { agentId } });
      const updated = await tx.agentWallet.update({ where: { id: wallet.id }, data: { balance: { increment: body.amount } } });
      await tx.walletTransaction.create({ data: { walletId: wallet.id, type: 'RECHARGE', amount: body.amount, balanceAfter: updated.balance, reference: body.reference || `DEMO-RECHARGE-${Date.now()}`, description: 'Agent wallet recharge' } });
      return tx.agentWallet.findUniqueOrThrow({ where: { id: wallet.id }, include: { transactions: { orderBy: { createdAt: 'desc' }, take: 100 } } });
    });
  }
}

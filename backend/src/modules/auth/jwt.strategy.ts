import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma.service';
import { isAgentPendingOnboarding } from '../../common/agent-access';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(c: ConfigService, private p: PrismaService) {
    super({ jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), secretOrKey: c.getOrThrow('JWT_ACCESS_SECRET') });
  }

  async validate(v: any) {
    const user = await this.p.user.findUnique({ where: { id: v.sub } });
    if (!user) throw new UnauthorizedException();
    if ((!user.active && !isAgentPendingOnboarding(user)) || user.tokenVersion !== v.tv) throw new UnauthorizedException();
    return { id: user.id, email: user.email, name: user.name, role: user.role, active: user.active, agentPaymentPolicy: user.agentPaymentPolicy, bookingPaymentPercent: user.bookingPaymentPercent };
  }
}

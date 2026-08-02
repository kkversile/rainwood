import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { randomToken, sha256 } from '../../common/security';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private p: PrismaService, private jwt: JwtService, private c: ConfigService) {}

  async login(email: string, password: string, meta: { ip?: string; ua?: string } = {}) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.p.user.findUnique({ where: { email: normalizedEmail } });
    const locked = user?.lockedUntil && user.lockedUntil > new Date();
    const valid = Boolean(user?.active && !locked && user && await bcrypt.compare(password, user.passwordHash));
    if (!user || !valid) {
      if (user) {
        const failedLoginCount = user.failedLoginCount + 1;
        await this.p.user.update({
          where: { id: user.id },
          data: { failedLoginCount, lockedUntil: failedLoginCount >= 5 ? new Date(Date.now() + 15 * 60_000) : null },
        });
      }
      await this.p.auditLog.create({ data: { action: 'AUTH_LOGIN_FAILED', entityType: 'User', entityId: user?.id, ipAddress: meta.ip, userAgent: meta.ua } });
      throw new UnauthorizedException('Invalid credentials');
    }
    const familyId = randomUUID();
    const result = await this.p.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { failedLoginCount: 0, lockedUntil: null } });
      return this.issue(tx, user, familyId, meta);
    });
    await this.p.auditLog.create({ data: { actorUserId: user.id, action: 'AUTH_LOGIN_SUCCEEDED', entityType: 'User', entityId: user.id, ipAddress: meta.ip, userAgent: meta.ua } });
    return result;
  }

  private async issue(tx: Prisma.TransactionClient, user: any, familyId: string, meta: { ip?: string; ua?: string }) {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role, tv: user.tokenVersion },
      { secret: this.c.getOrThrow('JWT_ACCESS_SECRET'), expiresIn: this.c.get('JWT_ACCESS_EXPIRES_IN', this.c.get('JWT_ACCESS_TTL', '15m')) },
    );
    const raw = randomToken();
    const days = Number(this.c.get('JWT_REFRESH_EXPIRES_DAYS', this.c.get('JWT_REFRESH_TTL_DAYS', 30)));
    await tx.refreshToken.create({ data: { userId: user.id, tokenHash: sha256(raw), familyId, expiresAt: new Date(Date.now() + days * 86_400_000), ipAddress: meta.ip, userAgent: meta.ua } });
    return { accessToken, refreshToken: raw, user: { id: user.id, email: user.email, name: user.name, role: user.role } };
  }

  async refresh(raw: string, meta: { ip?: string; ua?: string } = {}) {
    if (!raw) throw new UnauthorizedException('Refresh token invalid');
    const token = await this.p.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    if (!token || token.revokedAt || token.expiresAt <= new Date() || !token.user.active) {
      if (token) await this.p.refreshToken.updateMany({ where: { familyId: token.familyId, revokedAt: null }, data: { revokedAt: new Date() } });
      await this.p.auditLog.create({ data: { actorUserId: token?.userId, action: 'AUTH_REFRESH_REUSE_DETECTED', entityType: 'RefreshToken', entityId: token?.id, ipAddress: meta.ip, userAgent: meta.ua } });
      throw new UnauthorizedException('Refresh token invalid');
    }
    const result = await this.p.$transaction(async (tx) => {
      const next = await this.issue(tx, token.user, token.familyId, meta);
      await tx.refreshToken.update({ where: { id: token.id }, data: { revokedAt: new Date(), replacedById: (await tx.refreshToken.findUnique({ where: { tokenHash: sha256(next.refreshToken) } }))?.id } });
      return next;
    });
    await this.p.auditLog.create({ data: { actorUserId: token.userId, action: 'AUTH_REFRESH_ROTATED', entityType: 'RefreshToken', entityId: token.id, ipAddress: meta.ip, userAgent: meta.ua } });
    return result;
  }

  async logout(raw: string | undefined, allDevices = false, userId?: string) {
    if (allDevices && userId) {
      await this.p.$transaction([
        this.p.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
        this.p.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
      ]);
    } else if (raw) {
      await this.p.refreshToken.updateMany({ where: { tokenHash: sha256(raw), revokedAt: null }, data: { revokedAt: new Date() } });
    }
    if (userId) await this.p.auditLog.create({ data: { actorUserId: userId, action: allDevices ? 'AUTH_LOGOUT_ALL' : 'AUTH_LOGOUT', entityType: 'User', entityId: userId } });
    return { ok: true };
  }
}

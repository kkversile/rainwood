import { BadRequestException, ConflictException, Injectable, Logger, Optional, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import bcrypt from 'bcryptjs';
import { randomInt, randomUUID } from 'crypto';
import { randomToken, sha256 } from '../../common/security';
import { isAgentPendingOnboarding } from '../../common/agent-access';
import { MailService } from '../../common/mail.service';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(private p: PrismaService, private jwt: JwtService, private c: ConfigService, @Optional() private mail?: MailService) {}

  async me(userId: string) {
    const user = await this.p.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, role: true, active: true, staffHotelId: true, staffDepartment: true, jobTitle: true, staffHotel: { select: { id: true, name: true, code: true, city: true, active: true } } } });
    if (!user) throw new UnauthorizedException('Session user not found');
    return { user };
  }

  async registerAgent(profile: { companyName: string; contactPerson: string; mobile: string; gstin?: string; place?: string; addressLine1: string; addressLine2?: string; state?: string; pinCode?: string; additionalInformation?: string }, email: string, password: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const passwordHash = await bcrypt.hash(password, 12);
    try {
      const user = await this.p.user.create({ data: { name: profile.contactPerson.trim(), companyName: profile.companyName.trim(), contactPerson: profile.contactPerson.trim(), mobile: profile.mobile.trim(), gstin: profile.gstin?.trim() || undefined, place: profile.place?.trim() || undefined, addressLine1: profile.addressLine1.trim(), addressLine2: profile.addressLine2?.trim() || undefined, state: profile.state?.trim() || undefined, pinCode: profile.pinCode?.trim() || undefined, additionalInformation: profile.additionalInformation?.trim() || undefined, email: normalizedEmail, passwordHash, role: 'AGENT' as any, active: false, emailVerifiedAt: null }, select: { id: true, email: true, name: true, companyName: true, contactPerson: true, mobile: true, gstin: true, place: true, addressLine1: true, addressLine2: true, state: true, pinCode: true, additionalInformation: true, role: true, active: true, emailVerifiedAt: true } });
      await this.p.auditLog.create({ data: { action: 'AGENT_REGISTERED', entityType: 'User', entityId: user.id, after: { email: user.email, role: user.role } } });
      await this.issueAgentEmailVerification(user.id, user.email, user.name);
      return { requiresEmailVerification: true, email: user.email };
    } catch (error: any) {
      if (error?.code === 'P2002') throw new ConflictException('An account with this email already exists');
      throw error;
    }
  }

  private otpHash(userId: string, code: string) {
    return sha256(`${userId}:${code}:${this.c.getOrThrow('JWT_ACCESS_SECRET')}`);
  }

  private async issueAgentEmailVerification(userId: string, email: string, name: string, enforceCooldown = false) {
    const now = new Date();
    const latest = await this.p.emailVerificationCode.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
    const cooldownMs = Number(this.c.get('AGENT_EMAIL_OTP_RESEND_COOLDOWN_SECONDS', 60)) * 1000;
    if (enforceCooldown && latest && now.getTime() - latest.createdAt.getTime() < cooldownMs) {
      const waitSeconds = Math.max(1, Math.ceil((cooldownMs - (now.getTime() - latest.createdAt.getTime())) / 1000));
      throw new BadRequestException(`Please wait ${waitSeconds} seconds before requesting another code.`);
    }
    const code = String(randomInt(100000, 1000000));
    const ttlMinutes = Number(this.c.get('AGENT_EMAIL_OTP_TTL_MINUTES', 10));
    await this.p.emailVerificationCode.updateMany({ where: { userId, consumedAt: null }, data: { consumedAt: now } });
    const challenge = await this.p.emailVerificationCode.create({ data: { userId, codeHash: this.otpHash(userId, code), expiresAt: new Date(now.getTime() + ttlMinutes * 60_000) } });
    if (this.mail) {
      await this.mail.queue({
        to: email,
        subject: 'Verify your RainWood agent email',
        text: `Hello ${name},\n\nYour RainWood agent email verification code is: ${code}\n\nThis code expires in ${ttlMinutes} minutes. If you did not request this registration, you can ignore this email.`,
      }, `agent-email-verification:${challenge.id}`, 'User', userId);
    } else {
      this.logger.warn(`Mail service is unavailable; agent email verification was queued without a mail provider for ${email}.`);
    }
    return challenge;
  }

  async verifyAgentEmail(email: string, code: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.p.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true } });
    if (!user || user.role !== 'AGENT') throw new BadRequestException('No agent registration was found for this email.');
    if (user.emailVerifiedAt) return { verified: true, email: user.email };
    const challenge = await this.p.emailVerificationCode.findFirst({ where: { userId: user.id, consumedAt: null }, orderBy: { createdAt: 'desc' } });
    if (!challenge || challenge.expiresAt <= new Date()) throw new BadRequestException('This verification code has expired. Request a new code.');
    if (challenge.attempts >= 5) throw new BadRequestException('Too many incorrect attempts. Request a new code.');
    const valid = sha256(`${user.id}:${code}:${this.c.getOrThrow('JWT_ACCESS_SECRET')}`) === challenge.codeHash;
    if (!valid) {
      await this.p.emailVerificationCode.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('The verification code is incorrect.');
    }
    await this.p.$transaction(async (tx) => {
      await tx.emailVerificationCode.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      await tx.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
      await tx.auditLog.create({ data: { action: 'AGENT_EMAIL_VERIFIED', entityType: 'User', entityId: user.id, after: { email: user.email } } });
    });
    return { verified: true, email: user.email };
  }

  async resendAgentEmailVerification(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.p.user.findUnique({ where: { email: normalizedEmail }, select: { id: true, email: true, name: true, role: true, emailVerifiedAt: true } });
    if (!user || user.role !== 'AGENT') throw new BadRequestException('No agent registration was found for this email.');
    if (user.emailVerifiedAt) return { verified: true, email: user.email };
    await this.issueAgentEmailVerification(user.id, user.email, user.name, true);
    return { sent: true, email: user.email };
  }

  async login(email: string, password: string, meta: { ip?: string; ua?: string } = {}) {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.p.user.findUnique({ where: { email: normalizedEmail } });
    const locked = user?.lockedUntil && user.lockedUntil > new Date();
    const pendingAgent = Boolean(user && isAgentPendingOnboarding(user));
    const validCredentials = Boolean(user && !locked && await bcrypt.compare(password, user.passwordHash));
    if (!user || !validCredentials) {
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
    if (user.role === 'AGENT' && user.emailVerifiedAt === null) throw new UnauthorizedException('Please verify your email address before signing in.');
    if (user.role === 'AGENT' && !user.active && !pendingAgent) throw new UnauthorizedException('Your agent account is deactivated. Please contact support.');
    if (!user.active && !pendingAgent) throw new UnauthorizedException('Invalid credentials');
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
    return { accessToken, refreshToken: raw, user: { id: user.id, email: user.email, name: user.name, role: user.role, staffHotelId: user.staffHotelId ?? null, staffDepartment: user.staffDepartment ?? null, jobTitle: user.jobTitle ?? null } };
  }

  async refresh(raw: string, meta: { ip?: string; ua?: string } = {}) {
    if (!raw) throw new UnauthorizedException('Refresh token invalid');
    const token = await this.p.refreshToken.findUnique({ where: { tokenHash: sha256(raw) }, include: { user: true } });
    const pendingAgent = Boolean(token?.user && isAgentPendingOnboarding(token.user));
    if (!token || token.revokedAt || token.expiresAt <= new Date() || (!token.user.active && !pendingAgent)) {
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

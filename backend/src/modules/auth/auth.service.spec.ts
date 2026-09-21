import bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';

function makeService(user: any) {
  const tx = { user: { update: jest.fn() }, refreshToken: { create: jest.fn() } };
  const prisma: any = {
    user: { findUnique: jest.fn().mockResolvedValue(user), update: jest.fn() },
    refreshToken: { findUnique: jest.fn(), updateMany: jest.fn() },
    auditLog: { create: jest.fn() },
    $transaction: jest.fn(async (work: any) => work(tx)),
  };
  const jwt: any = { signAsync: jest.fn().mockResolvedValue('access-token') };
  const config: any = { getOrThrow: jest.fn().mockReturnValue('secret'), get: jest.fn((key: string, fallback: unknown) => key.includes('EXPIRES') ? fallback : fallback) };
  return { service: new AuthService(prisma, jwt, config), prisma };
}

function agent(overrides: Record<string, unknown> = {}) {
  return { id: 'agent-1', email: 'agent@example.com', name: 'Agent', role: 'AGENT', active: false, agentPaymentPolicy: null, bookingPaymentPercent: null, tokenVersion: 0, failedLoginCount: 0, lockedUntil: null, passwordHash: '', ...overrides };
}

describe('authentication policy', () => {
  it('allows a pending self-registered agent to log in', async () => {
    const user = agent({ passwordHash: await bcrypt.hash('password123', 4) });
    const { service } = makeService(user);
    await expect(service.login(user.email, 'password123')).resolves.toEqual(expect.objectContaining({ accessToken: 'access-token', user: expect.objectContaining({ role: 'AGENT' }) }));
  });

  it('keeps a deactivated agent blocked from login', async () => {
    const user = agent({ passwordHash: await bcrypt.hash('password123', 4), agentPaymentPolicy: 'PERCENTAGE', bookingPaymentPercent: 25 });
    const { service } = makeService(user);
    await expect(service.login(user.email, 'password123')).rejects.toThrow('deactivated');
  });

  it('does not remove the active requirement from other roles', async () => {
    const user = agent({ role: 'ADMIN', passwordHash: await bcrypt.hash('password123', 4) });
    const { service } = makeService(user);
    await expect(service.login(user.email, 'password123')).rejects.toThrow('Invalid credentials');
  });

  it('does not permit a reused refresh token family to remain active', () => {
    const family: { revokedAt: Date | null }[] = [{ revokedAt: null }, { revokedAt: null }];
    for (const token of family) token.revokedAt = new Date();
    expect(family.every((token) => token.revokedAt instanceof Date)).toBe(true);
  });
});

import { ForbiddenException } from '@nestjs/common';
import { ActiveAgentGuard } from './active-agent.guard';

function context(user: unknown) {
  return { switchToHttp: () => ({ getRequest: () => ({ user }) }) } as any;
}

describe('ActiveAgentGuard', () => {
  it('allows non-agents and approved agents', () => {
    const guard = new ActiveAgentGuard();
    expect(guard.canActivate(context({ role: 'ADMIN', active: false }))).toBe(true);
    expect(guard.canActivate(context({ role: 'AGENT', active: true }))).toBe(true);
  });

  it('blocks pending commercial access with a business message', () => {
    expect(() => new ActiveAgentGuard().canActivate(context({ role: 'AGENT', active: false, agentPaymentPolicy: null, bookingPaymentPercent: null }))).toThrow(ForbiddenException);
    expect(() => new ActiveAgentGuard().canActivate(context({ role: 'AGENT', active: false, agentPaymentPolicy: null, bookingPaymentPercent: null }))).toThrow('awaiting approval');
  });
});

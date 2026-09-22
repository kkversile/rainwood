import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';

function controllerFor(statuses: string[], resultTerms: { policy: string | null; percentage: number | null } = { policy: 'PERCENTAGE', percentage: 25 }) {
  const current = { id: 'agent-1', email: 'agent@example.com', name: 'Agent', role: 'AGENT', active: false, agentPaymentPolicy: null, bookingPaymentPercent: null, paymentMilestones: [] };
  const result = { ...current, active: true, agentPaymentPolicy: resultTerms.policy, bookingPaymentPercent: resultTerms.percentage, paymentMilestones: [{ percentage: resultTerms.percentage ?? 100, dueType: resultTerms.policy === 'CREDIT' ? 'DAYS_BEFORE_CHECKIN' : 'ON_BOOKING', daysBeforeCheckIn: resultTerms.policy === 'CREDIT' ? 0 : null }] };
  const tx = { user: { update: jest.fn().mockResolvedValue(result) }, agentPaymentMilestone: { deleteMany: jest.fn(), createMany: jest.fn() }, auditLog: { create: jest.fn() } };
  const prisma: any = {
    user: { findFirstOrThrow: jest.fn().mockResolvedValue(current) },
    agentDocument: { findMany: jest.fn().mockResolvedValue(statuses.map((status) => ({ status }))) },
    $transaction: jest.fn(async (work: any) => work(tx)),
  };
  return { controller: new UsersController(prisma), prisma, tx };
}

describe('agent approval onboarding gate', () => {
  it('rejects approval when no KYC document is submitted', async () => {
    const { controller } = controllerFor([]);
    await expect(controller.approveAgent('agent-1', { active: true, paymentPolicy: 'PERCENTAGE', bookingPaymentPercent: 25 }, { id: 'admin-1' })).rejects.toThrow('Complete and verify');
  });

  it('rejects approval when a submitted KYC document is not approved', async () => {
    const { controller } = controllerFor(['PENDING']);
    await expect(controller.approveAgent('agent-1', { active: true, paymentPolicy: 'PERCENTAGE', bookingPaymentPercent: 25 }, { id: 'admin-1' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('atomically approves a verified agent with percentage terms', async () => {
    const { controller, tx } = controllerFor(['APPROVED']);
    await expect(controller.approveAgent('agent-1', { active: true, paymentPolicy: 'PERCENTAGE', bookingPaymentPercent: 25 }, { id: 'admin-1' })).resolves.toEqual(expect.objectContaining({ active: true, agentPaymentPolicy: 'PERCENTAGE', bookingPaymentPercent: 25 }));
    expect(tx.user.update).toHaveBeenCalled();
    expect(tx.auditLog.create).toHaveBeenCalled();
  });

  it('supports verified-agent approval with credit terms', async () => {
    const { controller } = controllerFor(['APPROVED'], { policy: 'CREDIT', percentage: null });
    const prismaResult = await controller.approveAgent('agent-1', { active: true, paymentPolicy: 'CREDIT' }, { id: 'admin-1' });
    expect(prismaResult).toEqual(expect.objectContaining({ active: true, agentPaymentPolicy: 'CREDIT', bookingPaymentPercent: null }));
  });

  it('approves with a normalized milestone schedule and rejects an incomplete total', async () => {
    const { controller, tx } = controllerFor(['APPROVED'], { policy: null, percentage: null });
    await expect(controller.approveAgent('agent-1', { active: true, paymentMilestones: [
      { percentage: 10, dueType: 'ON_BOOKING' },
      { percentage: 30, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 20 },
      { percentage: 20, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 10 },
      { percentage: 40, dueType: 'DAYS_BEFORE_CHECKIN', daysBeforeCheckIn: 0 },
    ] }, { id: 'admin-1' })).resolves.toEqual(expect.objectContaining({ active: true }));
    expect(tx.agentPaymentMilestone.createMany).toHaveBeenCalled();
    await expect(controller.approveAgent('agent-1', { active: true, paymentMilestones: [{ percentage: 90, dueType: 'ON_BOOKING' }] }, { id: 'admin-1' })).rejects.toThrow('total exactly 100');
  });
});

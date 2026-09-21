import { BadRequestException } from '@nestjs/common';
import { UsersController } from './users.controller';

function controllerFor(statuses: string[], resultTerms: { policy: string; percentage: number | null } = { policy: 'PERCENTAGE', percentage: 25 }) {
  const current = { id: 'agent-1', email: 'agent@example.com', name: 'Agent', role: 'AGENT', active: false, agentPaymentPolicy: null, bookingPaymentPercent: null };
  const result = { ...current, active: true, agentPaymentPolicy: resultTerms.policy, bookingPaymentPercent: resultTerms.percentage };
  const tx = { user: { update: jest.fn().mockResolvedValue(result) }, auditLog: { create: jest.fn() } };
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
});

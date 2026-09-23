import { UsersController } from './users.controller';
import { BadRequestException } from '@nestjs/common';

describe('agent rate-plan mappings', () => {
  it('deactivates removed mappings instead of deleting access history', async () => {
    const tx = {
      agentRatePlan: {
        upsert: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const prisma: any = {
      user: {
        findFirstOrThrow: jest.fn()
          .mockResolvedValueOnce({ id: 'agent-1' })
          .mockResolvedValueOnce({ id: 'agent-1', assignedRatePlans: [] }),
      },
      ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-1' }]) },
      agentRatePlan: { deleteMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      $transaction: jest.fn(async (work: any) => work(tx)),
    };
    const controller = new UsersController(prisma);

    await controller.mapRatePlans('agent-1', { ratePlanIds: ['plan-1'] });

    expect(tx.agentRatePlan.upsert).toHaveBeenCalledWith({
      where: { agentId_ratePlanId: { agentId: 'agent-1', ratePlanId: 'plan-1' } },
      create: { agentId: 'agent-1', ratePlanId: 'plan-1', active: true },
      update: { active: true },
    });
    expect(tx.agentRatePlan.updateMany).toHaveBeenCalledWith({ where: { agentId: 'agent-1', ratePlanId: { notIn: ['plan-1'] } }, data: { active: false } });
    expect(prisma.agentRatePlan.deleteMany).not.toHaveBeenCalled();
  });

  it('returns a client validation exception for invalid rate-plan mappings', async () => {
    const prisma: any = {
      user: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'agent-1' }) },
      ratePlan: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const controller = new UsersController(prisma);
    await expect(controller.mapRatePlans('agent-1', { ratePlanIds: ['inactive-plan'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('keeps assignment updates access-only when the Agents modal saves them', async () => {
    const tx = { agentRatePlan: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, auditLog: { create: jest.fn() } };
    const prisma: any = {
      user: { findFirstOrThrow: jest.fn().mockResolvedValueOnce({ id: 'agent-1' }).mockResolvedValueOnce({ id: 'agent-1', assignedRatePlans: [] }) },
      ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-1' }]) },
      agentRatePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'mapping-1', ratePlanId: 'plan-1', active: true }]) },
      $transaction: jest.fn(async (work: any) => work(tx)),
    };
    await new UsersController(prisma).mapRatePlans('agent-1', { ratePlanIds: ['plan-1'] });
    expect(tx.agentRatePlan.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { active: true } }));
    expect(tx.agentRatePlan.upsert.mock.calls[0][0].update).not.toHaveProperty('pricingMode');
  });

});

import { BadRequestException, ConflictException } from '@nestjs/common';
import { AgentRateSlabsService } from './agent-rate-slabs.service';

describe('AgentRateSlabsService', () => {
  const slab = { id: 'slab-1', code: 'PARTNER-2026', name: 'Partner Contract 2026', validFrom: new Date('2026-10-01'), validTo: new Date('2026-12-31'), status: 'DRAFT', active: true };

  it('rejects overlapping rows for the same plan', async () => {
    const prisma: any = {
      agentRateSlab: { findUnique: jest.fn().mockResolvedValue(slab) },
      ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-1', master: { kind: 'CANONICAL_MEAL' } }]) },
    };
    const service = new AgentRateSlabsService(prisma);
    await expect(service.replaceRates('slab-1', [
      { ratePlanId: 'plan-1', validFrom: '2026-10-01', validTo: '2026-11-01', amount: 7000 },
      { ratePlanId: 'plan-1', validFrom: '2026-11-01', validTo: '2026-12-31', amount: 7500 },
    ] as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a legacy commercial plan even when its mealPlan is EP', async () => {
    const prisma: any = { agentRateSlab: { findUnique: jest.fn().mockResolvedValue(slab) }, ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-legacy', master: { kind: 'LEGACY' } }]) } };
    const service = new AgentRateSlabsService(prisma);
    await expect(service.replaceRates('slab-1', [{ ratePlanId: 'plan-legacy', validFrom: '2026-10-01', validTo: '2026-12-31', amount: 7000 }] as any)).rejects.toThrow('canonical meal plans');
  });

  it('requires rates before publishing', async () => {
    const prisma: any = { agentRateSlab: { findUnique: jest.fn().mockResolvedValue({ ...slab, rates: [] }) } };
    const service = new AgentRateSlabsService(prisma);
    await expect(service.publish('slab-1', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('reports assignment coverage for the resolver', async () => {
    const db: any = {
      agentRateSlabAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'assignment-1', slabId: 'slab-1', validFrom: new Date('2026-10-01'), validTo: new Date('2026-12-31'), slab }) },
      agentRateSlabRate: { findMany: jest.fn().mockResolvedValue([{ ratePlanId: 'plan-1', amount: 7000 }]) },
    };
    const service = new AgentRateSlabsService({} as any);
    const context = await service.context('agent-1', new Date('2026-10-10'), new Date('2026-10-12'), db);
    expect(context).toMatchObject({ fullAssignmentCoverage: true, assignment: { slabId: 'slab-1' }, rates: [{ ratePlanId: 'plan-1' }] });
  });
});

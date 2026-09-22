import { BadRequestException } from '@nestjs/common';
import { AgentsService } from './agents.service';

describe('agent document review status contract', () => {
  it('accepts APPROVED with a review remark and rejects the obsolete VERIFIED value', async () => {
    const prisma: any = {
      agentDocument: {
        findFirst: jest.fn().mockResolvedValue({ id: 'document-1', agentId: 'agent-1' }),
        update: jest.fn().mockResolvedValue({ id: 'document-1', status: 'APPROVED', reviewRemark: 'Looks good' }),
      },
    };
    const service = new AgentsService(prisma);
    await expect(service.reviewDocument('agent-1', 'document-1', 'APPROVED', ' Looks good ')).resolves.toEqual(expect.objectContaining({ status: 'APPROVED', reviewRemark: 'Looks good' }));
    expect(prisma.agentDocument.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'APPROVED', reviewRemark: 'Looks good' }) }));
    await expect(service.reviewDocument('agent-1', 'document-1', 'VERIFIED')).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('agent hotel rate-plan assignment', () => {
  function prismaMock() {
    const assignedAgent = { id: 'agent-1', role: 'AGENT', assignedRatePlans: [] };
    const tx: any = {
      agentRatePlan: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), upsert: jest.fn().mockResolvedValue({}) },
      auditLog: { create: jest.fn().mockResolvedValue({}) },
      user: { findFirstOrThrow: jest.fn().mockResolvedValue(assignedAgent) },
    };
    return {
      user: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'agent-1' }) },
      ratePlanMaster: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'master-new', hotelId: 'hotel-1', active: true, code: 'BAR', name: 'Best Available', mealPlan: 'CP',
          hotel: { id: 'hotel-1', name: 'Hotel One', city: 'City' },
          assignments: [{ id: 'room-plan-1', roomType: { id: 'room-1', name: 'Deluxe' } }, { id: 'room-plan-2', roomType: { id: 'room-2', name: 'Suite' } }],
        }),
      },
      agentRatePlan: { findMany: jest.fn().mockResolvedValue([{ ratePlanId: 'room-plan-1', ratePlan: { masterId: 'master-old' } }]) },
      $transaction: jest.fn(async (callback: any) => callback(tx)),
      tx,
    };
  }

  it('switches the hotel master and activates every room assignment without overwriting contract pricing', async () => {
    const prisma: any = prismaMock();
    const service = new AgentsService(prisma);
    await service.assignAgentHotelRatePlan('agent-1', 'hotel-1', 'master-new', 'admin-1');
    expect(prisma.tx.agentRatePlan.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { active: false } }));
    expect(prisma.tx.agentRatePlan.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.tx.agentRatePlan.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { active: true } }));
    expect(prisma.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: 'AGENT_HOTEL_RATE_PLAN_ASSIGNED' }) }));
  });

  it('rejects a master from another hotel and deactivates mappings without deleting rate days', async () => {
    const prisma: any = prismaMock();
    prisma.ratePlanMaster.findUnique.mockResolvedValueOnce({ id: 'master-new', hotelId: 'hotel-2', active: true, assignments: [] });
    const service = new AgentsService(prisma);
    await expect(service.assignAgentHotelRatePlan('agent-1', 'hotel-1', 'master-new', 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    prisma.ratePlanMaster.findUnique.mockResolvedValueOnce({ id: 'master-new', hotelId: 'hotel-1', active: true, hotel: { id: 'hotel-1', name: 'Hotel One' } });
    await service.removeAgentHotelRatePlan('agent-1', 'master-new', 'admin-1');
    expect(prisma.tx.agentRatePlan.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { active: false } }));
    expect(prisma.tx.agentRatePlan).not.toHaveProperty('deleteMany');
  });
});

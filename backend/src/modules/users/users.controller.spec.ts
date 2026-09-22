import { UsersController } from './users.controller';
import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';

describe('agent rate-plan mappings', () => {
  it('deactivates removed mappings instead of deleting negotiated-rate history', async () => {
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

  it('returns both base and agent rate-day rows for the editor contract', async () => {
    const assignment = { id: 'assignment-1', active: true, pricingMode: 'OVERRIDE', rates: [{ id: 'override-1', date: new Date('2099-01-10T00:00:00Z'), amount: 4000 }], ratePlan: { id: 'plan-1', rates: [{ id: 'base-1', date: new Date('2099-01-10T00:00:00Z'), amount: 5000 }], roomType: { id: 'room-1', name: 'PVR', code: 'PVR', hotel: { id: 'hotel-1', name: 'Hotel', city: 'City' } } } };
    const prisma: any = { agentRatePlan: { findUnique: jest.fn().mockResolvedValue(assignment) } };
    const controller = new UsersController(prisma);

    const result = await controller.agentRates('agent-1', 'plan-1');

    expect(result.rates).toHaveLength(1);
    expect(result.ratePlan.rates).toHaveLength(1);
    expect(prisma.agentRatePlan.findUnique).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ rates: expect.any(Object), ratePlan: expect.any(Object) }) }));
  });

  it('returns a client validation exception for invalid rate-plan mappings', async () => {
    const prisma: any = {
      user: { findFirstOrThrow: jest.fn().mockResolvedValue({ id: 'agent-1' }) },
      ratePlan: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const controller = new UsersController(prisma);
    await expect(controller.mapRatePlans('agent-1', { ratePlanIds: ['inactive-plan'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('preserves an existing OVERRIDE mapping when the Agents assignment modal saves it unchanged', async () => {
    const tx = { agentRatePlan: { upsert: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) }, auditLog: { create: jest.fn() } };
    const prisma: any = {
      user: { findFirstOrThrow: jest.fn().mockResolvedValueOnce({ id: 'agent-1' }).mockResolvedValueOnce({ id: 'agent-1', assignedRatePlans: [] }) },
      ratePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'plan-1' }]) },
      agentRatePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'mapping-1', ratePlanId: 'plan-1', active: true, pricingMode: 'OVERRIDE' }]) },
      $transaction: jest.fn(async (work: any) => work(tx)),
    };
    await new UsersController(prisma).mapRatePlans('agent-1', { ratePlanIds: ['plan-1'] });
    expect(tx.agentRatePlan.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { active: true } }));
    expect(tx.agentRatePlan.upsert.mock.calls[0][0].update).not.toHaveProperty('pricingMode');
  });

  it('clears stale agent-rate overrides when an imported row has blank override cells', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Agent Rates');
    sheet.addRow(['Agent Email', 'Hotel', 'Room Code', 'Rate Plan Code', 'Date', 'Agent Contract Rate', 'Contract Tax', 'Single', 'Double', 'Triple', 'Quad', 'Extra Adult Charge', 'Child Charge']);
    sheet.addRow(['agent@example.com', 'RW-OOTY', 'DLX', 'BAR', '2026-10-01', '', '', '', '', '', '', '', '']);
    const tx = {
      agentRateDay: { findUnique: jest.fn().mockResolvedValue({ id: 'override-1' }), delete: jest.fn() },
      agentRatePlan: { update: jest.fn(), },
    };
    const prisma: any = {
      user: { findMany: jest.fn().mockResolvedValue([{ id: 'agent-1', email: 'agent@example.com' }]) },
      agentRatePlan: { findMany: jest.fn().mockResolvedValue([{ id: 'mapping-1', agentId: 'agent-1', ratePlanId: 'plan-1', active: true }]) },
      hotel: { findMany: jest.fn().mockResolvedValue([{ id: 'hotel-1', code: 'RW-OOTY', name: 'RainWood Ooty', rooms: [{ code: 'DLX', ratePlans: [{ id: 'plan-1', code: 'BAR', active: true, master: { active: true } }] }] }]) },
      $transaction: jest.fn(async (work: any) => work(tx)),
      auditLog: { create: jest.fn() },
    };
    const controller = new UsersController(prisma);
    const file = { originalname: 'agent-rates.xlsx', buffer: Buffer.from(await workbook.xlsx.writeBuffer()) } as any;

    await expect(controller.importAgentRates(file, { id: 'admin-1' })).resolves.toEqual(expect.objectContaining({ rowsImported: 1 }));
    expect(tx.agentRateDay.delete).toHaveBeenCalledWith({ where: { id: 'override-1' } });
    expect(tx.agentRatePlan.update).not.toHaveBeenCalled();
  });
});

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

describe('service staff partial updates', () => {
  const current = { id: 'staff-1', role: 'SERVICE_STAFF', staffDepartment: 'FOOD_BEVERAGE', jobTitle: 'Restaurant captain', staffHotelId: 'hotel-1' };

  function staffController(hotel: any = { id: 'hotel-1', active: true }) {
    const prisma: any = {
      user: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockResolvedValue({ ...current }),
      },
      hotel: { findUnique: jest.fn().mockResolvedValue(hotel) },
    };
    return { controller: new UsersController(prisma), prisma };
  }

  it('allows deactivation with only active=false and preserves staff metadata', async () => {
    const { controller, prisma } = staffController();
    await controller.update('staff-1', { active: false });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ active: false, staffDepartment: 'FOOD_BEVERAGE', jobTitle: 'Restaurant captain', staffHotelId: 'hotel-1' }) }));
  });

  it('allows a name-only update', async () => {
    const { controller, prisma } = staffController();
    await controller.update('staff-1', { name: 'New Captain' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: 'New Captain', staffDepartment: 'FOOD_BEVERAGE', jobTitle: 'Restaurant captain', staffHotelId: 'hotel-1' }) }));
  });

  it('allows department-only and hotel-only updates after validating effective values', async () => {
    const department = staffController();
    await department.controller.update('staff-1', { staffDepartment: 'HOUSEKEEPING' });
    expect(department.prisma.user.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ staffDepartment: 'HOUSEKEEPING', jobTitle: 'Restaurant captain', staffHotelId: 'hotel-1' }));

    const hotel = staffController({ id: 'hotel-2', active: true });
    await hotel.controller.update('staff-1', { staffHotelId: 'hotel-2' });
    expect(hotel.prisma.hotel.findUnique).toHaveBeenCalledWith({ where: { id: 'hotel-2' }, select: { id: true, active: true } });
    expect(hotel.prisma.user.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ staffDepartment: 'FOOD_BEVERAGE', jobTitle: 'Restaurant captain', staffHotelId: 'hotel-2' }));
  });

  it('rejects inactive or missing assigned hotels', async () => {
    for (const hotel of [{ id: 'hotel-2', active: false }, null]) {
      const { controller } = staffController(hotel);
      await expect(controller.update('staff-1', { staffHotelId: 'hotel-2' })).rejects.toThrow('Assigned hotel is not active');
    }
  });

  it('clears staff metadata when the role changes away from SERVICE_STAFF', async () => {
    const { controller, prisma } = staffController();
    await controller.update('staff-1', { role: 'ADMIN' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ role: 'ADMIN', staffDepartment: null, jobTitle: null, staffHotelId: null }) }));
    expect(prisma.hotel.findUnique).not.toHaveBeenCalled();
  });
});

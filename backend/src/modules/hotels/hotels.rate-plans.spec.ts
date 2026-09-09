import { BadRequestException, ConflictException } from '@nestjs/common';
import { HotelsService } from './hotels.service';
import { canonicalMealPlan, canonicalRatePlanCode } from './rate-plan.utils';

describe('hotel-level rate plans', () => {
  const master = { id: 'master-1', hotelId: 'hotel-1', code: 'CP', name: 'Breakfast', mealPlan: 'CP', description: null, active: true };
  const room = { id: 'room-1', hotelId: 'hotel-1' };
  let prisma: any;
  let service: HotelsService;

  beforeEach(() => {
    prisma = {
      hotel: { findUniqueOrThrow: jest.fn() },
      roomType: { findMany: jest.fn().mockResolvedValue([room]), findUnique: jest.fn().mockResolvedValue(room) },
      ratePlanMaster: {
        create: jest.fn().mockResolvedValue(master),
        findUnique: jest.fn().mockResolvedValue(master),
        findUniqueOrThrow: jest.fn().mockResolvedValue(master),
        update: jest.fn().mockResolvedValue(master),
      },
      ratePlan: {
        create: jest.fn().mockResolvedValue({ id: 'assignment-1', masterId: master.id, roomTypeId: room.id }),
        createMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue({ id: 'assignment-1', masterId: master.id, roomTypeId: room.id, master }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'assignment-1' }),
        update: jest.fn().mockResolvedValue({ id: 'assignment-1', active: false }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      rateDay: { upsert: jest.fn() },
      $transaction: jest.fn(async (work: any) => typeof work === 'function' ? work(prisma) : Promise.all(work)),
    };
    service = new HotelsService(prisma, {} as any);
  });

  it('canonicalizes rate-plan and meal-plan codes', () => {
    expect(canonicalRatePlanCode(' cp ')).toBe('CP');
    expect(canonicalMealPlan(' map ')).toBe('MAP');
  });

  it('creates one master and selected room assignments', async () => {
    await service.createRatePlanMaster('hotel-1', { code: ' cp ', name: ' Breakfast ', mealPlan: 'cp', roomTypeIds: ['room-1'] });
    expect(prisma.ratePlanMaster.create).toHaveBeenCalledWith({ data: expect.objectContaining({ hotelId: 'hotel-1', code: 'CP', name: 'Breakfast', mealPlan: 'CP' }) });
    expect(prisma.ratePlan.createMany).toHaveBeenCalledWith({ data: [expect.objectContaining({ masterId: master.id, roomTypeId: 'room-1', code: 'CP' })] });
  });

  it('returns conflict when normalized master code is duplicated', async () => {
    prisma.$transaction.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.createRatePlanMaster('hotel-1', { code: 'cp', name: 'Breakfast', mealPlan: 'CP' })).rejects.toBeInstanceOf(ConflictException);
  });

  it('assigns a master to a room in the same hotel', async () => {
    await service.assignRatePlanMaster(master.id, { roomTypeId: room.id });
    expect(prisma.ratePlan.create).toHaveBeenCalledWith({ data: expect.objectContaining({ masterId: master.id, roomTypeId: room.id }), include: { roomType: true, master: true } });
  });

  it('rejects duplicate room assignments', async () => {
    prisma.ratePlan.create.mockRejectedValueOnce({ code: 'P2002' });
    await expect(service.assignRatePlanMaster(master.id, { roomTypeId: room.id })).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects cross-hotel assignments', async () => {
    prisma.roomType.findUnique.mockResolvedValueOnce({ id: 'room-2', hotelId: 'hotel-2' });
    await expect(service.assignRatePlanMaster(master.id, { roomTypeId: 'room-2' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.ratePlan.create).not.toHaveBeenCalled();
  });

  it('updates master metadata and synchronizes compatibility columns', async () => {
    await service.updateRatePlanMaster(master.id, { code: ' cp ', name: 'New breakfast', mealPlan: 'map', active: false });
    expect(prisma.ratePlanMaster.update).toHaveBeenCalledWith({ where: { id: master.id }, data: expect.objectContaining({ code: 'CP', mealPlan: 'MAP', active: false }) });
    expect(prisma.ratePlan.updateMany).toHaveBeenCalledWith({ where: { masterId: master.id }, data: expect.objectContaining({ code: 'CP', mealPlan: 'MAP' }) });
  });

  it('deactivates an assignment without deleting booking references', async () => {
    await service.updateRatePlanAssignment('assignment-1', { active: false });
    expect(prisma.ratePlan.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'assignment-1' }, data: expect.objectContaining({ active: false }) }));
    expect(prisma.ratePlan.delete).toBeUndefined();
  });

  it('writes RateDay against the room assignment id', async () => {
    prisma.ratePlan.findUnique.mockResolvedValueOnce({ id: 'assignment-1' });
    prisma.rateDay.upsert.mockReturnValue(Promise.resolve({ id: 'day-1' }));
    await service.saveRates('assignment-1', { days: [{ date: '2026-09-12', amount: 3500 }] });
    expect(prisma.rateDay.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ ratePlanId: 'assignment-1', amount: 3500 }) }));
  });
});

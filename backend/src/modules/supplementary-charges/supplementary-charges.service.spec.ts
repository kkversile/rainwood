import { BadRequestException } from '@nestjs/common';
import { SupplementaryChargeScope } from '@prisma/client';
import { SupplementaryChargesService } from './supplementary-charges.service';

describe('supplementary charge updates', () => {
  let prisma: any;
  let service: SupplementaryChargesService;
  const current = {
    id: 'charge-1',
    hotelId: 'hotel-1',
    name: 'Festival fee',
    startDate: new Date('2026-10-01T00:00:00.000Z'),
    endDate: new Date('2026-10-10T00:00:00.000Z'),
    amountPerRoomNight: 125,
    scope: SupplementaryChargeScope.AGENTS,
    active: true,
  };

  beforeEach(() => {
    prisma = {
      hotelSupplementaryCharge: {
        findUnique: jest.fn().mockResolvedValue(current),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ ...current, ...data })),
      },
    };
    service = new SupplementaryChargesService(prisma, { log: jest.fn() } as any);
  });

  it('validates and persists an amount-only update', async () => {
    await service.update('charge-1', { amountPerRoomNight: 250 }, 'admin-1');
    expect(prisma.hotelSupplementaryCharge.update).toHaveBeenCalledWith({
      where: { id: 'charge-1' },
      data: { amountPerRoomNight: 250 },
    });
  });

  it('rejects a negative amount even when dates are omitted', async () => {
    await expect(service.update('charge-1', { amountPerRoomNight: -1 }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hotelSupplementaryCharge.update).not.toHaveBeenCalled();
  });

  it('normalizes persisted dates when only one date changes', async () => {
    await service.update('charge-1', { startDate: '2026-09-30' }, 'admin-1');
    expect(prisma.hotelSupplementaryCharge.update).toHaveBeenCalledWith(expect.objectContaining({ data: { startDate: new Date('2026-09-30T00:00:00.000Z') } }));
  });

  it('rejects an end date before the merged start date', async () => {
    await expect(service.update('charge-1', { endDate: '2026-09-01' }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hotelSupplementaryCharge.update).not.toHaveBeenCalled();
  });

  it('rejects a blank or too-short name', async () => {
    await expect(service.update('charge-1', { name: ' ' }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update('charge-1', { name: 'x' }, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hotelSupplementaryCharge.update).not.toHaveBeenCalled();
  });

  it('supports deactivation without changing other fields', async () => {
    await service.deactivate('charge-1', 'admin-1');
    expect(prisma.hotelSupplementaryCharge.update).toHaveBeenCalledWith({ where: { id: 'charge-1' }, data: { active: false } });
  });

  it('rejects an explicitly supplied non-boolean active value', async () => {
    await expect(service.update('charge-1', { active: null } as any, 'admin-1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.hotelSupplementaryCharge.update).not.toHaveBeenCalled();
  });
});

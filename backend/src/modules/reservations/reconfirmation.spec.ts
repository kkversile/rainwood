import { BadRequestException } from '@nestjs/common';
import { ReservationsService } from './reservations.service';

function setup(status = 'CONFIRMED') {
  const prisma: any = {
    reservation: {
      findUnique: jest.fn().mockResolvedValue({ id: 'reservation-1', reference: 'RW-RECONFIRM-1', status, reconfirmedAt: null, reconfirmedById: null }),
      update: jest.fn().mockResolvedValue({ reference: 'RW-RECONFIRM-1', reconfirmedAt: new Date('2026-09-25T10:00:00.000Z'), reconfirmedBy: { id: 'admin-1', name: 'Admin' } }),
    },
  };
  const audit = { log: jest.fn().mockResolvedValue(undefined) };
  const service = new ReservationsService(prisma, {} as any, audit as any, {} as any);
  return { service, prisma, audit };
}

describe('reservation reconfirmation', () => {
  it('updates the state and records an audit event', async () => {
    const { service, prisma, audit } = setup();

    await expect(service.setReconfirmation('RW-RECONFIRM-1', true, { id: 'admin-1' })).resolves.toEqual(expect.objectContaining({ reference: 'RW-RECONFIRM-1', reconfirmed: true }));
    expect(prisma.reservation.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ reconfirmedById: 'admin-1' }) }));
    expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'RESERVATION_RECONFIRMED', entityId: 'reservation-1' }));
  });

  it('rejects cancelled reservations', async () => {
    const { service, prisma } = setup('CANCELLED');

    await expect(service.setReconfirmation('RW-RECONFIRM-1', true, { id: 'admin-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.reservation.update).not.toHaveBeenCalled();
  });
});

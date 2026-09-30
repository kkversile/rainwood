import 'reflect-metadata';
import { JobsController } from './jobs/jobs.controller';
import { ReservationsController } from './reservations/reservations.controller';
import { HotelsController } from './hotels/hotels.controller';
import { UsersController } from './users/users.controller';
import { AgentsController } from './agents/agents.controller';
import { ROLES_KEY } from '../common/roles.decorator';
import { UserRole } from '@prisma/client';

describe('final RBAC policy metadata', () => {
  function roles(controller: any, method: string) { return Reflect.getMetadata(ROLES_KEY, controller.prototype[method]) as UserRole[]; }
  it('allows Corporate Admin for reservation mutations and physical rooms', () => {
    for (const method of ['manual', 'checkoutPayment', 'addFolioCharge', 'voidFolioCharge', 'cancel', 'modify', 'reconfirmation']) expect(roles(ReservationsController, method)).toContain(UserRole.CORPORATE_ADMIN);
    expect(roles(HotelsController, 'physicalRooms')).toContain(UserRole.CORPORATE_ADMIN);
  });
  it('keeps property Admin out of global jobs and agent KYC review', () => {
    expect(Reflect.getMetadata(ROLES_KEY, JobsController)).not.toContain(UserRole.ADMIN);
    expect(roles(UsersController, 'reviewAgentDocument')).not.toContain(UserRole.ADMIN);
    expect(roles(UsersController, 'reviewAgentDocument')).toContain(UserRole.CORPORATE_ADMIN);
    expect(roles(UsersController, 'agent')).toEqual([UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN]);
    expect(roles(AgentsController, 'review')).toEqual([UserRole.SUPER_ADMIN, UserRole.CORPORATE_ADMIN]);
    expect(roles(AgentsController, 'addDocument')).toContain(UserRole.AGENT);
    expect(roles(AgentsController, 'review')).not.toContain(UserRole.RESERVATION);
  });
});

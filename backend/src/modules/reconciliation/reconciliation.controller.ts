import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';
import { CurrentUser } from '../../common/current-user.decorator';
import { getActorScope } from '../../common/role-scope';

@Controller('reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'CORPORATE_ADMIN', 'ADMIN', 'ACCOUNTS')
export class ReconciliationController {
  constructor(private readonly p: PrismaService) {}

  @Get('summary')
  async summary(@CurrentUser() actor: any) {
    const scope = await getActorScope(this.p, actor.id);
    const hotelWhere = scope.role === UserRole.ADMIN ? { hotelId: scope.hotelId! } : {};
    const failedJobWhere = scope.role === UserRole.ADMIN
      ? { status: { in: ['FAILED', 'DEAD_LETTER'] as any[] }, aggregateType: 'Reservation', aggregateId: { in: (await this.p.reservation.findMany({ where: hotelWhere, select: { id: true } })).map((row) => row.id) } }
      : { status: { in: ['FAILED', 'DEAD_LETTER'] as any[] } };
    const [failedJobs, failedSync, pendingPayments] = await Promise.all([
      this.p.outboxJob.count({ where: failedJobWhere }),
      this.p.reservation.count({ where: { ...hotelWhere, syncStatus: { in: ['FAILED', 'DEAD_LETTER'] } } }),
      this.p.paymentAttempt.count({ where: { reservation: hotelWhere, status: 'PENDING' } }),
    ]);
    return { failedJobs, failedSync, pendingPayments };
  }

  @Post('enqueue')
  async enqueue(@CurrentUser() actor: any) {
    const scope = await getActorScope(this.p, actor.id);
    const hotelWhere = scope.role === UserRole.ADMIN ? { hotelId: scope.hotelId! } : {};
    const rows = await this.p.reservation.findMany({ where: { ...hotelWhere, status: 'CONFIRMED', syncStatus: { in: ['FAILED', 'PENDING'] } }, select: { id: true, version: true } });
    for (const row of rows) {
      const key = `reconcile:axis:${row.id}:v${row.version}`;
      await this.p.outboxJob.upsert({ where: { idempotencyKey: key }, create: { type: 'AXIS_BOOKING_PUSH', aggregateType: 'Reservation', aggregateId: row.id, idempotencyKey: key, payload: { reservationId: row.id, reconciliation: true } }, update: { status: 'PENDING', availableAt: new Date() } });
    }
    return { enqueued: rows.length };
  }
}

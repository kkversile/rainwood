import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../common/prisma.service';
import { AxisRoomsService } from '../axisrooms/axisrooms.service';
import { VouchersService } from '../vouchers/vouchers.service';
import { HoldsService } from '../holds/holds.service';

@Injectable()
export class JobsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JobsService.name);
  private readonly worker = randomUUID();
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private p: PrismaService, private c: ConfigService, private axis: AxisRoomsService, private vouchers: VouchersService, private holds: HoldsService) {}

  onModuleInit() {
    if (this.c.get('WORKER_ENABLED', 'true') === 'false') return;
    this.timer = setInterval(() => this.tick().catch((error) => this.logger.error(error instanceof Error ? error.message : String(error))), Number(this.c.get('JOB_WORKER_INTERVAL_MS', 5000)));
  }

  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  async tick() {
    if (this.running) return { claimed: 0, skipped: true };
    this.running = true;
    try {
      await this.holds.releaseExpired();
      await this.p.outboxJob.updateMany({ where: { status: 'PROCESSING', lockedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { status: 'FAILED', lockedAt: null, lockedBy: null, availableAt: new Date(), lastError: 'Recovered abandoned worker lease' } });
      const jobs = await this.p.$queryRaw<any[]>(Prisma.sql`UPDATE public."OutboxJob" SET status = 'PROCESSING', "lockedAt" = now(), "lockedBy" = ${this.worker}, attempts = attempts + 1 WHERE id IN (SELECT id FROM public."OutboxJob" WHERE status IN ('PENDING', 'FAILED') AND "availableAt" <= now() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 10) RETURNING *`);
      for (const job of jobs) await this.process(job);
      return { claimed: jobs.length };
    } finally {
      this.running = false;
    }
  }

  private async process(job: any) {
    try {
      let result: any;
      if (job.type.startsWith('AXIS_')) {
        result = await this.axis.push(job);
        await this.p.axisSyncLog.upsert({ where: { idempotencyKey: job.idempotencyKey }, create: { reservationId: job.aggregateId, idempotencyKey: job.idempotencyKey, direction: 'OUTBOUND', entityType: job.type, status: 'SYNCED', payload: job.payload, response: result, attempts: job.attempts }, update: { status: 'SYNCED', response: result, errorMessage: null, attempts: job.attempts, updatedAt: new Date() } });
        await this.p.reservation.update({ where: { id: job.aggregateId }, data: { syncStatus: 'SYNCED' } });
      } else if (job.type === 'GENERATE_VOUCHER') {
        result = await this.vouchers.generate(job.aggregateId);
      } else if (job.type === 'SEND_VOUCHER_EMAIL') {
        result = await this.vouchers.email(job.aggregateId);
      } else {
        throw new Error(`Unknown outbox job type ${job.type}`);
      }
      await this.p.outboxJob.update({ where: { id: job.id }, data: { status: 'SUCCEEDED', completedAt: new Date(), lockedAt: null, lockedBy: null } });
      return result;
    } catch (error: any) {
      const attempts = Number(job.attempts);
      const dead = attempts >= Number(this.c.get('JOB_MAX_ATTEMPTS', 8));
      const message = String(error?.message ?? error).slice(0, 2000);
      await this.p.outboxJob.update({ where: { id: job.id }, data: { status: dead ? 'DEAD_LETTER' : 'FAILED', lockedAt: null, lockedBy: null, lastError: message, availableAt: new Date(Date.now() + Math.min(3_600_000, 2 ** attempts * 1000)) } });
      if (job.type.startsWith('AXIS_')) {
        await this.p.axisSyncLog.upsert({ where: { idempotencyKey: job.idempotencyKey }, create: { reservationId: job.aggregateId, idempotencyKey: job.idempotencyKey, direction: 'OUTBOUND', entityType: job.type, status: dead ? 'DEAD_LETTER' : 'RETRY', payload: job.payload, errorMessage: message, attempts, nextAttemptAt: dead ? null : new Date(Date.now() + Math.min(3_600_000, 2 ** attempts * 1000)) }, update: { status: dead ? 'DEAD_LETTER' : 'RETRY', errorMessage: message, attempts, nextAttemptAt: dead ? null : new Date(Date.now() + Math.min(3_600_000, 2 ** attempts * 1000)) } });
        await this.p.reservation.update({ where: { id: job.aggregateId }, data: { syncStatus: dead ? 'DEAD_LETTER' : 'RETRY' } });
      }
      this.logger.error(`Outbox job ${job.id} failed: ${message}`);
    }
  }
}

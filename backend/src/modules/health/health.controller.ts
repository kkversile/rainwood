import { Controller, Get, Header, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { register, collectDefaultMetrics } from 'prom-client';

collectDefaultMetrics();

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health/live')
  live() { return { ok: true }; }

  @Get('health/ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { ok: true };
    } catch {
      throw new ServiceUnavailableException('Database is not ready');
    }
  }

  @Get('metrics')
  @Header('content-type', register.contentType)
  metrics() { return register.metrics(); }
}

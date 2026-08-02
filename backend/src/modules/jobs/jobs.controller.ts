import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { JwtAuthGuard } from '../../common/jwt-auth.guard';
import { RolesGuard } from '../../common/roles.guard';
import { Roles } from '../../common/roles.decorator';

@Controller('jobs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
export class JobsController {
  constructor(private p: PrismaService) {}

  @Get()
  list() { return this.p.outboxJob.findMany({ orderBy: { createdAt: 'desc' }, take: 200 }); }

  @Post(':id/retry')
  retry(@Param('id') id: string) { return this.p.outboxJob.update({ where: { id }, data: { status: 'PENDING', availableAt: new Date(), lockedAt: null, lockedBy: null, lastError: null } }); }
}

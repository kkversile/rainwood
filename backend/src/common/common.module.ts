import { Global, Module } from '@nestjs/common';
import { ActiveAgentGuard } from './active-agent.guard';
import { AuditService } from './audit.service';
import { PrismaModule } from './prisma.module';

@Global()
@Module({ imports: [PrismaModule], providers: [ActiveAgentGuard, AuditService], exports: [ActiveAgentGuard, AuditService] })
export class CommonModule {}

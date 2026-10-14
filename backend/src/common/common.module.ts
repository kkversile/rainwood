import { Global, Module } from '@nestjs/common';
import { ActiveAgentGuard } from './active-agent.guard';
import { AuditService } from './audit.service';
import { PrismaModule } from './prisma.module';
import { MailService } from './mail.service';

@Global()
@Module({ imports: [PrismaModule], providers: [ActiveAgentGuard, AuditService, MailService], exports: [ActiveAgentGuard, AuditService, MailService] })
export class CommonModule {}

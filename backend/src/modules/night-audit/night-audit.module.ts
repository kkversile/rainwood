import { Module } from '@nestjs/common';
import { NightAuditController } from './night-audit.controller';
import { NightAuditService } from './night-audit.service';

@Module({ controllers: [NightAuditController], providers: [NightAuditService] })
export class NightAuditModule {}

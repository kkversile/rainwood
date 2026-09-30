import { Module } from '@nestjs/common';
import { NightAuditController } from './night-audit.controller';
import { NightAuditService } from './night-audit.service';
import { RevenueForecastModule } from '../revenue-forecast/revenue-forecast.module';

@Module({ imports: [RevenueForecastModule], controllers: [NightAuditController], providers: [NightAuditService] })
export class NightAuditModule {}

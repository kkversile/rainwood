import { Module } from '@nestjs/common';
import { AgentCategoryRateSheetController } from './agent-rate-slabs.controller';
import { AgentCategoryRatesService } from './agent-rate-slabs.service';
import { AgentRateSheetRenderer } from './agent-rate-sheet-renderer';
import { RateMasterModule } from '../rate-master/rate-master.module';

@Module({ imports: [RateMasterModule], controllers: [AgentCategoryRateSheetController], providers: [AgentCategoryRatesService, AgentRateSheetRenderer], exports: [AgentCategoryRatesService, AgentRateSheetRenderer] })
export class AgentCategoryRatesModule {}

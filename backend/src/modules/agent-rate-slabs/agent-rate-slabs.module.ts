import { Module } from '@nestjs/common';
import { AgentRateSlabsController, AgentRateSlabAssignmentController } from './agent-rate-slabs.controller';
import { AgentRateSlabsService } from './agent-rate-slabs.service';
import { AgentRateSheetRenderer } from './agent-rate-sheet-renderer';
import { RateMasterModule } from '../rate-master/rate-master.module';

@Module({ imports: [RateMasterModule], controllers: [AgentRateSlabsController, AgentRateSlabAssignmentController], providers: [AgentRateSlabsService, AgentRateSheetRenderer], exports: [AgentRateSlabsService, AgentRateSheetRenderer] })
export class AgentRateSlabsModule {}

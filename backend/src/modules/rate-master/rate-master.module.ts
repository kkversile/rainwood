import { Module } from '@nestjs/common';
import { AgentCategoryMappingController, RateMasterController } from './rate-master.controller';
import { RateMasterService } from './rate-master.service';

@Module({ controllers: [RateMasterController, AgentCategoryMappingController], providers: [RateMasterService], exports: [RateMasterService] })
export class RateMasterModule {}

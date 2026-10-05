import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';
import { FeaturesModule } from '../features/features.module';

@Module({ imports: [AvailabilityModule, FeaturesModule], controllers: [GroupsController], providers: [GroupsService], exports: [GroupsService] })
export class GroupsModule {}

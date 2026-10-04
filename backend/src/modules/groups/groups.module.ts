import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { GroupsController } from './groups.controller';
import { GroupsService } from './groups.service';

@Module({ imports: [AvailabilityModule], controllers: [GroupsController], providers: [GroupsService], exports: [GroupsService] })
export class GroupsModule {}

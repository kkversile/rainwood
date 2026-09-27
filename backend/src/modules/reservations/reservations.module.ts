import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { HoldsModule } from '../holds/holds.module';
import { HousekeepingModule } from '../housekeeping/housekeeping.module';
import { ReservationsController } from './reservations.controller';
import { ReservationsService } from './reservations.service';

@Module({ imports: [HoldsModule, AvailabilityModule, HousekeepingModule], providers: [ReservationsService], controllers: [ReservationsController], exports: [ReservationsService] })
export class ReservationsModule {}

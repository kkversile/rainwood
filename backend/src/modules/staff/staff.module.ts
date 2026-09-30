import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { GuestServicesModule } from '../guest-services/guest-services.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({ imports: [ReservationsModule, GuestServicesModule], controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}

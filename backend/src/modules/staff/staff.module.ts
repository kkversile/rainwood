import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

@Module({ imports: [ReservationsModule], controllers: [StaffController], providers: [StaffService] })
export class StaffModule {}

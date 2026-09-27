import { Module } from '@nestjs/common';
import { HotelsModule } from '../hotels/hotels.module';
import { HousekeepingController } from './housekeeping.controller';
import { HousekeepingStaffController } from './housekeeping-staff.controller';
import { HousekeepingService } from './housekeeping.service';

@Module({ imports: [HotelsModule], controllers: [HousekeepingController, HousekeepingStaffController], providers: [HousekeepingService], exports: [HousekeepingService] })
export class HousekeepingModule {}

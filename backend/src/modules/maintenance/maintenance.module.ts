import { Module } from '@nestjs/common';
import { HousekeepingModule } from '../housekeeping/housekeeping.module';
import { HotelsModule } from '../hotels/hotels.module';
import { MaintenanceController } from './maintenance.controller';
import { MaintenanceStaffController } from './maintenance-staff.controller';
import { MaintenanceService } from './maintenance.service';

@Module({ imports: [HousekeepingModule, HotelsModule], controllers: [MaintenanceController, MaintenanceStaffController], providers: [MaintenanceService], exports: [MaintenanceService] })
export class MaintenanceModule {}

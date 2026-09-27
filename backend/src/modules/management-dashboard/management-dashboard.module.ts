import { Module } from '@nestjs/common';
import { ManagementDashboardController } from './management-dashboard.controller';
import { ManagementDashboardService } from './management-dashboard.service';

@Module({ controllers: [ManagementDashboardController], providers: [ManagementDashboardService] })
export class ManagementDashboardModule {}

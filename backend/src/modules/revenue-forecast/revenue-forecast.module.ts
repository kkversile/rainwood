import { Module } from '@nestjs/common';
import { RevenueForecastController } from './revenue-forecast.controller';
import { RevenueManagementController } from './revenue-management.controller';
import { RevenueForecastService } from './revenue-forecast.service';

@Module({ controllers: [RevenueForecastController, RevenueManagementController], providers: [RevenueForecastService], exports: [RevenueForecastService] })
export class RevenueForecastModule {}

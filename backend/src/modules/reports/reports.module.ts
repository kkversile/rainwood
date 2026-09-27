import { Module } from '@nestjs/common'; import { ReportsController } from './reports.controller'; import { ReportsService } from './reports.service'; import { GuestsModule } from '../guests/guests.module';
@Module({ imports: [GuestsModule], controllers: [ReportsController], providers: [ReportsService] }) export class ReportsModule {}

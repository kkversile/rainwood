import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { FilesModule } from '../files/files.module';
import { HotelScopeGuard } from './hotel-scope.guard';
import { HotelRateImportService } from './hotel-rate-import.service';
@Module({ imports: [FilesModule], controllers:[HotelsController],providers:[HotelsService, HotelRateImportService, HotelScopeGuard],exports:[HotelsService]}) export class HotelsModule {}

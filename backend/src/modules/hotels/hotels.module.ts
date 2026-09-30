import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { FilesModule } from '../files/files.module';
import { HotelScopeGuard } from './hotel-scope.guard';
@Module({ imports: [FilesModule], controllers:[HotelsController],providers:[HotelsService, HotelScopeGuard],exports:[HotelsService]}) export class HotelsModule {}

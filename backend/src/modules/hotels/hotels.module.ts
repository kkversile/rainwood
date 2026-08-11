import { Module } from '@nestjs/common';
import { HotelsController } from './hotels.controller';
import { HotelsService } from './hotels.service';
import { FilesModule } from '../files/files.module';
@Module({ imports: [FilesModule], controllers:[HotelsController],providers:[HotelsService],exports:[HotelsService]}) export class HotelsModule {}

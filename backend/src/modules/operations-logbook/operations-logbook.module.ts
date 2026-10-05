import { Module } from '@nestjs/common';
import { OperationsLogbookController } from './operations-logbook.controller';
import { OperationsLogbookService } from './operations-logbook.service';
import { FeaturesModule } from '../features/features.module';

@Module({ imports: [FeaturesModule], controllers: [OperationsLogbookController], providers: [OperationsLogbookService], exports: [OperationsLogbookService] })
export class OperationsLogbookModule {}

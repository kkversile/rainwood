import { Module } from '@nestjs/common';
import { OperationsLogbookController } from './operations-logbook.controller';
import { OperationsLogbookService } from './operations-logbook.service';

@Module({ controllers: [OperationsLogbookController], providers: [OperationsLogbookService], exports: [OperationsLogbookService] })
export class OperationsLogbookModule {}

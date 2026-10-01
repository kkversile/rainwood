import { Module } from '@nestjs/common';
import { TaxDocumentsController } from './tax-documents.controller';
import { TaxDocumentsService } from './tax-documents.service';
import { TaxCalculationService } from './tax-calculation.service';

@Module({ controllers: [TaxDocumentsController], providers: [TaxDocumentsService, TaxCalculationService], exports: [TaxDocumentsService, TaxCalculationService] })
export class TaxDocumentsModule {}

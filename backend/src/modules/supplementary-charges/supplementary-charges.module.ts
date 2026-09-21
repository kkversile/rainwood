import { Module } from '@nestjs/common';
import { SupplementaryChargesController } from './supplementary-charges.controller';
import { SupplementaryChargesService } from './supplementary-charges.service';

@Module({ controllers: [SupplementaryChargesController], providers: [SupplementaryChargesService], exports: [SupplementaryChargesService] })
export class SupplementaryChargesModule {}

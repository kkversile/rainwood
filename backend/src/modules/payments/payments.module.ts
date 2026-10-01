import { Module } from '@nestjs/common';
import { CashierShiftsModule } from '../cashier-shifts/cashier-shifts.module';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';

@Module({ imports: [CashierShiftsModule], providers: [PaymentsService], controllers: [PaymentsController], exports: [PaymentsService] })
export class PaymentsModule {}

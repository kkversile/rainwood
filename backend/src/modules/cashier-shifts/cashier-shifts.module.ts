import { Module } from '@nestjs/common';
import { CashierShiftsController } from './cashier-shifts.controller';
import { CashierShiftsService } from './cashier-shifts.service';

@Module({ controllers: [CashierShiftsController], providers: [CashierShiftsService], exports: [CashierShiftsService] })
export class CashierShiftsModule {}

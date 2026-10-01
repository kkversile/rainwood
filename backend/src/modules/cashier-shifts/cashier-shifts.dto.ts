import { Type } from 'class-transformer';
import { IsDateString, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class OpenCashierShiftDto {
  @IsString()
  hotelId!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  openingCash!: number;

  @IsOptional()
  @IsString()
  openingNote?: string;
}

export class CloseCashierShiftDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  actualCash!: number;

  @IsOptional()
  @IsString()
  closingNote?: string;
}

export class CashierShiftQueryDto {
  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsString()
  cashierId?: string;
}

import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { PaymentMode } from '@prisma/client';

export class ManualPaymentDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;

  @IsEnum(PaymentMode)
  mode!: PaymentMode;

  @IsOptional()
  @IsString()
  reference?: string;

  @IsOptional()
  @IsString()
  proofFileId?: string;
}

export class VerifyPaymentDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class MockCompletionDto {
  @IsOptional()
  @IsIn(['SUCCESS', 'FAILED'])
  status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
}

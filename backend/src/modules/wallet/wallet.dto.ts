import { Type } from 'class-transformer';
import { PaymentMode } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RechargeWalletDto {
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(1) @Max(10000000) amount!: number;
  @IsOptional() @IsString() reference?: string;
}

export class OfflineRechargeWalletDto extends RechargeWalletDto {
  @IsEnum(PaymentMode)
  mode!: PaymentMode;

  @IsString()
  proofFileId!: string;
}

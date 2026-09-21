import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SupplementaryChargeScope } from '@prisma/client';

export class SupplementaryChargeDto {
  @IsString() @MinLength(2) name!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amountPerRoomNight!: number;
  @IsOptional() @IsEnum(SupplementaryChargeScope) scope?: SupplementaryChargeScope;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateSupplementaryChargeDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) amountPerRoomNight?: number;
  @IsOptional() @IsEnum(SupplementaryChargeScope) scope?: SupplementaryChargeScope;
  @IsOptional() @IsBoolean() active?: boolean;
}

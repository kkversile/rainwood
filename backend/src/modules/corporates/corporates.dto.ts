import { CorporatePricingType } from '@prisma/client';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CorporateListQueryDto { @IsOptional() @IsString() hotelId?: string; @IsOptional() @IsString() search?: string; @IsOptional() active?: boolean; }
export class CorporateCreateDto {
  @IsString() @MinLength(2) name!: string; @IsOptional() @IsString() legalName?: string; @IsOptional() @IsString() gstin?: string; @IsOptional() @IsString() pan?: string; @IsOptional() @IsString() billingAddress?: string; @IsOptional() @IsString() city?: string; @IsOptional() @IsString() state?: string; @IsOptional() @IsString() country?: string; @IsOptional() @IsString() postalCode?: string; @IsOptional() @IsString() contactPerson?: string; @IsOptional() @IsString() email?: string; @IsOptional() @IsString() mobile?: string; @IsOptional() @IsNumber() @Min(0) creditLimit?: number; @IsOptional() @IsNumber() @Min(0) creditDays?: number; @IsOptional() active?: boolean;
}
export class CorporateLinkHotelDto { @IsString() hotelId!: string; @IsOptional() @IsString() accountCode?: string; @IsOptional() @IsNumber() @Min(0) creditLimitOverride?: number; @IsOptional() @IsNumber() @Min(0) creditDaysOverride?: number; @IsOptional() active?: boolean; }
export class CorporateRateDto { @IsString() hotelId!: string; @IsString() roomTypeId!: string; @IsString() ratePlanId!: string; @IsDateString() validFrom!: string; @IsDateString() validTo!: string; @IsEnum(CorporatePricingType) pricingType!: CorporatePricingType; @IsOptional() @IsNumber() @Min(0) fixedRate?: number; @IsOptional() @IsNumber() @Min(0) discountPercent?: number; @IsOptional() active?: boolean; }

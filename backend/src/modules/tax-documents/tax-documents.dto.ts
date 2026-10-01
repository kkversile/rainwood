import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TaxCustomerType, TaxInvoiceStatus, TdsStatus } from '@prisma/client';

export class TaxProfileDto {
  @IsOptional() @IsString() id?: string;
  @IsOptional() @IsString() hotelId?: string;
  @IsString() legalName!: string;
  @IsOptional() @IsString() tradeName?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsString() registeredAddress?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() stateCode?: string;
  @IsOptional() @IsString() postalCode?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() invoicePrefix?: string;
  @IsOptional() @IsString() creditNotePrefix?: string;
  @IsOptional() active?: boolean;
}

export class TaxRuleDto {
  @IsOptional() @IsString() hotelId?: string;
  @IsString() name!: string;
  @IsOptional() @IsString() serviceCode?: string;
  @IsOptional() @IsString() description?: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) ratePercent!: number;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string;
  @IsOptional() active?: boolean;
}

export class TaxInvoiceCustomerDto {
  @IsOptional() @IsEnum(TaxCustomerType) customerType?: TaxCustomerType;
  @IsOptional() @IsString() customerName?: string;
  @IsOptional() @IsString() customerGstin?: string;
  @IsOptional() @IsString() customerAddress?: string;
  @IsOptional() @IsString() customerState?: string;
  @IsOptional() @IsString() customerStateCode?: string;
  @IsOptional() @IsString() customerEmail?: string;
  @IsOptional() @IsString() customerMobile?: string;
}

export class TaxInvoiceQueryDto {
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(TaxInvoiceStatus) status?: TaxInvoiceStatus;
  @IsOptional() @IsEnum(TaxCustomerType) customerType?: TaxCustomerType;
  @IsOptional() @IsString() gstin?: string;
}

export class CreditNoteDto {
  @IsString() reason!: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) taxableAmount?: number;
}

export class TdsDto {
  @IsOptional() @IsString() corporateAccountId?: string;
  @IsDateString() deductionDate!: string;
  @IsOptional() @IsString() sectionCode?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) ratePercent?: number;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) tdsAmount!: number;
  @IsOptional() @IsString() certificateNumber?: string;
  @IsOptional() @IsDateString() certificateDate?: string;
  @IsOptional() @IsString() financialYear?: string;
  @IsOptional() @IsEnum(TdsStatus) status?: TdsStatus;
  @IsOptional() @IsString() notes?: string;
}

export class TdsReverseDto {
  @IsString() reason!: string;
}

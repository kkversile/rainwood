import { PaymentMode, ExpenseStatus } from '@prisma/client';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class ExpenseListQueryDto {
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsEnum(ExpenseStatus) status?: ExpenseStatus;
  @IsOptional() @IsEnum(PaymentMode) paymentMode?: PaymentMode;
}

export class ExpenseCreateDto {
  @IsString() @MinLength(1) hotelId!: string;
  @IsDateString() expenseDate!: string;
  @IsString() @MinLength(1) categoryId!: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsString() @MinLength(1) description!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsNumber() @Min(0) taxableAmount?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsNumber() @Min(0) totalAmount?: number;
  @IsEnum(PaymentMode) paymentMode!: PaymentMode;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ExpenseUpdateDto {
  @IsOptional() @IsDateString() expenseDate?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() vendorId?: string;
  @IsOptional() @IsString() @MinLength(1) description?: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsNumber() @Min(0) taxableAmount?: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsNumber() @Min(0) totalAmount?: number;
  @IsOptional() @IsEnum(PaymentMode) paymentMode?: PaymentMode;
  @IsOptional() @IsString() paymentReference?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ExpenseCategoryDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() active?: boolean;
}

export class VendorDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() legalName?: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() pan?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsInt() @Min(0) paymentTermsDays?: number;
  @IsOptional() active?: boolean;
  @IsOptional() @IsString() hotelId?: string;
}

import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { BookingSource, FolioChargeCategory, ModificationType } from '@prisma/client';

export class CreateReservationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  guestName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(30)
  mobile!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsOptional()
  @IsString()
  specialRequest?: string;

  @IsOptional()
  @IsString()
  billingInstruction?: string;

  @IsOptional()
  @IsString()
  internalRemark?: string;
}

export class ManualReservationDto extends CreateReservationDto {
  @IsString()
  holdToken!: string;
}

export class CancellationDto {
  @IsString()
  @MinLength(2)
  reason!: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ModificationDto {
  @IsOptional()
  @IsEnum(ModificationType)
  type?: ModificationType;

  @IsOptional()
  @IsString()
  guestName?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  mobile?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  gstin?: string;

  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;

  @IsOptional()
  @IsString()
  sourceName?: string;

  @IsOptional()
  @IsString()
  specialRequest?: string;

  @IsOptional()
  @IsString()
  billingInstruction?: string;

  @IsOptional()
  @IsString()
  internalRemark?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ReservationListQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit = 25;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class RatePlanListQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

export class PayDueMilestonesDto {
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class ReconfirmationDto {
  @IsBoolean()
  reconfirmed!: boolean;
}

export class FolioChargeDto {
  @IsEnum(FolioChargeCategory)
  category!: FolioChargeCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  unitAmount!: number;

  @IsDateString()
  postingDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}

export class VoidFolioChargeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  reason!: string;
}

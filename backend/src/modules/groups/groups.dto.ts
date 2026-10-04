import { Transform, Type } from 'class-transformer';
import { BookingSource, GroupBillingInstruction, GroupReservationStatus, GroupType } from '@prisma/client';
import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class GroupListQueryDto {
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsEnum(GroupReservationStatus) status?: GroupReservationStatus;
  @IsOptional() @IsString() corporateId?: string;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsDateString() arrivalFrom?: string;
  @IsOptional() @IsDateString() arrivalTo?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class GroupCreateDto {
  @IsString() @MinLength(2) @MaxLength(160) groupName!: string;
  @IsEnum(GroupType) groupType: GroupType = GroupType.OTHER;
  @IsDateString() arrivalDate!: string;
  @IsDateString() departureDate!: string;
  @IsString() @MinLength(2) @MaxLength(120) primaryContactName!: string;
  @IsString() @MinLength(5) @MaxLength(30) primaryContactMobile!: string;
  @IsOptional() @IsEmail() primaryContactEmail?: string;
  @IsString() hotelId!: string;
  @IsOptional() @IsString() corporateId?: string;
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsEnum(BookingSource) source?: BookingSource;
  @IsOptional() @IsEnum(GroupBillingInstruction) billingInstruction?: GroupBillingInstruction;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsDateString() cutoffDate?: string;
  @IsOptional() @IsDateString() roomingListDueDate?: string;
}

export class GroupUpdateDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) groupName?: string;
  @IsOptional() @IsEnum(GroupType) groupType?: GroupType;
  @IsOptional() @IsDateString() arrivalDate?: string;
  @IsOptional() @IsDateString() departureDate?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) primaryContactName?: string;
  @IsOptional() @IsString() @MinLength(5) @MaxLength(30) primaryContactMobile?: string;
  @IsOptional() @IsEmail() primaryContactEmail?: string;
  @IsOptional() @IsString() corporateId?: string | null;
  @IsOptional() @IsString() agentId?: string | null;
  @IsOptional() @IsEnum(BookingSource) source?: BookingSource;
  @IsOptional() @IsEnum(GroupBillingInstruction) billingInstruction?: GroupBillingInstruction;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  @IsOptional() @IsDateString() cutoffDate?: string | null;
  @IsOptional() @IsDateString() roomingListDueDate?: string | null;
}

export class GroupBlockNightDto {
  @IsDateString() date!: string;
  @Type(() => Number) @IsInt() @Min(1) roomsBlocked!: number;
}

export class GroupBlockCreateDto {
  @IsString() roomTypeId!: string;
  @IsOptional() @IsString() ratePlanId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) agreedRate?: number;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GroupBlockNightDto) nights!: GroupBlockNightDto[];
}

export class GroupBlockUpdateDto {
  @IsOptional() @IsString() ratePlanId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) agreedRate?: number | null;
  @IsOptional() @IsString() @MaxLength(3) currency?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string | null;
  @IsArray() @ValidateNested({ each: true }) @Type(() => GroupBlockNightDto) nights!: GroupBlockNightDto[];
}

export class RoomingListEntryDto {
  @IsString() @MinLength(2) @MaxLength(160) guestName!: string;
  @IsOptional() @IsString() @MaxLength(30) mobile?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsString() roomTypeId!: string;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @Type(() => Number) @IsInt() @Min(1) adults = 1;
  @Type(() => Number) @IsInt() @Min(0) children = 0;
  @IsOptional() @IsString() @MaxLength(1000) specialRequest?: string;
  @IsOptional() @IsString() @MaxLength(120) externalReference?: string;
}

export class RoomingListBulkDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => RoomingListEntryDto) entries!: RoomingListEntryDto[];
}

export class RoomingListImportDto {
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() commit = false;
}

export class PickupDto {
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BulkPickupDto {
  @IsArray() @IsString({ each: true }) entryIds!: string[];
}

import { BanquetBEOStatus, BanquetChargeCategory, BanquetEventStatus, BanquetEventType, BanquetFunctionStatus, BanquetRequirementCategory, BanquetRequirementStatus, BanquetSetupStyle, FunctionSpaceType } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';

export class FunctionSpaceListQueryDto { @IsOptional() @IsString() hotelId?: string; @IsOptional() @IsString() search?: string; @IsOptional() @IsEnum(FunctionSpaceType) spaceType?: FunctionSpaceType; @IsOptional() active?: boolean; }
export class BanquetLinkOptionsQueryDto { @IsString() hotelId!: string; @IsOptional() @IsString() search?: string; }
export class FunctionSpaceCreateDto {
  @IsString() hotelId!: string; @IsString() @MinLength(2) name!: string; @IsString() @MinLength(1) @Matches(/^[A-Za-z0-9_-]+$/) code!: string; @IsEnum(FunctionSpaceType) spaceType!: FunctionSpaceType;
  @IsOptional() @IsString() floor?: string; @IsOptional() @IsString() locationDescription?: string; @IsOptional() @IsNumber() @Min(0) areaSqFt?: number;
  @IsOptional() @IsInt() @Min(0) capacityTheatre?: number; @IsOptional() @IsInt() @Min(0) capacityClassroom?: number; @IsOptional() @IsInt() @Min(0) capacityBoardroom?: number; @IsOptional() @IsInt() @Min(0) capacityUShape?: number; @IsOptional() @IsInt() @Min(0) capacityBanquet?: number; @IsOptional() @IsInt() @Min(0) capacityReception?: number;
  @IsOptional() active?: boolean; @IsOptional() outOfService?: boolean; @IsOptional() @IsString() notes?: string;
}
export class FunctionSpaceUpdateDto {
  @IsOptional() @IsString() @MinLength(2) name?: string; @IsOptional() @IsString() @MinLength(1) @Matches(/^[A-Za-z0-9_-]+$/) code?: string; @IsOptional() @IsEnum(FunctionSpaceType) spaceType?: FunctionSpaceType; @IsOptional() @IsString() floor?: string; @IsOptional() @IsString() locationDescription?: string; @IsOptional() @IsNumber() @Min(0) areaSqFt?: number; @IsOptional() @IsInt() @Min(0) capacityTheatre?: number; @IsOptional() @IsInt() @Min(0) capacityClassroom?: number; @IsOptional() @IsInt() @Min(0) capacityBoardroom?: number; @IsOptional() @IsInt() @Min(0) capacityUShape?: number; @IsOptional() @IsInt() @Min(0) capacityBanquet?: number; @IsOptional() @IsInt() @Min(0) capacityReception?: number; @IsOptional() active?: boolean; @IsOptional() outOfService?: boolean; @IsOptional() @IsString() notes?: string;
}

export class BanquetEventListQueryDto { @IsOptional() @IsString() hotelId?: string; @IsOptional() @IsString() search?: string; @IsOptional() @IsEnum(BanquetEventStatus) status?: BanquetEventStatus; @IsOptional() @IsEnum(BanquetEventType) eventType?: BanquetEventType; @IsOptional() @IsDateString() from?: string; @IsOptional() @IsDateString() to?: string; @IsOptional() @IsString() functionSpaceId?: string; @IsOptional() @IsString() corporateId?: string; @IsOptional() @IsString() groupReservationId?: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1; @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit = 25; }
export class BanquetEventCreateDto {
  @IsString() hotelId!: string; @IsString() @MinLength(2) eventName!: string; @IsEnum(BanquetEventType) eventType!: BanquetEventType; @IsOptional() @IsEnum(BanquetEventStatus) status?: BanquetEventStatus;
  @IsOptional() @IsString() groupReservationId?: string; @IsOptional() @IsString() inquiryId?: string; @IsOptional() @IsString() corporateId?: string; @IsOptional() @IsString() agentId?: string;
  @IsString() @MinLength(2) primaryContactName!: string; @IsString() @MinLength(5) primaryContactMobile!: string; @IsOptional() @IsEmail() primaryContactEmail?: string;
  @IsDateString() startDate!: string; @IsDateString() endDate!: string; @IsOptional() @IsInt() @Min(0) expectedPax?: number; @IsOptional() @IsInt() @Min(0) guaranteedPax?: number; @IsOptional() @IsString() notes?: string;
}
export class BanquetEventUpdateDto {
  @IsOptional() @IsString() @MinLength(2) eventName?: string; @IsOptional() @IsEnum(BanquetEventType) eventType?: BanquetEventType; @IsOptional() @IsEnum(BanquetEventStatus) status?: BanquetEventStatus; @IsOptional() @IsString() groupReservationId?: string | null; @IsOptional() @IsString() inquiryId?: string | null; @IsOptional() @IsString() corporateId?: string | null; @IsOptional() @IsString() agentId?: string | null; @IsOptional() @IsString() @MinLength(2) primaryContactName?: string; @IsOptional() @IsString() @MinLength(5) primaryContactMobile?: string; @IsOptional() @IsEmail() primaryContactEmail?: string | null; @IsOptional() @IsDateString() startDate?: string; @IsOptional() @IsDateString() endDate?: string; @IsOptional() @IsInt() @Min(0) expectedPax?: number; @IsOptional() @IsInt() @Min(0) guaranteedPax?: number; @IsOptional() @IsString() notes?: string | null; @IsOptional() @IsString() reason?: string;
}

export class BanquetFunctionCreateDto {
  @IsString() functionSpaceId!: string; @IsString() @MinLength(2) functionName!: string; @IsDateString() functionDate!: string; @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string; @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string; @IsEnum(BanquetSetupStyle) setupStyle!: BanquetSetupStyle; @IsOptional() @IsInt() @Min(0) expectedPax?: number; @IsOptional() @IsInt() @Min(0) guaranteedPax?: number; @IsOptional() @IsEnum(BanquetFunctionStatus) status?: BanquetFunctionStatus; @IsOptional() @IsString() notes?: string;
}
export class BanquetFunctionUpdateDto extends BanquetFunctionCreateDto {}
export class BanquetCalendarQueryDto { @IsString() hotelId!: string; @IsDateString() from!: string; @IsOptional() @Type(() => Number) @IsInt() @Min(1) days = 1; @IsOptional() @IsString() search?: string; }
export class FunctionAvailabilityQueryDto { @IsString() hotelId!: string; @IsDateString() date!: string; @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) startTime!: string; @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) endTime!: string; @IsOptional() @Type(() => Number) @IsInt() @Min(0) pax?: number; @IsOptional() @IsEnum(BanquetSetupStyle) setupStyle?: BanquetSetupStyle; }

export class BeoScheduleItemDto { @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/) itemTime!: string; @IsString() @MinLength(1) description!: string; @IsOptional() @IsInt() @Min(0) sortOrder?: number; }
export class BeoRequirementDto { @IsEnum(BanquetRequirementCategory) category!: BanquetRequirementCategory; @IsString() @MinLength(1) description!: string; @IsOptional() @IsNumber() @Min(0) quantity?: number; @IsOptional() @IsString() requiredAt?: string; @IsString() @MinLength(1) department!: string; @IsOptional() @IsString() notes?: string; @IsOptional() @IsEnum(BanquetRequirementStatus) status?: BanquetRequirementStatus; }
export class BeoChargeLineDto { @IsEnum(BanquetChargeCategory) category!: BanquetChargeCategory; @IsString() @MinLength(1) description!: string; @IsNumber() @Min(0) quantity!: number; @IsNumber() @Min(0) unitAmount!: number; @IsOptional() @IsString() notes?: string; }
export class BeoUpdateDto { @IsOptional() @IsString() operationalNotes?: string; @IsOptional() schedule?: BeoScheduleItemDto[]; @IsOptional() requirements?: BeoRequirementDto[]; @IsOptional() charges?: BeoChargeLineDto[]; }
export class RequirementStatusDto { @IsEnum(BanquetRequirementStatus) status!: BanquetRequirementStatus; }
export class EventStatusDto { @IsEnum(BanquetEventStatus) status!: BanquetEventStatus; @IsOptional() @IsString() reason?: string; }

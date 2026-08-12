import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class HotelContentDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  city!: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() place?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() latitude?: string;
  @IsOptional() @IsString() longitude?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() margin?: string;
  @IsOptional() @IsBoolean() powerBackup?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsString()
  canonicalPath?: string;

  @IsOptional()
  @IsString()
  ogImageUrl?: string;

  @IsOptional()
  @IsString()
  axisPropertyId?: string;
}

export class HotelUpdateDto {
  @IsOptional() @IsString() @MinLength(2) code?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(2) slug?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() mobile?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() place?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() pincode?: string;
  @IsOptional() @IsString() latitude?: string;
  @IsOptional() @IsString() longitude?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsString() margin?: string;
  @IsOptional() @IsBoolean() powerBackup?: boolean;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @IsString() canonicalPath?: string;
  @IsOptional() @IsString() ogImageUrl?: string;
  @IsOptional() @IsString() axisPropertyId?: string;
}

export class RoomTypeDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() roomTypeTitle?: string;
  @IsOptional() @IsInt() @Min(0) roomsAvailable?: number;
  @IsOptional() @IsString() preferredFor?: string;
  @IsOptional() @IsBoolean() acAvailable?: boolean;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsInt() maxAdults?: number;
  @IsOptional() @IsInt() maxChildren?: number;
  @IsOptional() @IsInt() maxOccupancy?: number;
  @IsOptional() @IsString() checkInTime?: string;
  @IsOptional() @IsString() checkOutTime?: string;
  @IsOptional() @IsString() gstType?: string;
  @IsOptional() @IsString() gstPercentage?: string;
  @IsOptional() @IsString() inbuiltAmenities?: string;
  @IsOptional() @IsBoolean() breakfastIncluded?: boolean;
  @IsOptional() @IsBoolean() lunchIncluded?: boolean;
  @IsOptional() @IsBoolean() dinnerIncluded?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() axisRoomId?: string;
}

export class RatePlanDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() mealPlan!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() axisRatePlanId?: string;
}

export class InventoryDayDto {
  @IsDateString() date!: string;
  @IsInt() @Min(0) available!: number;
  @IsOptional() @IsBoolean() stopSell?: boolean;
}

export class RateDayDto {
  @IsDateString() date!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @IsNumber() @Min(0) childAmount?: number;
  @IsOptional() @IsNumber() @Min(0) extraAdultAmount?: number;
  @IsOptional() @IsObject() occupancyPrices?: Record<string, number>;
  @IsOptional() @IsBoolean() cta?: boolean;
  @IsOptional() @IsBoolean() ctd?: boolean;
  @IsOptional() @IsInt() @Min(1) minLos?: number;
  @IsOptional() @IsInt() @Min(1) maxLos?: number;
}

export class InventoryBatchDto { @IsArray() @ValidateNested({ each: true }) @Type(() => InventoryDayDto) days!: InventoryDayDto[]; }
export class RateBatchDto { @IsArray() @ValidateNested({ each: true }) @Type(() => RateDayDto) days!: RateDayDto[]; }
export class AmenityDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsInt() @Min(1) quantity?: number;
  @IsOptional() @IsString() availabilityType?: string;
  @IsOptional() @IsString() startTime?: string;
  @IsOptional() @IsString() endTime?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class HotelImageDto { @IsString() @MinLength(1) url!: string; @IsOptional() @IsString() altText?: string; @IsOptional() @IsInt() @Min(0) sortOrder?: number; @IsOptional() @IsBoolean() published?: boolean; }
export class HotelReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @MinLength(1) @MaxLength(5000) description!: string;
}

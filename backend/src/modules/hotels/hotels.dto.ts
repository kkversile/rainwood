import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

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
  @IsOptional() @IsString() propertyType?: string;
  @IsOptional() @IsString() location?: string;
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
  virtualTourUrl?: string;

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
  @IsOptional() @IsString() propertyType?: string;
  @IsOptional() @IsString() location?: string;
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
  @IsOptional() @IsString() virtualTourUrl?: string;
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

export class RatePlanMasterDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsString() @IsIn(['EP', 'CP', 'MAP', 'AP']) mealPlan!: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) roomTypeIds?: string[];
}

export class RatePlanAssignmentDto {
  @IsString() @MinLength(1) roomTypeId!: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() axisRatePlanId?: string;
}

export class RatePlanAssignmentUpdateDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() axisRatePlanId?: string;
}

export class CopyRatePlanDto {
  @IsString() @MinLength(1) targetRoomTypeId!: string;
  @IsOptional() @IsBoolean() copyRates?: boolean;
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
export class HotelImageDto {
  @IsString() @MinLength(1) url!: string;
  @IsOptional() @IsString() altText?: string;
  @IsOptional() @IsIn(['ROOMS', 'AMENITIES', 'RESTAURANT', 'EXTERIOR', 'OTHERS']) category?: string;
  @IsOptional() @IsBoolean() isMain?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() published?: boolean;
}
export class HotelImageUpdateDto {
  @IsOptional() @IsString() @MinLength(1) altText?: string;
  @IsOptional() @IsIn(['ROOMS', 'AMENITIES', 'RESTAURANT', 'EXTERIOR', 'OTHERS']) category?: string;
  @IsOptional() @IsBoolean() isMain?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
  @IsOptional() @IsBoolean() published?: boolean;
}
export class HotelImageOrderDto { @IsArray() @ArrayNotEmpty() @IsString({ each: true }) imageIds!: string[]; }
export class HotelVideoDto {
  @IsString() @MinLength(1) fileId!: string;
  @IsString() @MinLength(1) url!: string;
  @IsString() @MinLength(1) title!: string;
  @IsString() @MinLength(1) fileName!: string;
  @IsString() @MinLength(1) mimeType!: string;
  @IsInt() @Min(1) size!: number;
  @IsOptional() @IsString() duration?: string;
  @IsOptional() @IsString() thumbnailUrl?: string;
}
export class HotelReviewDto {
  @IsInt() @Min(1) @Max(5) rating!: number;
  @IsString() @MinLength(1) @MaxLength(5000) description!: string;
}
export class CancellationRuleDto {
  @IsInt() @Min(0) fromDays!: number;
  @IsInt() @Min(0) toDays!: number;
  @IsNumber() @Min(0) charge!: number;
  @IsIn(['PERCENT', 'FIXED']) chargeType!: 'PERCENT' | 'FIXED';
}

export class HotelPolicyDto {
  @IsOptional() @IsString() @MaxLength(8) checkInTime?: string;
  @IsOptional() @IsString() @MaxLength(8) checkOutTime?: string;
  @IsOptional() @IsInt() @Min(0) childMinAge?: number;
  @IsOptional() @IsInt() @Min(0) childMaxAge?: number;
  @IsOptional() @IsIn(['FREE', 'CHARGEABLE', 'CUSTOM']) childPolicyType?: string;
  @IsOptional() @IsString() @MaxLength(5000) houseRules?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CancellationRuleDto) cancellationRules?: CancellationRuleDto[];
  @IsOptional() @IsIn(['TOTAL', 'SPECIFIC', 'CUSTOM']) noShowPolicy?: string;
  @IsOptional() @IsNumber() @Min(0) noShowAmount?: number | null;
  @IsOptional() @IsString() @MaxLength(2000) noShowCustomText?: string;
  @IsOptional() @IsIn(['CHARGES_APPLY', 'WITHOUT_CHARGES', 'NOT_ALLOWED']) amendmentPolicy?: string;
  @IsOptional() @IsString() @MaxLength(2000) termsAndConditions?: string;
  @IsOptional() @IsBoolean() allowEarlyCheckIn?: boolean;
  @IsOptional() @IsBoolean() allowLateCheckOut?: boolean;
  @IsOptional() @IsBoolean() allowExtraBed?: boolean;
  @IsOptional() @IsBoolean() allowPets?: boolean;
  @IsOptional() @IsBoolean() allowOutsideFood?: boolean;
  @IsOptional() @IsBoolean() smokingAllowed?: boolean;
  @IsOptional() @IsBoolean() alcoholAllowed?: boolean;
}
export class HotelContactDto {
  @IsString() @MinLength(2) contactType!: string; @IsString() @MinLength(2) name!: string; @IsOptional() @IsString() designation?: string; @IsOptional() @IsString() department?: string;
  @IsEmail() email!: string; @IsOptional() @IsString() phone?: string; @IsOptional() @IsString() mobile?: string; @IsOptional() @IsString() preferredMode?: string;
  @IsOptional() @IsBoolean() primary?: boolean; @IsOptional() @IsString() remarks?: string; @IsOptional() @IsBoolean() active?: boolean;
}
export class HotelDocumentDto { @IsString() documentType!: string; @IsString() name!: string; @IsString() fileId!: string; @IsString() fileName!: string; @IsOptional() @IsDateString() expiryDate?: string | null; }
export class HotelDocumentUpdateDto { @IsOptional() @IsString() documentType?: string; @IsOptional() @IsString() name?: string; @IsOptional() @IsDateString() expiryDate?: string | null; }

export class HotelLocationProfileDto {
  @IsOptional() @IsString() @MaxLength(250) addressLine1?: string;
  @IsOptional() @IsString() @MaxLength(250) addressLine2?: string;
  @IsOptional() @IsString() @MaxLength(120) timezone?: string;
  @IsOptional() @IsString() @MaxLength(120) bestTimeToVisit?: string;
  @IsOptional() @IsString() @MaxLength(120) elevation?: string;
  @IsOptional() @IsString() @MaxLength(160) weather?: string;
  @IsOptional() @IsString() @MaxLength(160) nearbyCity?: string;
  @IsOptional() @IsString() @MaxLength(160) accessRoad?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class HotelLocationAttractionDto {
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MaxLength(40) distance!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class HotelLocationTransportDto {
  @IsString() @IsIn(['AIRPORT', 'TRAIN', 'BUS', 'OTHER']) type!: string;
  @IsString() @MinLength(2) @MaxLength(160) name!: string;
  @IsString() @MaxLength(40) distance!: string;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

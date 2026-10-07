import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

const CATEGORIES = ['A', 'B', 'C', 'D', 'E'] as const;
const GRID_BANDS = ['RACK', ...CATEGORIES] as const;
const GRID_FIELDS = ['single', 'double', 'extraAdult', 'childWithBed', 'childWithoutBed'] as const;

export class RateMasterQueryDto {
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsString() roomTypeId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() mealPlan?: string;
  @IsOptional() @IsString() status?: string;
}

export class RateMasterUpdateDto {
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) single?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) double?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) triple?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) taxAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) extraAdultAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) childAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) categoryAAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) categoryBAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) categoryCAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) categoryDAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) categoryEAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) supplementExtraAdultAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) supplementChildWithBedAmount?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) supplementChildWithoutBedAmount?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RateMasterGridQueryDto {
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class RateMasterGridChangeDto {
  @IsString() ratePlanId!: string;
  @IsIn(GRID_BANDS) band!: (typeof GRID_BANDS)[number];
  @IsOptional() @IsArray() @IsIn(GRID_FIELDS, { each: true }) fields?: (typeof GRID_FIELDS)[number][];
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) single?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) double?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) extraAdult?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) childWithBed?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0) childWithoutBed?: number;
}

export class RateMasterGridSaveDto {
  @IsString() hotelId!: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RateMasterGridChangeDto) changes!: RateMasterGridChangeDto[];
}

export class AgentMappingDto {
  @IsString() hotelId!: string;
  @IsIn(CATEGORIES) category!: (typeof CATEGORIES)[number];
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AgentMappingQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() hotelId?: string;
}

import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

const CATEGORIES = ['A', 'B', 'C', 'D', 'E'] as const;

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

import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class AgentRateSlabDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  @IsOptional() @IsString() @MaxLength(5000) description?: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AgentRateSlabRateDto {
  @IsString() ratePlanId!: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) extraAdultAmount?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) extraChildWithBedAmount?: number;
  @Type(() => Number) @IsOptional() @IsNumber() @Min(0) childWithoutBedAmount?: number;
  @IsOptional() occupancyPrices?: Record<string, number> | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AgentRateSlabRatesDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => AgentRateSlabRateDto) rates!: AgentRateSlabRateDto[];
}

export class AgentRateSlabAssignmentDto {
  @IsString() slabId!: string;
  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class AgentRateRangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

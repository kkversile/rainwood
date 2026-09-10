import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsObject, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class AgentRateDayDto {
  @IsDateString() date!: string;
  @IsOptional() @IsNumber() @Min(0) amount?: number | null;
  @IsOptional() @IsNumber() @Min(0) taxAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) childAmount?: number | null;
  @IsOptional() @IsNumber() @Min(0) extraAdultAmount?: number | null;
  @IsOptional() @IsObject() occupancyPrices?: Record<string, number> | null;
}

export class AgentRateBatchDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AgentRateDayDto)
  days!: AgentRateDayDto[];
}

export class AgentRatePlanUpdateDto {
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsIn(['BASE', 'OVERRIDE']) pricingMode?: string;
}

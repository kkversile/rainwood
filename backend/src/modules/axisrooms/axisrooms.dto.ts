import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

export class AxisInventoryItemDto {
  @IsString() roomId!: string;
  @IsDateString() date!: string;
  @Type(() => Number) @IsInt() @Min(0) available!: number;
  @IsOptional() @IsBoolean() stopSell?: boolean;
}

export class AxisRateItemDto {
  @IsString() roomId!: string;
  @IsString() ratePlanId!: string;
  @IsDateString() date!: string;
  @Type(() => Number) @IsNumber() amount!: number;
  @IsOptional() @Type(() => Number) @IsNumber() taxAmount?: number;
  @IsOptional() @IsBoolean() cta?: boolean;
  @IsOptional() @IsBoolean() ctd?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) minLos?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxLos?: number;
}

export class AxisInventoryDto {
  @IsString() propertyId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AxisInventoryItemDto) inventory!: AxisInventoryItemDto[];
}

export class AxisRatesDto {
  @IsString() propertyId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => AxisRateItemDto) rates!: AxisRateItemDto[];
}

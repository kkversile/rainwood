import { Transform, Type } from 'class-transformer';
import { BookingSource, ReservationStatus } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

function listValue(value: unknown): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const values = Array.isArray(value) ? value : [value];
  const result = values.flatMap((item) => String(item).split(',')).map((item) => item.trim()).filter(Boolean);
  return result.length ? result : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'yes', 'on'].includes(String(value).toLowerCase());
}

export class ReportQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsString() source?: BookingSource;
  @IsOptional() @IsEnum(BookingSource, { each: true }) @Transform(({ value }) => listValue(value)) sources?: BookingSource[];
  @IsOptional() @IsEnum(ReservationStatus) status?: ReservationStatus;
  @IsOptional() @IsEnum(ReservationStatus, { each: true }) @Transform(({ value }) => listValue(value)) statuses?: ReservationStatus[];
  @IsOptional() @IsString({ each: true }) @Transform(({ value }) => listValue(value)) hotelIds?: string[];
  @IsOptional() @IsBoolean() @Transform(({ value }) => booleanValue(value)) includeWaitlist?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => booleanValue(value)) reconfirmedOnly?: boolean;
  @IsOptional() @IsBoolean() @Transform(({ value }) => booleanValue(value)) showRemarks?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit = 50;
}

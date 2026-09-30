import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { REVENUE_FORECAST_HORIZON_DAYS } from './revenue-forecast.constants';

export class RevenueForecastQueryDto {
  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsOptional()
  @IsDateString()
  observationDate?: string;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsOptional()
  @IsString()
  roomTypeId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVENUE_FORECAST_HORIZON_DAYS)
  horizon = REVENUE_FORECAST_HORIZON_DAYS;

  @IsOptional()
  @IsString()
  pickupWindows = '1,3,7,14,30';
}

export class RevenueForecastCaptureDto {
  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsOptional()
  @IsDateString()
  observationDate?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(REVENUE_FORECAST_HORIZON_DAYS)
  horizon = REVENUE_FORECAST_HORIZON_DAYS;
}

export class BookingCurveQueryDto {
  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsDateString()
  stayDate!: string;

  @IsOptional()
  @IsString()
  roomTypeId?: string;
}

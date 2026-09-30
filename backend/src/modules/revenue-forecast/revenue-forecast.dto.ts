import { IsDateString, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

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
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  horizon = 30;

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
  @Max(90)
  horizon = 30;
}

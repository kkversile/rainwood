import { Type } from 'class-transformer';
import { IsArray, IsDateString, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class RoomOccupancyDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) adults!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) children = 0;
}

export class AvailabilityQueryDto {
  @IsOptional()
  @IsString()
  hotelId?: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  rooms = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  adults = 2;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  children = 0;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoomOccupancyDto)
  occupancies?: RoomOccupancyDto[];
}

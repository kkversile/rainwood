import { Type } from 'class-transformer';
import { BookingSource } from '@prisma/client';
import { IsArray, IsDateString, IsEmail, IsEnum, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class HoldOccupancyDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) adults!: number;
  @Type(() => Number) @IsInt() @Min(0) @Max(100) children = 0;
  @Type(() => Number) @IsOptional() @IsInt() @Min(0) @Max(100) childrenWithBed?: number;
  @Type(() => Number) @IsOptional() @IsInt() @Min(0) @Max(100) childrenWithoutBed?: number;
}

export class HoldLineDto {
  @IsString()
  hotelId!: string;

  @IsString()
  roomTypeId!: string;

  @IsString()
  ratePlanId!: string;

  @IsDateString()
  checkIn!: string;

  @IsDateString()
  checkOut!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  rooms = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  adults = 2;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  children = 0;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) childrenWithBed?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) childrenWithoutBed?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HoldOccupancyDto)
  occupancies?: HoldOccupancyDto[];

  @IsOptional()
  @IsEnum(BookingSource)
  source?: BookingSource;

  @IsOptional()
  @IsString()
  promotionCode?: string;

  @IsOptional()
  @IsString()
  corporateAccountId?: string;
}

export class HoldCreateDto extends HoldLineDto {
  @IsOptional()
  @IsEmail()
  guestEmail?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => HoldLineDto)
  lines?: HoldLineDto[];
}

import { Type } from 'class-transformer';
import { IsDateString, IsEmail, IsInt, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

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

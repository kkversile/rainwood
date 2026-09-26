import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FolioChargeCategory } from '@prisma/client';
import { IsEnum, IsNumber, Min } from 'class-validator';

export class StaffStaysQueryDto {
  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

export class StaffFolioChargeDto {
  @IsEnum(FolioChargeCategory)
  category!: FolioChargeCategory;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  description!: string;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  unitAmount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;

  @IsString()
  @MinLength(8)
  @MaxLength(120)
  idempotencyKey!: string;
}

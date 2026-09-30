import { Type } from 'class-transformer';
import { IsDateString, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FolioChargeCategory, LostFoundType, StaffDepartment } from '@prisma/client';
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

export class StaffServiceOrderDto {
  @IsEnum(StaffDepartment)
  department!: StaffDepartment;
  @IsOptional() @IsString() roomAssignmentId?: string;
  @IsString() @MinLength(8) @MaxLength(120) idempotencyKey!: string;
  @IsString() linesJson!: string;
}

export class StaffFoundItemDto {
  @IsEnum(LostFoundType) type!: LostFoundType;
  @IsString() @MinLength(2) itemCategory!: string;
  @IsString() @MinLength(2) description!: string;
  @IsOptional() @IsString() roomId?: string;
  @IsOptional() @IsString() locationFound?: string;
  @IsOptional() @IsDateString() foundAt?: string;
  @IsOptional() @IsString() notes?: string;
}

import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class NightAuditPreviewQueryDto {
  @IsOptional() @IsString() @MinLength(1) hotelId?: string;
  @IsOptional() @IsDateString() date?: string;
}

export class NightAuditCloseDto {
  @IsString() @MinLength(1) hotelId!: string;
  @IsDateString() businessDate!: string;
}

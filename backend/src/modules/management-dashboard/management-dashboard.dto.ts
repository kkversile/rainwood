import { IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

export class ManagementDashboardQueryDto {
  @IsOptional() @IsString() @MinLength(1) hotelId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

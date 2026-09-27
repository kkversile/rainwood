import { MaintenanceCategory, MaintenancePriority, MaintenanceTicketSource, MaintenanceTicketStatus } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class MaintenanceBoardQueryDto {
  @IsOptional() @IsEnum(MaintenanceTicketStatus) status?: MaintenanceTicketStatus;
  @IsOptional() @IsEnum(MaintenancePriority) priority?: MaintenancePriority;
  @IsOptional() @IsEnum(MaintenanceCategory) category?: MaintenanceCategory;
  @IsOptional() @IsEnum(MaintenanceTicketSource) source?: MaintenanceTicketSource;
  @IsOptional() @IsString() @MaxLength(80) hotelId?: string;
  @IsOptional() @IsString() @MaxLength(80) assignedToId?: string;
  @IsOptional() @IsString() @MaxLength(80) roomId?: string;
}

export class MaintenanceCreateDto {
  @IsOptional() @IsString() @MaxLength(80) hotelId?: string;
  @IsOptional() @IsString() @MaxLength(80) roomId?: string;
  @IsOptional() @IsEnum(MaintenanceTicketSource) source?: MaintenanceTicketSource;
  @IsEnum(MaintenanceCategory) category!: MaintenanceCategory;
  @IsOptional() @IsEnum(MaintenancePriority) priority?: MaintenancePriority;
  @IsString() @MinLength(2) @MaxLength(160) title!: string;
  @IsString() @MinLength(2) @MaxLength(2000) description!: string;
}

export class MaintenanceUpdateDto {
  @IsOptional() @IsEnum(MaintenanceCategory) category?: MaintenanceCategory;
  @IsOptional() @IsEnum(MaintenancePriority) priority?: MaintenancePriority;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(160) title?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(2000) description?: string;
}

export class MaintenanceAssignDto {
  @IsString() @MinLength(1) @MaxLength(80) staffUserId!: string;
}

export class MaintenanceResolveDto {
  @IsString() @MinLength(2) @MaxLength(1000) resolutionNote!: string;
}

export class MaintenanceImpactDto {
  @IsBoolean() requiresOutOfOrder!: boolean;
}

export class MaintenanceStaffQueryDto {
  @IsOptional() @IsEnum(MaintenanceTicketStatus) status?: MaintenanceTicketStatus;
  @IsOptional() @IsString() @MaxLength(20) view?: 'OPEN' | 'MINE' | 'IN_PROGRESS';
}

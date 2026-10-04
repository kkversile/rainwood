import { OperationsLogCategory, OperationsLogPriority, OperationsLogStatus, StaffDepartment } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsDateString, IsEnum, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';

export class OperationsLogListQueryDto {
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsDateString() businessDate?: string;
  @IsOptional() @IsEnum(OperationsLogStatus) status?: OperationsLogStatus;
  @IsOptional() @IsEnum(OperationsLogPriority) priority?: OperationsLogPriority;
  @IsOptional() @IsEnum(OperationsLogCategory) category?: OperationsLogCategory;
  @IsOptional() @IsEnum(StaffDepartment) assignedDepartment?: StaffDepartment;
  @IsOptional() @IsString() assignedUserId?: string;
  @IsOptional() @IsString() roomId?: string;
  @IsOptional() @IsString() reservationId?: string;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
}

export class OperationsLogCreateDto {
  @IsString() hotelId!: string;
  @IsOptional() @IsDateString() businessDate?: string;
  @IsEnum(OperationsLogCategory) category!: OperationsLogCategory;
  @IsOptional() @IsEnum(OperationsLogPriority) priority?: OperationsLogPriority;
  @IsString() @MinLength(2) title!: string;
  @IsString() @MinLength(2) details!: string;
  @IsOptional() @IsEnum(StaffDepartment) assignedDepartment?: StaffDepartment;
  @IsOptional() @IsString() assignedUserId?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @IsOptional() @IsString() reservationId?: string;
  @IsOptional() @IsString() guestProfileId?: string;
  @IsOptional() @IsString() roomId?: string;
  @IsOptional() @IsString() maintenanceTicketId?: string;
  @IsOptional() @IsString() housekeepingTaskId?: string;
}

export class OperationsLogUpdateDto {
  @IsOptional() @IsEnum(OperationsLogCategory) category?: OperationsLogCategory;
  @IsOptional() @IsEnum(OperationsLogPriority) priority?: OperationsLogPriority;
  @IsOptional() @IsString() @MinLength(2) title?: string;
  @IsOptional() @IsString() @MinLength(2) details?: string;
  @IsOptional() @IsEnum(StaffDepartment) assignedDepartment?: StaffDepartment | null;
  @IsOptional() @IsString() assignedUserId?: string | null;
  @IsOptional() @IsDateString() dueAt?: string | null;
}

export class OperationsLogResolveDto {
  @IsString() @MinLength(2) resolutionNote!: string;
}

export class OperationsLogUpdateNoteDto {
  @IsString() @MinLength(1) note!: string;
}

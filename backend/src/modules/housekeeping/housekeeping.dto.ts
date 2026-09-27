import { HousekeepingTaskStatus, RoomOperationalStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class HousekeepingBoardQueryDto {
  @IsOptional() @IsEnum(RoomOperationalStatus) status?: RoomOperationalStatus;
  @IsOptional() @IsString() @MaxLength(40) floor?: string;
  @IsOptional() @IsString() @MaxLength(80) roomTypeId?: string;
  @IsOptional() @IsString() @MaxLength(80) assignedToId?: string;
  @IsOptional() @IsString() @MaxLength(80) hotelId?: string;
}

export class HousekeepingIssueDto {
  @IsString() @MinLength(2) @MaxLength(500) note!: string;
}

export class HousekeepingAssignDto {
  @IsString() @MinLength(1) @MaxLength(80) staffUserId!: string;
}

export class HousekeepingRoomStatusDto {
  @IsEnum(RoomOperationalStatus) status!: RoomOperationalStatus;
}

export class HousekeepingCancelDto {
  @IsOptional() @IsString() @MaxLength(500) note?: string;
}

export type HousekeepingTaskView = {
  id: string;
  status: HousekeepingTaskStatus;
  assignedTo: { id: string; name: string } | null;
  createdAt: Date;
  acceptedAt: Date | null;
  cleaningStartedAt: Date | null;
  completedAt: Date | null;
  issueNote: string | null;
  issueReportedAt: Date | null;
};

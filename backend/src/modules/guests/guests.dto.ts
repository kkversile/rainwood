import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';
import { GuestNoteCategory, GuestNoteVisibility } from '@prisma/client';

export class GuestListQueryDto {
  @IsOptional() @IsString() @MaxLength(120) search?: string;
  @IsOptional() @IsString() hotelId?: string;
  @IsOptional() @IsBoolean() repeat?: boolean;
}

export class UpdateGuestProfileDto {
  @IsOptional() @IsString() @MaxLength(160) displayName?: string;
  @IsOptional() @IsString() @MaxLength(40) mobile?: string;
  @IsOptional() @IsString() @MaxLength(160) email?: string;
  @IsOptional() @IsString() @MaxLength(80) gstin?: string;
  @IsOptional() @IsString() @MaxLength(80) preferredLanguage?: string;
  @IsOptional() @IsString() preferredRoomTypeId?: string;
  @IsOptional() @IsObject() preferences?: Record<string, unknown>;
  @IsOptional() @IsString() @MaxLength(40) vipLevel?: string;
  @IsOptional() @IsBoolean() blacklisted?: boolean;
}

export class CreateGuestNoteDto {
  @IsEnum(GuestNoteCategory) category!: GuestNoteCategory;
  @IsEnum(GuestNoteVisibility) visibility!: GuestNoteVisibility;
  @IsString() @MaxLength(2000) note!: string;
  @IsOptional() @IsString() hotelId?: string;
}

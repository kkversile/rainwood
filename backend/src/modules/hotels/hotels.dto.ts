import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class HotelContentDto {
  @IsString()
  @MinLength(2)
  code!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsString()
  @MinLength(2)
  slug!: string;

  @IsString()
  city!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  seoTitle?: string;

  @IsOptional()
  @IsString()
  seoDescription?: string;

  @IsOptional()
  @IsString()
  canonicalPath?: string;

  @IsOptional()
  @IsString()
  ogImageUrl?: string;

  @IsOptional()
  @IsString()
  axisPropertyId?: string;
}

export class HotelUpdateDto {
  @IsOptional() @IsString() @MinLength(2) code?: string;
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsString() @MinLength(2) slug?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() @MaxLength(10_000) description?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() seoTitle?: string;
  @IsOptional() @IsString() seoDescription?: string;
  @IsOptional() @IsString() canonicalPath?: string;
  @IsOptional() @IsString() ogImageUrl?: string;
  @IsOptional() @IsString() axisPropertyId?: string;
}

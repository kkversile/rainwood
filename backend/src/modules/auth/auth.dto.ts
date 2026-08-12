import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class AgentRegisterDto {
  @IsEmail()
  email!: string;

  @IsString() @MinLength(2) companyName!: string;
  @IsString() @MinLength(2) contactPerson!: string;
  @IsString() @Matches(/^[+()\-\s\d]{7,20}$/) mobile!: string;
  @IsOptional() @IsString() gstin?: string;
  @IsOptional() @IsString() place?: string;
  @IsString() @MinLength(3) addressLine1!: string;
  @IsOptional() @IsString() addressLine2?: string;
  @IsOptional() @IsString() state?: string;
  @IsOptional() @Matches(/^\d{4,10}$/) pinCode?: string;
  @IsOptional() @IsString() additionalInformation?: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

export class RefreshDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}

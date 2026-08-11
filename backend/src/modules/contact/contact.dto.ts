import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateContactRequestDto {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsEmail() @MaxLength(255) email!: string;
  @IsString() @MinLength(10) @MaxLength(5000) message!: string;
}

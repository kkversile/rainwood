import { IsDateString, IsOptional } from 'class-validator';

export class AgentRateRangeQueryDto {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

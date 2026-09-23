import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PaymentMilestoneDueType } from '@prisma/client';

export class PaymentMilestoneDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) percentage!: number;
  @IsEnum(PaymentMilestoneDueType) dueType!: PaymentMilestoneDueType;
  @IsOptional() @IsInt() @Min(0) daysBeforeCheckIn?: number | null;
}

export class AgentPaymentMilestonesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentMilestoneDto)
  milestones!: PaymentMilestoneDto[];
}

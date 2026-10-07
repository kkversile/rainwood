import { BadRequestException } from '@nestjs/common';

export function validateCategoryBandInput(values: Array<number | undefined | null>, existing: boolean) {
  if (!existing && values.some((value) => value === undefined || value === null || Number(value) <= 0)) throw new BadRequestException('All five Agent category rates A-E are required and must be greater than zero when creating a category period.');
  if (values.some((value) => value !== undefined && (!Number.isFinite(Number(value)) || Number(value) <= 0))) throw new BadRequestException('Agent category rates A-E must be greater than zero.');
}

export function validateNewB2cBaseRate(value: number | undefined, existing: boolean) {
  if (!existing && (!Number.isFinite(Number(value)) || Number(value) <= 0)) throw new BadRequestException('Double occupancy rate is required and must be greater than zero when creating a new B2C rate period.');
}

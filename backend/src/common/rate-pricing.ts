import { BadRequestException } from '@nestjs/common';

export const SUPPORTED_OCCUPANCY_KEYS = ['single', 'double', 'triple', 'quad'] as const;

export function normalizeOccupancyPrices(value: unknown): Record<string, number> | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('occupancyPrices must be an object or null.');
  const supported = new Set<string>(SUPPORTED_OCCUPANCY_KEYS);
  const result: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!supported.has(key)) throw new BadRequestException(`Unsupported occupancy price key: ${key}.`);
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount < 0) throw new BadRequestException(`occupancyPrices.${key} must be a non-negative number.`);
    result[key] = amount;
  }
  return result;
}

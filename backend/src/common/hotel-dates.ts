import { BadRequestException } from '@nestjs/common';
import { parseDateOnly } from './dates';

function timezoneOffsetMs(timezoneName: string, instant: Date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezoneName, timeZoneName: 'longOffset' }).formatToParts(instant);
  const value = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  if (value === 'GMT' || value === 'UTC') return 0;
  const match = /^GMT([+-])(\d{2})(?::?(\d{2}))?$/.exec(value);
  if (!match) throw new BadRequestException('Hotel timezone offset could not be resolved.');
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return (match[1] === '+' ? 1 : -1) * minutes * 60_000;
}

function localMidnightToUtc(dateText: string, timezoneName: string) {
  const localAsUtc = Date.parse(`${dateText}T00:00:00.000Z`);
  if (!Number.isFinite(localAsUtc)) throw new BadRequestException('Business date is invalid.');
  let candidate = localAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) candidate = localAsUtc - timezoneOffsetMs(timezoneName, new Date(candidate));
  return new Date(candidate);
}

/** Returns the hotel's calendar date for an instant, independent of server/UTC timezone. */
export function getHotelOperationalDate(timezoneName: string, now: Date = new Date()): Date {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new BadRequestException('Current time is invalid.');
  if (!timezoneName?.trim()) throw new BadRequestException('Hotel timezone is required.');
  try {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezoneName, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
    return parseDateOnly(`${values.year}-${values.month}-${values.day}`, 'hotel operational date');
  } catch {
    throw new BadRequestException('Hotel timezone is invalid.');
  }
}

/** Converts one hotel-local calendar day to its UTC timestamp interval, including DST transitions. */
export function getHotelBusinessDayUtcRange(businessDate: Date, timezoneName: string): { startUtc: Date; endUtc: Date } {
  if (!(businessDate instanceof Date) || Number.isNaN(businessDate.getTime())) throw new BadRequestException('Business date is invalid.');
  if (!timezoneName?.trim()) throw new BadRequestException('Hotel timezone is required.');
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezoneName }).format(businessDate);
    const dateText = businessDate.toISOString().slice(0, 10);
    const nextDate = new Date(Date.UTC(businessDate.getUTCFullYear(), businessDate.getUTCMonth(), businessDate.getUTCDate() + 1)).toISOString().slice(0, 10);
    return { startUtc: localMidnightToUtc(dateText, timezoneName), endUtc: localMidnightToUtc(nextDate, timezoneName) };
  } catch (error) {
    if (error instanceof BadRequestException) throw error;
    throw new BadRequestException('Hotel timezone is invalid.');
  }
}

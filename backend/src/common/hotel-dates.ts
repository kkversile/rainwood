import { BadRequestException } from '@nestjs/common';
import { parseDateOnly } from './dates';

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

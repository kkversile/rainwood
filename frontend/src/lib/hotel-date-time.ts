export const DEFAULT_HOTEL_TIMEZONE = 'Asia/Kolkata';

function dateParts(value: Date, timeZone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value).reduce<Record<string, string>>((result, part) => {
    if (part.type !== 'literal') result[part.type] = part.value;
    return result;
  }, {});
}

/** Returns a hotel-local calendar date without converting through UTC. */
export function hotelLocalDate(value = new Date(), timeZone = DEFAULT_HOTEL_TIMEZONE) {
  const parts = dateParts(value, timeZone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

/** Adds calendar days to a date-only value; the UTC container is intentional. */
export function addHotelDays(value: string, days: number) {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return hotelLocalDate(new Date());
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function todayInHotelTimezone(timeZone = DEFAULT_HOTEL_TIMEZONE, now = new Date()) {
  return hotelLocalDate(now, timeZone);
}

export function tomorrowInHotelTimezone(timeZone = DEFAULT_HOTEL_TIMEZONE, now = new Date()) {
  return addHotelDays(todayInHotelTimezone(timeZone, now), 1);
}

/** Parses a date-only hotel value as a UTC container, never as the browser's local time. */
export function parseHotelDate(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatHotelDate(value: string | null | undefined, locale = 'en-IN') {
  if (!value) return '—';
  const date = parseHotelDate(value);
  return date ? date.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '—';
}

export function formatHotelDateTime(value?: string | null, timezoneName?: string | null) {
  if (!value) return '—';
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: timezoneName || DEFAULT_HOTEL_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).formatToParts(new Date(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('day')} ${part('month')} ${part('year')}, ${part('hour')}:${part('minute')} ${part('dayPeriod').toUpperCase()}`;
}

import { addHotelDays, todayInHotelTimezone } from './hotel-date-time';

export const ROOM_RACK_DAY_OPTIONS = [7, 14, 30] as const;

export type RoomRackFacets = { roomTypes: { id: string; name: string }[]; floors: string[]; wings: string[]; roomStatuses: string[] };

export function roomRackToday(timeZone?: string, now = new Date()) {
  return todayInHotelTimezone(timeZone, now);
}

export function roomRackFacetOptions(facets?: Partial<RoomRackFacets>) {
  return {
    roomTypes: facets?.roomTypes ?? [],
    floors: facets?.floors ?? [],
    wings: facets?.wings ?? [],
    roomStatuses: facets?.roomStatuses ?? [],
  };
}

export function roomRackDayCount(value: string | number | null | undefined) {
  const days = Number(value);
  return ROOM_RACK_DAY_OPTIONS.includes(days as (typeof ROOM_RACK_DAY_OPTIONS)[number]) ? days : 14;
}

export function roomRackDates(from: string, days: number) {
  const count = Math.min(31, Math.max(1, Number(days) || 14));
  return Array.from({ length: count }, (_, index) => addHotelDays(from, index));
}

export function roomRackBlockSpan(checkIn: string, checkOut: string, dates: string[]) {
  if (!dates.length) return null;
  const startIndex = dates.findIndex((date) => date >= checkIn);
  const endIndex = dates.findIndex((date) => date >= checkOut);
  const start = startIndex < 0 ? dates.length : startIndex;
  const end = endIndex < 0 ? dates.length : endIndex;
  const span = Math.min(dates.length - start, end - start);
  return span > 0 ? { start, span } : null;
}

export function roomRackMatches(value: string, search: string) {
  return !search.trim() || value.toLowerCase().includes(search.trim().toLowerCase());
}

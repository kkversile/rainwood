import { addHotelDays, todayInHotelTimezone } from './hotel-date-time';

export type BookingSearchState = {
  hotel?: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  childrenWithBed?: number;
  childrenWithoutBed?: number;
  rooms: number;
};

export function dateInDays(days: number, now = new Date()) {
  return addHotelDays(todayInHotelTimezone(undefined, now), days);
}

export function nextDate(value: string) {
  return addHotelDays(value, 1);
}

function integerParam(value: string | null, minimum: number, maximum: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}

export function parseBookingSearch(input: URLSearchParams | string, now = new Date()): BookingSearchState {
  const params = typeof input === 'string' ? new URLSearchParams(input.startsWith('?') ? input.slice(1) : input) : input;
  const today = dateInDays(0, now);
  const requestedCheckIn = params.get('checkIn');
  const checkIn = requestedCheckIn && requestedCheckIn >= today ? requestedCheckIn : dateInDays(1, now);
  const requestedCheckOut = params.get('checkOut');
  const checkOut = requestedCheckOut && requestedCheckOut > checkIn ? requestedCheckOut : nextDate(checkIn);
  const result: BookingSearchState = {
    checkIn,
    checkOut,
    adults: integerParam(params.get('adults'), 1, 100, 2),
    children: integerParam(params.get('children'), 0, 100, 0),
    rooms: integerParam(params.get('rooms'), 1, 20, 1),
  };
  const childrenWithBed = params.get('childrenWithBed');
  const childrenWithoutBed = params.get('childrenWithoutBed');
  if (childrenWithBed !== null || childrenWithoutBed !== null) {
    result.childrenWithBed = integerParam(childrenWithBed, 0, 100, 0);
    result.childrenWithoutBed = integerParam(childrenWithoutBed, 0, 100, 0);
    result.children = result.childrenWithBed + result.childrenWithoutBed;
  }
  const hotel = params.get('hotel')?.trim();
  if (hotel && /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(hotel)) result.hotel = hotel;
  return result;
}

export function serializeBookingSearch(state: BookingSearchState) {
  const params = new URLSearchParams({ checkIn: state.checkIn, checkOut: state.checkOut, adults: String(state.adults), children: String(state.children), rooms: String(state.rooms) });
  if (state.childrenWithBed !== undefined || state.childrenWithoutBed !== undefined) {
    params.set('childrenWithBed', String(state.childrenWithBed ?? 0));
    params.set('childrenWithoutBed', String(state.childrenWithoutBed ?? 0));
  }
  if (state.hotel) params.set('hotel', state.hotel);
  return params;
}

export function validateSearchInput(input: {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  childrenWithBed?: number;
  childrenWithoutBed?: number;
  rooms: number;
}) {
  const today = dateInDays(0);
  if (!input.checkIn || !input.checkOut) return 'Check-in and check-out are required.';
  if (input.checkIn < today) return 'Check-in cannot be in the past.';
  if (input.checkOut < today) return 'Check-out cannot be in the past.';
  if (input.checkIn >= input.checkOut) return 'Check-out must be after check-in.';
  if (!Number.isInteger(input.adults) || input.adults < 1) return 'At least one adult is required.';
  if (!Number.isInteger(input.children) || input.children < 0) return 'Children cannot be negative.';
  if (input.childrenWithBed !== undefined || input.childrenWithoutBed !== undefined) {
    const withBed = input.childrenWithBed ?? 0;
    const withoutBed = input.childrenWithoutBed ?? 0;
    if (!Number.isInteger(withBed) || withBed < 0 || !Number.isInteger(withoutBed) || withoutBed < 0) return 'Child occupancy cannot be negative.';
    if (withBed + withoutBed !== input.children) return 'Child occupancy totals must match the number of children.';
  }
  if (!Number.isInteger(input.rooms) || input.rooms < 1) return 'At least one room is required.';
  return null;
}

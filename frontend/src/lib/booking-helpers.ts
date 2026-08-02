export function dateInDays(days: number, now = new Date()) {
  const date = new Date(now);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validateSearchInput(input: {
  checkIn: string;
  checkOut: string;
  adults: number;
  children: number;
  rooms: number;
}) {
  if (!input.checkIn || !input.checkOut || input.checkIn >= input.checkOut) return 'Check-out must be after check-in.';
  if (!Number.isInteger(input.adults) || input.adults < 1) return 'At least one adult is required.';
  if (!Number.isInteger(input.children) || input.children < 0) return 'Children cannot be negative.';
  if (!Number.isInteger(input.rooms) || input.rooms < 1) return 'At least one room is required.';
  return null;
}

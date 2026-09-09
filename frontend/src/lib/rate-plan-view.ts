export function formatStartingRate(value?: number | string | null) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
  return `From ₹${Number(value).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

export function formatConfiguredDays(count: number) {
  return `${count} ${count === 1 ? 'day' : 'days'} configured`;
}

export type RatePlanViewAssignment = {
  id: string;
  roomTypeId: string;
  active: boolean;
  axisRatePlanId?: string | null;
  startingRate?: number | string | null;
  confirmedBookingCount: number;
  activeHoldCount: number;
  _count: { rates: number };
  roomType: { id: string; name: string; code: string };
};

export type RatePlanViewMaster = {
  id: string;
  hotelId: string;
  code: string;
  name: string;
  mealPlan: string;
  description?: string | null;
  active: boolean;
  hotel?: { id: string; name: string; city: string };
  assignments: RatePlanViewAssignment[];
};

export type RatePlanTableRow = {
  id: string;
  masterId: string;
  master: RatePlanViewMaster;
  assignment?: RatePlanViewAssignment;
  effectiveActive: boolean;
  unassigned: boolean;
  startingRate: number | string | null;
  confirmedBookingCount: number;
};

export function flattenRatePlanRows(masters: RatePlanViewMaster[], hotelId: string): RatePlanTableRow[] {
  return masters.flatMap((master): RatePlanTableRow[] => {
    const assignments = master.assignments.filter((assignment) => assignment.roomType && master.hotelId === hotelId);
    if (!assignments.length) return [{ id: `master:${master.id}`, masterId: master.id, master, assignment: undefined, effectiveActive: master.active, unassigned: true, startingRate: null, confirmedBookingCount: 0 }];
    return assignments.map((assignment) => ({ id: assignment.id, masterId: master.id, master, assignment, effectiveActive: master.active && assignment.active, unassigned: false, startingRate: assignment.startingRate ?? null, confirmedBookingCount: assignment.confirmedBookingCount }));
  });
}

export function ratePlanRowSearchText(row: RatePlanTableRow) {
  const room = row.assignment?.roomType;
  const hotel = row.master.hotel;
  return [row.master.name, row.master.code, row.master.mealPlan, row.master.description, room?.name, room?.code, hotel?.name, hotel?.city].filter(Boolean).join(' ').toLowerCase();
}

export function filterRatePlanRows(rows: RatePlanTableRow[], options: { roomTypeId?: string; search?: string; status?: 'ALL' | 'ACTIVE' | 'INACTIVE' }) {
  const query = options.search?.trim().toLowerCase() ?? '';
  return rows.filter((row) => {
    if (options.roomTypeId && row.assignment?.roomTypeId !== options.roomTypeId) return false;
    if (options.status === 'ACTIVE' && !row.effectiveActive) return false;
    if (options.status === 'INACTIVE' && row.effectiveActive) return false;
    return !query || ratePlanRowSearchText(row).includes(query);
  });
}

export type RatePlanSortKey = 'plan' | 'room' | 'meal' | 'status' | 'rate' | 'bookings';

export function sortRatePlanRows(rows: RatePlanTableRow[], key: RatePlanSortKey, direction: 'asc' | 'desc') {
  const multiplier = direction === 'asc' ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftRoom = left.assignment?.roomType;
    const rightRoom = right.assignment?.roomType;
    let comparison = 0;
    if (key === 'plan') comparison = left.master.name.localeCompare(right.master.name) || left.master.code.localeCompare(right.master.code);
    if (key === 'room') comparison = (leftRoom?.name ?? 'Not assigned').localeCompare(rightRoom?.name ?? 'Not assigned') || (left.master.hotel?.name ?? '').localeCompare(right.master.hotel?.name ?? '');
    if (key === 'meal') comparison = left.master.mealPlan.localeCompare(right.master.mealPlan);
    if (key === 'status') comparison = Number(left.effectiveActive) - Number(right.effectiveActive);
    if (key === 'rate') comparison = left.startingRate === null ? (right.startingRate === null ? 0 : 1) : right.startingRate === null ? -1 : Number(left.startingRate) - Number(right.startingRate);
    if (key === 'bookings') comparison = left.confirmedBookingCount - right.confirmedBookingCount;
    return (comparison || left.id.localeCompare(right.id)) * multiplier;
  });
}

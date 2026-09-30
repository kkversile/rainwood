import { ReservationStatus } from '@prisma/client';

export const REVENUE_FORECAST_HORIZON_DAYS = 90;
export const REVENUE_FORECAST_PICKUP_WINDOWS = [1, 3, 7, 14, 30] as const;
export const REVENUE_FORECAST_HISTORY_LOOKBACK_DAYS = 365;
export const BOOKING_CURVE_LEAD_BUCKETS = [90, 60, 45, 30, 21, 14, 7, 3, 1, 0] as const;
export const COMPLETION_MINIMUM_SAMPLE_SIZE = 5;
export const COMPLETION_LEAD_TOLERANCE_DAYS = 3;

// V1 committed OTB is intentionally explicit. Held inventory is represented by InventoryDay.held.
export const COMMITTED_OTB_STATUSES = [ReservationStatus.CONFIRMED, ReservationStatus.MODIFIED] as const;

export function isCommittedOtbStatus(status: ReservationStatus | string) {
  return (COMMITTED_OTB_STATUSES as readonly (ReservationStatus | string)[]).includes(status);
}

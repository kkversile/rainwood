import { ReservationStatus } from '@prisma/client';

export const REVENUE_FORECAST_HORIZON_DAYS = 90;
export const REVENUE_FORECAST_PICKUP_WINDOWS = [1, 3, 7, 14, 30] as const;

// V1 committed OTB is intentionally explicit. Held inventory is represented by InventoryDay.held.
export const COMMITTED_OTB_STATUSES = [ReservationStatus.CONFIRMED, ReservationStatus.MODIFIED] as const;

export function isCommittedOtbStatus(status: ReservationStatus | string) {
  return (COMMITTED_OTB_STATUSES as readonly (ReservationStatus | string)[]).includes(status);
}

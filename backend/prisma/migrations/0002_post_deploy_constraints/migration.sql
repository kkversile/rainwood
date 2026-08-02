CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE INDEX IF NOT EXISTS inventory_day_sellable_idx ON "InventoryDay" ("roomTypeId", date) WHERE "stopSell" = false;
CREATE INDEX IF NOT EXISTS active_holds_expiry_idx ON "InventoryHold" ("expiresAt") WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON "OutboxJob" ("availableAt", "createdAt") WHERE status IN ('PENDING', 'FAILED');

ALTER TABLE "InventoryDay" ADD CONSTRAINT inventory_nonnegative CHECK (available >= 0 AND held >= 0 AND sold >= 0 AND held + sold <= available);
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_dates_valid CHECK ("checkOut" > "checkIn");
ALTER TABLE "Reservation" ADD CONSTRAINT reservation_amounts_valid CHECK ("totalAmount" >= 0 AND "advanceAmount" >= 0 AND "balanceAmount" >= 0 AND "advanceAmount" <= "totalAmount");
ALTER TABLE "InventoryHoldLine" ADD CONSTRAINT hold_dates_valid CHECK ("checkOut" > "checkIn" AND rooms > 0 AND adults > 0 AND children >= 0);
ALTER TABLE "ReservationLine" ADD CONSTRAINT reservation_line_dates_valid CHECK ("checkOut" > "checkIn" AND rooms > 0 AND adults > 0 AND children >= 0);

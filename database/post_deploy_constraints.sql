-- Run after the Prisma schema has been applied.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE INDEX IF NOT EXISTS inventory_day_sellable_idx ON "InventoryDay" ("roomTypeId", date) WHERE "stopSell" = false;
CREATE INDEX IF NOT EXISTS active_holds_expiry_idx ON "InventoryHold" ("expiresAt") WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS outbox_pending_idx ON "OutboxJob" ("availableAt", "createdAt") WHERE status IN ('PENDING','FAILED');
DO $$ BEGIN
  ALTER TABLE "InventoryDay" ADD CONSTRAINT inventory_nonnegative CHECK (available >= 0 AND held >= 0 AND sold >= 0 AND held + sold <= available);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Reservation" ADD CONSTRAINT reservation_dates_valid CHECK ("checkOut" > "checkIn");
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "Reservation" ADD CONSTRAINT reservation_amounts_valid CHECK ("totalAmount" >= 0 AND "advanceAmount" >= 0 AND "balanceAmount" >= 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

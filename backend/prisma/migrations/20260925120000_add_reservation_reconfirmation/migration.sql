ALTER TABLE "Reservation"
  ADD COLUMN "reconfirmedAt" TIMESTAMP(3),
  ADD COLUMN "reconfirmedById" TEXT;

ALTER TABLE "Reservation"
  ADD CONSTRAINT "Reservation_reconfirmedById_fkey"
  FOREIGN KEY ("reconfirmedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Reservation_reconfirmedAt_idx" ON "Reservation"("reconfirmedAt");

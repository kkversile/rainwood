ALTER TABLE "ReservationSettlement" ADD COLUMN "overrideAuthorizedById" TEXT;

CREATE INDEX "ReservationSettlement_overrideAuthorizedById_idx" ON "ReservationSettlement"("overrideAuthorizedById");

ALTER TABLE "ReservationSettlement" ADD CONSTRAINT "ReservationSettlement_overrideAuthorizedById_fkey" FOREIGN KEY ("overrideAuthorizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

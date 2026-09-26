CREATE TYPE "FolioChargeCategory" AS ENUM ('FOOD_AND_BEVERAGE', 'MINIBAR', 'LAUNDRY', 'EXTRA_BED', 'TRANSPORT', 'ACTIVITY', 'SPA', 'ROOM_SERVICE', 'EARLY_CHECKIN', 'LATE_CHECKOUT', 'ROOM_UPGRADE', 'DAMAGE', 'OTHER');

CREATE TYPE "FolioChargeStatus" AS ENUM ('POSTED', 'VOIDED');

CREATE TABLE "ReservationFolioCharge" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "category" "FolioChargeCategory" NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
    "unitAmount" DECIMAL(12,2) NOT NULL,
    "taxableAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "postingDate" DATE NOT NULL,
    "note" TEXT,
    "status" "FolioChargeStatus" NOT NULL DEFAULT 'POSTED',
    "postedById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationFolioCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReservationFolioCharge_reservationId_postingDate_idx" ON "ReservationFolioCharge"("reservationId", "postingDate");
CREATE INDEX "ReservationFolioCharge_reservationId_status_idx" ON "ReservationFolioCharge"("reservationId", "status");

ALTER TABLE "ReservationFolioCharge" ADD CONSTRAINT "ReservationFolioCharge_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservationFolioCharge" ADD CONSTRAINT "ReservationFolioCharge_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationFolioCharge" ADD CONSTRAINT "ReservationFolioCharge_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

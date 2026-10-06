CREATE TYPE "RatePlanMasterKind" AS ENUM ('CANONICAL_MEAL', 'SPECIAL_PRODUCT', 'LEGACY');

ALTER TABLE "RatePlanMaster" ADD COLUMN "kind" "RatePlanMasterKind" NOT NULL DEFAULT 'LEGACY';

UPDATE "RatePlanMaster"
SET "kind" = 'CANONICAL_MEAL'
WHERE upper("code") IN ('EP', 'CP', 'MAP', 'AP')
  AND upper("code") = upper("mealPlan")
  AND "active" = true;

CREATE UNIQUE INDEX "RatePlanMaster_active_canonical_meal_key"
ON "RatePlanMaster" ("hotelId", "mealPlan")
WHERE "active" = true AND "kind" = 'CANONICAL_MEAL';

ALTER TABLE "InventoryHoldLine" ADD COLUMN "childrenWithBed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "InventoryHoldLine" ADD COLUMN "childrenWithoutBed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReservationLine" ADD COLUMN "childrenWithBed" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ReservationLine" ADD COLUMN "childrenWithoutBed" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "HotelBankAccount" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "accountName" TEXT NOT NULL,
  "bankName" TEXT NOT NULL,
  "branch" TEXT,
  "accountNumber" TEXT NOT NULL,
  "ifsc" TEXT,
  "accountType" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "displayOnAgentRateSheet" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotelBankAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HotelBankAccount_hotelId_active_displayOnAgentRateSheet_idx"
ON "HotelBankAccount" ("hotelId", "active", "displayOnAgentRateSheet");

ALTER TABLE "HotelBankAccount"
ADD CONSTRAINT "HotelBankAccount_hotelId_fkey"
FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

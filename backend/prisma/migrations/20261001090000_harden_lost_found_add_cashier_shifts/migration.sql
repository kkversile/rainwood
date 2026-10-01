-- Phase A: hotel-local Lost & Found provenance and Phase B: front-office cashier shifts.
CREATE TYPE "CashierShiftStatus" AS ENUM ('OPEN', 'CLOSED');

ALTER TYPE "DocumentSequenceType" ADD VALUE 'CASHIER_SHIFT';
ALTER TYPE "PaymentMode" ADD VALUE 'CARD';

ALTER TABLE "LostFoundItem"
  ADD COLUMN "disposedAt" TIMESTAMP(3),
  ADD COLUMN "disposedById" TEXT;

ALTER TABLE "Payment"
  ADD COLUMN "cashierShiftId" TEXT;

CREATE TABLE "CashierShift" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "shiftNo" TEXT NOT NULL,
  "openedById" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "openingCash" DECIMAL(14,2) NOT NULL,
  "status" "CashierShiftStatus" NOT NULL DEFAULT 'OPEN',
  "closedById" TEXT,
  "closedAt" TIMESTAMP(3),
  "expectedCash" DECIMAL(14,2),
  "actualCash" DECIMAL(14,2),
  "cashVariance" DECIMAL(14,2),
  "closingNote" TEXT,
  "paymentTotalsSnapshot" JSONB,
  "businessDate" DATE NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashierShift_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CashierShift_hotelId_shiftNo_key" ON "CashierShift"("hotelId", "shiftNo");
CREATE UNIQUE INDEX "CashierShift_one_open_per_hotel_key" ON "CashierShift"("hotelId") WHERE "status" = 'OPEN';
CREATE INDEX "CashierShift_hotelId_businessDate_status_idx" ON "CashierShift"("hotelId", "businessDate", "status");
CREATE INDEX "CashierShift_openedById_hotelId_status_idx" ON "CashierShift"("openedById", "hotelId", "status");
CREATE INDEX "Payment_cashierShiftId_mode_createdAt_idx" ON "Payment"("cashierShiftId", "mode", "createdAt");

ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_disposedById_fkey" FOREIGN KEY ("disposedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CashierShift" ADD CONSTRAINT "CashierShift_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_cashierShiftId_fkey" FOREIGN KEY ("cashierShiftId") REFERENCES "CashierShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;

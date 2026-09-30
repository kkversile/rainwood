-- Correctness hardening for corporate pricing, inquiry workflows, and hotel-local numbering.
CREATE TYPE "DocumentSequenceType" AS ENUM ('EXPENSE', 'INQUIRY');

DROP INDEX IF EXISTS "Expense_expenseNo_key";
DROP INDEX IF EXISTS "BookingInquiry_inquiryNo_key";

CREATE TABLE "DocumentSequence" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "type" "DocumentSequenceType" NOT NULL,
  "year" INTEGER NOT NULL,
  "lastNumber" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DocumentSequence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DocumentSequence_hotelId_type_year_key" ON "DocumentSequence"("hotelId", "type", "year");
CREATE INDEX "DocumentSequence_hotelId_type_year_idx" ON "DocumentSequence"("hotelId", "type", "year");
CREATE UNIQUE INDEX "Expense_hotelId_expenseNo_key" ON "Expense"("hotelId", "expenseNo");
CREATE UNIQUE INDEX "BookingInquiry_hotelId_inquiryNo_key" ON "BookingInquiry"("hotelId", "inquiryNo");

ALTER TABLE "DocumentSequence" ADD CONSTRAINT "DocumentSequence_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InventoryHold" ADD COLUMN "corporateAccountId" TEXT;
CREATE INDEX "InventoryHold_corporateAccountId_createdAt_idx" ON "InventoryHold"("corporateAccountId", "createdAt");
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "CorporateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

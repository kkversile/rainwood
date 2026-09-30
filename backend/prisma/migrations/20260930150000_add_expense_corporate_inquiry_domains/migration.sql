-- Expense management, corporate accounts, and booking inquiry CRM.
-- Existing reservation, settlement, and rate engines remain authoritative.

CREATE TYPE "ExpenseStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'PAID', 'CANCELLED');
CREATE TYPE "CorporatePricingType" AS ENUM ('FIXED', 'DISCOUNT_PERCENT');
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'CONTACTED', 'QUOTE_SENT', 'FOLLOW_UP', 'CONVERTED', 'LOST');
CREATE TYPE "InquiryFollowUpMethod" AS ENUM ('CALL', 'WHATSAPP', 'EMAIL', 'IN_PERSON', 'OTHER');

ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'CHEQUE';
ALTER TYPE "PaymentMode" ADD VALUE IF NOT EXISTS 'OTHER';

ALTER TABLE "Reservation" ADD COLUMN "corporateAccountId" TEXT;
ALTER TABLE "Reservation" ADD COLUMN "corporateSnapshot" JSONB;

CREATE TABLE "ExpenseCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT,
  "description" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "hotelId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ExpenseCategory_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Vendor" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "gstin" TEXT,
  "pan" TEXT,
  "email" TEXT,
  "mobile" TEXT,
  "address" TEXT,
  "paymentTermsDays" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Expense" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "expenseNo" TEXT NOT NULL,
  "expenseDate" DATE NOT NULL,
  "categoryId" TEXT NOT NULL,
  "vendorId" TEXT,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "taxableAmount" DECIMAL(14,2),
  "taxAmount" DECIMAL(14,2),
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "paymentMode" "PaymentMode" NOT NULL,
  "paymentReference" TEXT,
  "status" "ExpenseStatus" NOT NULL DEFAULT 'DRAFT',
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "approvedById" TEXT,
  "approvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CorporateAccount" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legalName" TEXT,
  "gstin" TEXT,
  "pan" TEXT,
  "billingAddress" TEXT,
  "city" TEXT,
  "state" TEXT,
  "country" TEXT,
  "postalCode" TEXT,
  "contactPerson" TEXT,
  "email" TEXT,
  "mobile" TEXT,
  "creditLimit" DECIMAL(14,2),
  "creditDays" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorporateAccount_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CorporateAccountHotel" (
  "corporateAccountId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "accountCode" TEXT,
  "creditLimitOverride" DECIMAL(14,2),
  "creditDaysOverride" INTEGER,
  CONSTRAINT "CorporateAccountHotel_pkey" PRIMARY KEY ("corporateAccountId", "hotelId")
);
CREATE TABLE "CorporateRateAgreement" (
  "id" TEXT NOT NULL,
  "corporateAccountId" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomTypeId" TEXT NOT NULL,
  "ratePlanId" TEXT NOT NULL,
  "validFrom" DATE NOT NULL,
  "validTo" DATE NOT NULL,
  "pricingType" "CorporatePricingType" NOT NULL,
  "fixedRate" DECIMAL(12,2),
  "discountPercent" DECIMAL(5,2),
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CorporateRateAgreement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "BookingInquiry" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "inquiryNo" TEXT NOT NULL,
  "guestName" TEXT NOT NULL,
  "mobile" TEXT NOT NULL,
  "email" TEXT,
  "source" "BookingSource" NOT NULL,
  "checkIn" DATE,
  "checkOut" DATE,
  "adults" INTEGER,
  "children" INTEGER,
  "roomTypeId" TEXT,
  "quotedAmount" DECIMAL(14,2),
  "quotedAt" TIMESTAMP(3),
  "quoteSnapshot" JSONB,
  "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
  "assignedToId" TEXT,
  "nextFollowUpAt" TIMESTAMP(3),
  "lastFollowUpAt" TIMESTAMP(3),
  "notes" TEXT,
  "convertedReservationId" TEXT,
  "lostReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BookingInquiry_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InquiryFollowUp" (
  "id" TEXT NOT NULL,
  "inquiryId" TEXT NOT NULL,
  "method" "InquiryFollowUpMethod" NOT NULL,
  "note" TEXT NOT NULL,
  "nextFollowUpAt" TIMESTAMP(3),
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InquiryFollowUp_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExpenseCategory_hotelId_name_key" ON "ExpenseCategory"("hotelId", "name");
CREATE INDEX "ExpenseCategory_hotelId_active_idx" ON "ExpenseCategory"("hotelId", "active");
CREATE UNIQUE INDEX "Vendor_hotelId_name_key" ON "Vendor"("hotelId", "name");
CREATE INDEX "Vendor_hotelId_active_idx" ON "Vendor"("hotelId", "active");
CREATE UNIQUE INDEX "Expense_expenseNo_key" ON "Expense"("expenseNo");
CREATE INDEX "Expense_hotelId_expenseDate_status_idx" ON "Expense"("hotelId", "expenseDate", "status");
CREATE INDEX "Expense_categoryId_expenseDate_idx" ON "Expense"("categoryId", "expenseDate");
CREATE INDEX "Expense_vendorId_expenseDate_idx" ON "Expense"("vendorId", "expenseDate");
CREATE INDEX "CorporateAccount_active_name_idx" ON "CorporateAccount"("active", "name");
CREATE INDEX "CorporateAccountHotel_hotelId_active_idx" ON "CorporateAccountHotel"("hotelId", "active");
CREATE INDEX "CorporateRateAgreement_corporateAccountId_hotelId_active_va_idx" ON "CorporateRateAgreement"("corporateAccountId", "hotelId", "active", "validFrom", "validTo");
CREATE UNIQUE INDEX "BookingInquiry_inquiryNo_key" ON "BookingInquiry"("inquiryNo");
CREATE UNIQUE INDEX "BookingInquiry_convertedReservationId_key" ON "BookingInquiry"("convertedReservationId");
CREATE INDEX "BookingInquiry_hotelId_status_nextFollowUpAt_idx" ON "BookingInquiry"("hotelId", "status", "nextFollowUpAt");
CREATE INDEX "BookingInquiry_mobile_email_idx" ON "BookingInquiry"("mobile", "email");
CREATE INDEX "InquiryFollowUp_inquiryId_createdAt_idx" ON "InquiryFollowUp"("inquiryId", "createdAt");
CREATE INDEX "Reservation_corporateAccountId_createdAt_idx" ON "Reservation"("corporateAccountId", "createdAt");

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "CorporateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ExpenseCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CorporateAccountHotel" ADD CONSTRAINT "CorporateAccountHotel_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "CorporateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorporateAccountHotel" ADD CONSTRAINT "CorporateAccountHotel_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorporateRateAgreement" ADD CONSTRAINT "CorporateRateAgreement_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "CorporateAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorporateRateAgreement" ADD CONSTRAINT "CorporateRateAgreement_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorporateRateAgreement" ADD CONSTRAINT "CorporateRateAgreement_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CorporateRateAgreement" ADD CONSTRAINT "CorporateRateAgreement_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingInquiry" ADD CONSTRAINT "BookingInquiry_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BookingInquiry" ADD CONSTRAINT "BookingInquiry_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingInquiry" ADD CONSTRAINT "BookingInquiry_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BookingInquiry" ADD CONSTRAINT "BookingInquiry_convertedReservationId_fkey" FOREIGN KEY ("convertedReservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InquiryFollowUp" ADD CONSTRAINT "InquiryFollowUp_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "BookingInquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InquiryFollowUp" ADD CONSTRAINT "InquiryFollowUp_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "ExpenseCategory" ("id", "name", "code", "description", "updatedAt") VALUES
  ('expense-category-housekeeping', 'Housekeeping supplies', 'HOUSEKEEPING_SUPPLIES', 'Operational housekeeping supplies', CURRENT_TIMESTAMP),
  ('expense-category-maintenance', 'Maintenance', 'MAINTENANCE', 'Repairs and maintenance', CURRENT_TIMESTAMP),
  ('expense-category-fnb', 'F&B supplies', 'FNB_SUPPLIES', 'Food and beverage supplies', CURRENT_TIMESTAMP),
  ('expense-category-laundry', 'Laundry', 'LAUNDRY', 'Laundry operations', CURRENT_TIMESTAMP),
  ('expense-category-utilities', 'Utilities', 'UTILITIES', 'Power, water, and utilities', CURRENT_TIMESTAMP),
  ('expense-category-transport', 'Transport', 'TRANSPORT', 'Hotel transport', CURRENT_TIMESTAMP),
  ('expense-category-office', 'Office / Admin', 'OFFICE', 'Office and administration', CURRENT_TIMESTAMP),
  ('expense-category-misc', 'Miscellaneous', 'MISCELLANEOUS', 'Other operating expense', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;

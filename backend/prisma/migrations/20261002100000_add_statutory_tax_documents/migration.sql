-- CreateEnum
CREATE TYPE "TaxInvoiceStatus" AS ENUM ('DRAFT', 'ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaxCustomerType" AS ENUM ('INDIVIDUAL', 'CORPORATE', 'AGENT');

-- CreateEnum
CREATE TYPE "TaxInvoiceLineType" AS ENUM ('ROOM', 'FOOD_BEVERAGE', 'LAUNDRY', 'ROOM_SERVICE', 'OTHER_SERVICE', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "TaxRuleType" AS ENUM ('GST');

-- CreateEnum
CREATE TYPE "TaxCreditNoteStatus" AS ENUM ('ISSUED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TdsStatus" AS ENUM ('RECORDED', 'CERTIFICATE_PENDING', 'CERTIFICATE_RECEIVED', 'REVERSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DocumentSequenceType" ADD VALUE 'TAX_INVOICE';
ALTER TYPE "DocumentSequenceType" ADD VALUE 'CREDIT_NOTE';

-- DropIndex
DROP INDEX "Reservation_reconfirmedAt_idx";

-- DropIndex
DROP INDEX "ReservationSettlement_overrideAuthorizedById_idx";

-- AlterTable
ALTER TABLE "AgentRatePlan" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "RatePlanMaster" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "HotelTaxProfile" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "tradeName" TEXT,
    "gstin" TEXT,
    "pan" TEXT,
    "registeredAddress" TEXT,
    "city" TEXT,
    "state" TEXT,
    "stateCode" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'India',
    "invoicePrefix" TEXT,
    "creditNotePrefix" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelTaxProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRule" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT,
    "name" TEXT NOT NULL,
    "serviceCode" TEXT,
    "description" TEXT,
    "taxType" "TaxRuleType" NOT NULL DEFAULT 'GST',
    "ratePercent" DECIMAL(5,2) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxInvoice" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "taxProfileId" TEXT,
    "invoiceNo" TEXT NOT NULL,
    "invoiceDate" DATE NOT NULL,
    "financialYear" TEXT NOT NULL,
    "status" "TaxInvoiceStatus" NOT NULL DEFAULT 'DRAFT',
    "reservationId" TEXT NOT NULL,
    "settlementId" TEXT,
    "customerType" "TaxCustomerType" NOT NULL,
    "customerName" TEXT NOT NULL,
    "customerGstin" TEXT,
    "customerAddress" TEXT,
    "customerState" TEXT,
    "customerStateCode" TEXT,
    "customerEmail" TEXT,
    "customerMobile" TEXT,
    "hotelLegalName" TEXT NOT NULL,
    "hotelTradeName" TEXT,
    "hotelGstin" TEXT,
    "hotelPan" TEXT,
    "hotelAddress" TEXT,
    "hotelCity" TEXT,
    "hotelState" TEXT,
    "hotelStateCode" TEXT,
    "hotelPostalCode" TEXT,
    "placeOfSupplyState" TEXT,
    "placeOfSupplyStateCode" TEXT,
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "cgstAmount" DECIMAL(14,2) NOT NULL,
    "sgstAmount" DECIMAL(14,2) NOT NULL,
    "igstAmount" DECIMAL(14,2) NOT NULL,
    "otherTaxAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "roundOff" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxInvoiceLine" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "taxRuleId" TEXT,
    "lineType" "TaxInvoiceLineType" NOT NULL,
    "description" TEXT NOT NULL,
    "serviceCode" TEXT,
    "quantity" DECIMAL(10,2) NOT NULL,
    "unitAmount" DECIMAL(14,2) NOT NULL,
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "cgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxInvoiceLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCreditNote" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "creditNoteNo" TEXT NOT NULL,
    "creditNoteDate" DATE NOT NULL,
    "financialYear" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "TaxCreditNoteStatus" NOT NULL DEFAULT 'ISSUED',
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "cgstAmount" DECIMAL(14,2) NOT NULL,
    "sgstAmount" DECIMAL(14,2) NOT NULL,
    "igstAmount" DECIMAL(14,2) NOT NULL,
    "grandTotal" DECIMAL(14,2) NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancellationReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "hotelTaxProfileId" TEXT,

    CONSTRAINT "TaxCreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCreditNoteLine" (
    "id" TEXT NOT NULL,
    "creditNoteId" TEXT NOT NULL,
    "invoiceLineId" TEXT,
    "description" TEXT NOT NULL,
    "serviceCode" TEXT,
    "taxableAmount" DECIMAL(14,2) NOT NULL,
    "taxRate" DECIMAL(5,2) NOT NULL,
    "cgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCreditNoteLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TdsDeduction" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "corporateAccountId" TEXT NOT NULL,
    "taxInvoiceId" TEXT NOT NULL,
    "deductionDate" DATE NOT NULL,
    "sectionCode" TEXT,
    "ratePercent" DECIMAL(5,2),
    "grossInvoiceAmount" DECIMAL(14,2) NOT NULL,
    "tdsAmount" DECIMAL(14,2) NOT NULL,
    "certificateNumber" TEXT,
    "certificateDate" DATE,
    "financialYear" TEXT,
    "status" "TdsStatus" NOT NULL DEFAULT 'CERTIFICATE_PENDING',
    "notes" TEXT,
    "recordedById" TEXT,
    "reversedById" TEXT,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TdsDeduction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HotelTaxProfile_hotelId_active_idx" ON "HotelTaxProfile"("hotelId", "active");

-- CreateIndex
CREATE INDEX "TaxRule_hotelId_active_effectiveFrom_effectiveTo_idx" ON "TaxRule"("hotelId", "active", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_invoiceNo_key" ON "TaxInvoice"("invoiceNo");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_reservationId_key" ON "TaxInvoice"("reservationId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxInvoice_settlementId_key" ON "TaxInvoice"("settlementId");

-- CreateIndex
CREATE INDEX "TaxInvoice_hotelId_invoiceDate_status_idx" ON "TaxInvoice"("hotelId", "invoiceDate", "status");

-- CreateIndex
CREATE INDEX "TaxInvoice_customerType_customerGstin_idx" ON "TaxInvoice"("customerType", "customerGstin");

-- CreateIndex
CREATE INDEX "TaxInvoiceLine_invoiceId_idx" ON "TaxInvoiceLine"("invoiceId");

-- CreateIndex
CREATE INDEX "TaxInvoiceLine_sourceType_sourceId_idx" ON "TaxInvoiceLine"("sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxCreditNote_creditNoteNo_key" ON "TaxCreditNote"("creditNoteNo");

-- CreateIndex
CREATE INDEX "TaxCreditNote_hotelId_creditNoteDate_status_idx" ON "TaxCreditNote"("hotelId", "creditNoteDate", "status");

-- CreateIndex
CREATE INDEX "TaxCreditNoteLine_creditNoteId_idx" ON "TaxCreditNoteLine"("creditNoteId");

-- CreateIndex
CREATE INDEX "TdsDeduction_hotelId_deductionDate_status_idx" ON "TdsDeduction"("hotelId", "deductionDate", "status");

-- CreateIndex
CREATE INDEX "TdsDeduction_corporateAccountId_taxInvoiceId_idx" ON "TdsDeduction"("corporateAccountId", "taxInvoiceId");

-- AddForeignKey
ALTER TABLE "HotelTaxProfile" ADD CONSTRAINT "HotelTaxProfile_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRule" ADD CONSTRAINT "TaxRule_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_taxProfileId_fkey" FOREIGN KEY ("taxProfileId") REFERENCES "HotelTaxProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ReservationSettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoice" ADD CONSTRAINT "TaxInvoice_cancelledById_fkey" FOREIGN KEY ("cancelledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoiceLine" ADD CONSTRAINT "TaxInvoiceLine_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TaxInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxInvoiceLine" ADD CONSTRAINT "TaxInvoiceLine_taxRuleId_fkey" FOREIGN KEY ("taxRuleId") REFERENCES "TaxRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditNote" ADD CONSTRAINT "TaxCreditNote_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditNote" ADD CONSTRAINT "TaxCreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "TaxInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditNote" ADD CONSTRAINT "TaxCreditNote_issuedById_fkey" FOREIGN KEY ("issuedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditNote" ADD CONSTRAINT "TaxCreditNote_hotelTaxProfileId_fkey" FOREIGN KEY ("hotelTaxProfileId") REFERENCES "HotelTaxProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditNoteLine" ADD CONSTRAINT "TaxCreditNoteLine_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "TaxCreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_corporateAccountId_fkey" FOREIGN KEY ("corporateAccountId") REFERENCES "CorporateAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_taxInvoiceId_fkey" FOREIGN KEY ("taxInvoiceId") REFERENCES "TaxInvoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TdsDeduction" ADD CONSTRAINT "TdsDeduction_reversedById_fkey" FOREIGN KEY ("reversedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "RevenueForecastSnapshot_hotelId_observationDate_stayDate_roomTy" RENAME TO "RevenueForecastSnapshot_hotelId_observationDate_stayDate_ro_key";


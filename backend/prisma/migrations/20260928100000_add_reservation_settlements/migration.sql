CREATE TYPE "ReservationSettlementStatus" AS ENUM ('OPEN', 'SETTLED', 'PARTIAL', 'WRITTEN_OFF', 'VOIDED');

CREATE TABLE "ReservationSettlement" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "status" "ReservationSettlementStatus" NOT NULL DEFAULT 'OPEN',
    "reservationAmount" DECIMAL(12,2) NOT NULL,
    "incidentalAmount" DECIMAL(12,2) NOT NULL,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustmentAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "grossAmount" DECIMAL(12,2) NOT NULL,
    "paidAmount" DECIMAL(12,2) NOT NULL,
    "balanceAmount" DECIMAL(12,2) NOT NULL,
    "finalFolioNumber" TEXT,
    "settledAt" TIMESTAMP(3),
    "settledById" TEXT,
    "overrideReason" TEXT,
    "overrideAuthorizedBy" TEXT,
    "notes" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReservationSettlement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReservationSettlement_reservationId_key" ON "ReservationSettlement"("reservationId");
CREATE UNIQUE INDEX "ReservationSettlement_finalFolioNumber_key" ON "ReservationSettlement"("finalFolioNumber");
CREATE INDEX "ReservationSettlement_status_settledAt_idx" ON "ReservationSettlement"("status", "settledAt");

ALTER TABLE "ReservationSettlement" ADD CONSTRAINT "ReservationSettlement_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservationSettlement" ADD CONSTRAINT "ReservationSettlement_settledById_fkey" FOREIGN KEY ("settledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Payment" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

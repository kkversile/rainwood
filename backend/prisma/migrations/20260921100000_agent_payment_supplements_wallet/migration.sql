-- Per-agent payment terms, immutable reservation snapshots, hotel supplements,
-- and verified wallet recharge attempts.
CREATE TYPE "AgentPaymentPolicy" AS ENUM ('PERCENTAGE', 'CREDIT');

ALTER TABLE "User"
  ADD COLUMN "agentPaymentPolicy" "AgentPaymentPolicy",
  ADD COLUMN "bookingPaymentPercent" DECIMAL(5, 2);

-- Preserve the existing full-wallet-payment behaviour for active agents.
UPDATE "User"
SET "agentPaymentPolicy" = 'PERCENTAGE', "bookingPaymentPercent" = 100
WHERE "role" = 'AGENT' AND "active" = true;

ALTER TABLE "Reservation"
  ADD COLUMN "paymentTermsSnapshot" JSONB;

CREATE TYPE "SupplementaryChargeScope" AS ENUM ('AGENTS', 'ALL');

CREATE TABLE "HotelSupplementaryCharge" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "amountPerRoomNight" DECIMAL(12, 2) NOT NULL,
  "scope" "SupplementaryChargeScope" NOT NULL DEFAULT 'AGENTS',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotelSupplementaryCharge_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HotelSupplementaryCharge_hotelId_active_startDate_endDate_idx"
  ON "HotelSupplementaryCharge"("hotelId", "active", "startDate", "endDate");

ALTER TABLE "HotelSupplementaryCharge"
  ADD CONSTRAINT "HotelSupplementaryCharge_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WalletRechargeAttempt" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "providerOrderId" TEXT NOT NULL,
  "providerPaymentId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "amount" DECIMAL(12, 2) NOT NULL,
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'CREATED',
  "providerPayload" JSONB,
  "expiresAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WalletRechargeAttempt_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletRechargeAttempt_providerOrderId_key" ON "WalletRechargeAttempt"("providerOrderId");
CREATE UNIQUE INDEX "WalletRechargeAttempt_providerPaymentId_key" ON "WalletRechargeAttempt"("providerPaymentId");
CREATE UNIQUE INDEX "WalletRechargeAttempt_idempotencyKey_key" ON "WalletRechargeAttempt"("idempotencyKey");
CREATE INDEX "WalletRechargeAttempt_walletId_status_createdAt_idx" ON "WalletRechargeAttempt"("walletId", "status", "createdAt");

ALTER TABLE "WalletRechargeAttempt"
  ADD CONSTRAINT "WalletRechargeAttempt_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "AgentWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

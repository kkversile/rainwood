-- Normalized per-agent payment milestone schedules.
CREATE TYPE "PaymentMilestoneDueType" AS ENUM ('ON_BOOKING', 'DAYS_BEFORE_CHECKIN');

CREATE TABLE "AgentPaymentMilestone" (
  "id" TEXT NOT NULL,
  "agentId" TEXT NOT NULL,
  "percentage" DECIMAL(5, 2) NOT NULL,
  "dueType" "PaymentMilestoneDueType" NOT NULL,
  "daysBeforeCheckIn" INTEGER,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AgentPaymentMilestone_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AgentPaymentMilestone_agentId_sortOrder_idx"
  ON "AgentPaymentMilestone"("agentId", "sortOrder");
CREATE INDEX "AgentPaymentMilestone_agentId_dueType_daysBeforeCheckIn_idx"
  ON "AgentPaymentMilestone"("agentId", "dueType", "daysBeforeCheckIn");

ALTER TABLE "AgentPaymentMilestone"
  ADD CONSTRAINT "AgentPaymentMilestone_agentId_fkey"
  FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the legacy policy without changing its existing meaning.
-- 25% / 50% become booking plus check-in, Credit becomes check-in,
-- and legacy 100% remains an on-booking payment.
INSERT INTO "AgentPaymentMilestone" ("id", "agentId", "percentage", "dueType", "daysBeforeCheckIn", "sortOrder", "updatedAt")
SELECT 'legacy-' || u."id" || '-booking', u."id", u."bookingPaymentPercent", 'ON_BOOKING', NULL, 0, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'AGENT'
  AND u."agentPaymentPolicy" = 'PERCENTAGE'
  AND u."bookingPaymentPercent" IS NOT NULL
  AND u."bookingPaymentPercent" > 0;

INSERT INTO "AgentPaymentMilestone" ("id", "agentId", "percentage", "dueType", "daysBeforeCheckIn", "sortOrder", "updatedAt")
SELECT 'legacy-' || u."id" || '-checkin', u."id", 100 - u."bookingPaymentPercent", 'DAYS_BEFORE_CHECKIN', 0, 1, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'AGENT'
  AND u."agentPaymentPolicy" = 'PERCENTAGE'
  AND u."bookingPaymentPercent" IS NOT NULL
  AND u."bookingPaymentPercent" > 0
  AND u."bookingPaymentPercent" < 100;

INSERT INTO "AgentPaymentMilestone" ("id", "agentId", "percentage", "dueType", "daysBeforeCheckIn", "sortOrder", "updatedAt")
SELECT 'legacy-' || u."id" || '-credit', u."id", 100, 'DAYS_BEFORE_CHECKIN', 0, 0, CURRENT_TIMESTAMP
FROM "User" u
WHERE u."role" = 'AGENT'
  AND u."agentPaymentPolicy" = 'CREDIT';

-- AgentRatePlan is an access mapping only. Daily prices are owned by RateDay.
DROP TABLE "AgentRateDay";

ALTER TABLE "AgentRatePlan"
DROP COLUMN "pricingMode",
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Daily normalized category rates for the Rate Master grid. Legacy category bands remain intact.
CREATE TABLE "AgentCategoryRateDay" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "category" "AgentRateCategory" NOT NULL,
    "date" DATE NOT NULL,
    "singleAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "doubleAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extraAdultAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "childWithBedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "childWithoutBedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentCategoryRateDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCategoryRateDay_ratePlanId_category_date_key" ON "AgentCategoryRateDay"("ratePlanId", "category", "date");
CREATE INDEX "AgentCategoryRateDay_ratePlanId_category_date_idx" ON "AgentCategoryRateDay"("ratePlanId", "category", "date");

ALTER TABLE "RateDay" ADD COLUMN "childWithoutBedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "AgentCategoryRateDay" ADD CONSTRAINT "AgentCategoryRateDay_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCategoryRateDay" ADD CONSTRAINT "AgentCategoryRateDay_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCategoryRateDay" ADD CONSTRAINT "AgentCategoryRateDay_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

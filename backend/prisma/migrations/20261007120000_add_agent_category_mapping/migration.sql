-- Additive Rate Master / agent-category model. Legacy slab tables remain intact.
CREATE TYPE "AgentRateCategory" AS ENUM ('A', 'B', 'C', 'D', 'E');

CREATE TABLE "AgentCategoryRateBand" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "categoryAAmount" DECIMAL(12,2) NOT NULL,
    "categoryBAmount" DECIMAL(12,2) NOT NULL,
    "categoryCAmount" DECIMAL(12,2) NOT NULL,
    "categoryDAmount" DECIMAL(12,2) NOT NULL,
    "categoryEAmount" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentCategoryRateBand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MealPlanGuestSupplementBand" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "extraAdultAmount" DECIMAL(12,2) NOT NULL,
    "childWithBedAmount" DECIMAL(12,2) NOT NULL,
    "childWithoutBedAmount" DECIMAL(12,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MealPlanGuestSupplementBand_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentHotelRateCategoryAssignment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "category" "AgentRateCategory" NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentHotelRateCategoryAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentCategoryRateBand_ratePlanId_validFrom_validTo_key" ON "AgentCategoryRateBand"("ratePlanId", "validFrom", "validTo");
CREATE INDEX "AgentCategoryRateBand_ratePlanId_active_validFrom_validTo_idx" ON "AgentCategoryRateBand"("ratePlanId", "active", "validFrom", "validTo");
CREATE UNIQUE INDEX "MealPlanGuestSupplementBand_hotelId_mealPlan_validFrom_validTo_key" ON "MealPlanGuestSupplementBand"("hotelId", "mealPlan", "validFrom", "validTo");
CREATE INDEX "MealPlanGuestSupplementBand_hotelId_mealPlan_active_validFrom_validTo_idx" ON "MealPlanGuestSupplementBand"("hotelId", "mealPlan", "active", "validFrom", "validTo");
CREATE UNIQUE INDEX "AgentHotelRateCategoryAssignment_agentId_hotelId_validFrom_key" ON "AgentHotelRateCategoryAssignment"("agentId", "hotelId", "validFrom");
CREATE INDEX "AgentHotelRateCategoryAssignment_agentId_hotelId_active_validFrom_validTo_idx" ON "AgentHotelRateCategoryAssignment"("agentId", "hotelId", "active", "validFrom", "validTo");
CREATE INDEX "AgentHotelRateCategoryAssignment_hotelId_active_validFrom_validTo_idx" ON "AgentHotelRateCategoryAssignment"("hotelId", "active", "validFrom", "validTo");

ALTER TABLE "AgentCategoryRateBand" ADD CONSTRAINT "AgentCategoryRateBand_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentCategoryRateBand" ADD CONSTRAINT "AgentCategoryRateBand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentCategoryRateBand" ADD CONSTRAINT "AgentCategoryRateBand_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MealPlanGuestSupplementBand" ADD CONSTRAINT "MealPlanGuestSupplementBand_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MealPlanGuestSupplementBand" ADD CONSTRAINT "MealPlanGuestSupplementBand_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MealPlanGuestSupplementBand" ADD CONSTRAINT "MealPlanGuestSupplementBand_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentHotelRateCategoryAssignment" ADD CONSTRAINT "AgentHotelRateCategoryAssignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentHotelRateCategoryAssignment" ADD CONSTRAINT "AgentHotelRateCategoryAssignment_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentHotelRateCategoryAssignment" ADD CONSTRAINT "AgentHotelRateCategoryAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentHotelRateCategoryAssignment" ADD CONSTRAINT "AgentHotelRateCategoryAssignment_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

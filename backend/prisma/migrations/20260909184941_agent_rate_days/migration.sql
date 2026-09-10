-- AlterTable
ALTER TABLE "AgentRatePlan" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "pricingMode" TEXT NOT NULL DEFAULT 'BASE';

-- AlterTable
ALTER TABLE "InventoryHold" ADD COLUMN     "agentId" TEXT;

-- CreateTable
CREATE TABLE "AgentRateDay" (
    "id" TEXT NOT NULL,
    "agentRatePlanId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "amount" DECIMAL(65,30),
    "taxAmount" DECIMAL(65,30),
    "childAmount" DECIMAL(65,30),
    "extraAdultAmount" DECIMAL(65,30),
    "occupancyPrices" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRateDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRateDay_date_agentRatePlanId_idx" ON "AgentRateDay"("date", "agentRatePlanId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRateDay_agentRatePlanId_date_key" ON "AgentRateDay"("agentRatePlanId", "date");

-- CreateIndex
CREATE INDEX "AgentRatePlan_agentId_active_idx" ON "AgentRatePlan"("agentId", "active");

-- AddForeignKey
ALTER TABLE "AgentRateDay" ADD CONSTRAINT "AgentRateDay_agentRatePlanId_fkey" FOREIGN KEY ("agentRatePlanId") REFERENCES "AgentRatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryHold" ADD CONSTRAINT "InventoryHold_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

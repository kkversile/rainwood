CREATE TYPE "AgentRateSlabStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'RETIRED');

CREATE TABLE "AgentRateSlab" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "AgentRateSlabStatus" NOT NULL DEFAULT 'DRAFT',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRateSlab_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRateSlabRate" (
    "id" TEXT NOT NULL,
    "slabId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "extraAdultAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "extraChildWithBedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "childWithoutBedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "occupancyPrices" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRateSlabRate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRateSlabAssignment" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "slabId" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "validTo" DATE NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AgentRateSlabAssignment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AgentRateSheet" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "slabId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshotJson" JSONB NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRateSheet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRateSlab_code_version_key" ON "AgentRateSlab"("code", "version");
CREATE INDEX "AgentRateSlab_code_active_status_idx" ON "AgentRateSlab"("code", "active", "status");
CREATE INDEX "AgentRateSlab_validFrom_validTo_idx" ON "AgentRateSlab"("validFrom", "validTo");
CREATE UNIQUE INDEX "AgentRateSlabRate_slabId_ratePlanId_validFrom_validTo_key" ON "AgentRateSlabRate"("slabId", "ratePlanId", "validFrom", "validTo");
CREATE INDEX "AgentRateSlabRate_slabId_active_validFrom_validTo_idx" ON "AgentRateSlabRate"("slabId", "active", "validFrom", "validTo");
CREATE INDEX "AgentRateSlabRate_ratePlanId_active_validFrom_validTo_idx" ON "AgentRateSlabRate"("ratePlanId", "active", "validFrom", "validTo");
CREATE UNIQUE INDEX "AgentRateSlabAssignment_agentId_slabId_validFrom_key" ON "AgentRateSlabAssignment"("agentId", "slabId", "validFrom");
CREATE INDEX "AgentRateSlabAssignment_agentId_active_validFrom_validTo_idx" ON "AgentRateSlabAssignment"("agentId", "active", "validFrom", "validTo");
CREATE INDEX "AgentRateSlabAssignment_slabId_active_idx" ON "AgentRateSlabAssignment"("slabId", "active");
CREATE UNIQUE INDEX "AgentRateSheet_agentId_slabId_version_key" ON "AgentRateSheet"("agentId", "slabId", "version");
CREATE INDEX "AgentRateSheet_agentId_publishedAt_idx" ON "AgentRateSheet"("agentId", "publishedAt");

ALTER TABLE "AgentRateSlab" ADD CONSTRAINT "AgentRateSlab_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRateSlab" ADD CONSTRAINT "AgentRateSlab_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRateSlabRate" ADD CONSTRAINT "AgentRateSlabRate_slabId_fkey" FOREIGN KEY ("slabId") REFERENCES "AgentRateSlab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRateSlabRate" ADD CONSTRAINT "AgentRateSlabRate_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AgentRateSlabAssignment" ADD CONSTRAINT "AgentRateSlabAssignment_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRateSlabAssignment" ADD CONSTRAINT "AgentRateSlabAssignment_slabId_fkey" FOREIGN KEY ("slabId") REFERENCES "AgentRateSlab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRateSlabAssignment" ADD CONSTRAINT "AgentRateSlabAssignment_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentRateSheet" ADD CONSTRAINT "AgentRateSheet_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRateSheet" ADD CONSTRAINT "AgentRateSheet_slabId_fkey" FOREIGN KEY ("slabId") REFERENCES "AgentRateSlab"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRateSheet" ADD CONSTRAINT "AgentRateSheet_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

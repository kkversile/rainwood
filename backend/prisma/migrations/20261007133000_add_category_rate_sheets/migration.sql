-- Additive immutable category-based rate-sheet storage. Legacy slab sheets remain readable.
ALTER TABLE "AgentRateSheet" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'AGENT_SLAB';
ALTER TABLE "AgentRateSheet" ALTER COLUMN "slabId" DROP NOT NULL;
CREATE UNIQUE INDEX "AgentRateSheet_agentId_sourceType_version_key" ON "AgentRateSheet"("agentId", "sourceType", "version");

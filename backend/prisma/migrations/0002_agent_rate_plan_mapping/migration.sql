CREATE TABLE "AgentRatePlan" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AgentRatePlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AgentRatePlan_agentId_ratePlanId_key" ON "AgentRatePlan"("agentId", "ratePlanId");
CREATE INDEX "AgentRatePlan_ratePlanId_idx" ON "AgentRatePlan"("ratePlanId");

ALTER TABLE "AgentRatePlan" ADD CONSTRAINT "AgentRatePlan_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentRatePlan" ADD CONSTRAINT "AgentRatePlan_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

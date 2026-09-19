-- CreateEnum
CREATE TYPE "AgentDocumentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "AgentDocument" (
    "id" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "documentType" TEXT NOT NULL,
    "description" TEXT,
    "fileId" TEXT NOT NULL,
    "status" "AgentDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "reviewRemark" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentDocument_agentId_status_createdAt_idx" ON "AgentDocument"("agentId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentDocument_agentId_documentType_key" ON "AgentDocument"("agentId", "documentType");

-- AddForeignKey
ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentDocument" ADD CONSTRAINT "AgentDocument_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

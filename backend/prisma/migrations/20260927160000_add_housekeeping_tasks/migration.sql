CREATE TYPE "HousekeepingTaskStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CLEANING', 'COMPLETED', 'CANCELLED');

CREATE TABLE "HousekeepingTask" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomId" TEXT NOT NULL,
  "assignedToId" TEXT,
  "status" "HousekeepingTaskStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "cleaningStartedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "completedById" TEXT,
  "note" TEXT,
  "issueNote" TEXT,
  "issueReportedAt" TIMESTAMP(3),
  "issueReportedById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HousekeepingTask_hotelId_status_idx" ON "HousekeepingTask"("hotelId", "status");
CREATE INDEX "HousekeepingTask_roomId_status_idx" ON "HousekeepingTask"("roomId", "status");
CREATE INDEX "HousekeepingTask_assignedToId_status_idx" ON "HousekeepingTask"("assignedToId", "status");

ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_issueReportedById_fkey" FOREIGN KEY ("issueReportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Repair existing dirty rooms idempotently without changing room or stay history.
INSERT INTO "HousekeepingTask" ("id", "hotelId", "roomId", "status", "createdAt", "updatedAt")
SELECT md5('housekeeping:migration:' || room."id"), room."hotelId", room."id", 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Room" room
WHERE room."status" = 'DIRTY'
  AND NOT EXISTS (
    SELECT 1 FROM "HousekeepingTask" task
    WHERE task."roomId" = room."id"
      AND task."status" IN ('PENDING', 'ACCEPTED', 'CLEANING')
  );

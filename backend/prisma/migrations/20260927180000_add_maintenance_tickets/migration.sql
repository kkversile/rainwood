CREATE TYPE "MaintenanceTicketSource" AS ENUM ('HOUSEKEEPING', 'FRONT_DESK', 'STAFF', 'ADMIN', 'OTHER');
CREATE TYPE "MaintenanceCategory" AS ENUM ('ELECTRICAL', 'PLUMBING', 'HVAC', 'TV_ELECTRONICS', 'FURNITURE', 'BATHROOM', 'DOOR_LOCK', 'INTERNET', 'GENERAL', 'OTHER');
CREATE TYPE "MaintenancePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "MaintenanceTicketStatus" AS ENUM ('OPEN', 'ASSIGNED', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED');

CREATE TABLE "MaintenanceTicket" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomId" TEXT,
  "housekeepingTaskId" TEXT,
  "source" "MaintenanceTicketSource" NOT NULL,
  "category" "MaintenanceCategory" NOT NULL,
  "priority" "MaintenancePriority" NOT NULL DEFAULT 'NORMAL',
  "status" "MaintenanceTicketStatus" NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "reportedById" TEXT,
  "reportedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedToId" TEXT,
  "assignedAt" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "resolutionNote" TEXT,
  "requiresOutOfOrder" BOOLEAN NOT NULL DEFAULT false,
  "outOfOrderAppliedAt" TIMESTAMP(3),
  "outOfOrderClearedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MaintenanceTicket_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MaintenanceTicket_housekeepingTaskId_key" ON "MaintenanceTicket"("housekeepingTaskId");
CREATE INDEX "MaintenanceTicket_hotelId_status_idx" ON "MaintenanceTicket"("hotelId", "status");
CREATE INDEX "MaintenanceTicket_roomId_status_idx" ON "MaintenanceTicket"("roomId", "status");
CREATE INDEX "MaintenanceTicket_assignedToId_status_idx" ON "MaintenanceTicket"("assignedToId", "status");
CREATE INDEX "MaintenanceTicket_hotelId_priority_status_idx" ON "MaintenanceTicket"("hotelId", "priority", "status");

ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_housekeepingTaskId_fkey" FOREIGN KEY ("housekeepingTaskId") REFERENCES "HousekeepingTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MaintenanceTicket" ADD CONSTRAINT "MaintenanceTicket_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Operations logbook: a hotel-scoped, business-date-aware handover record.
CREATE TYPE "OperationsLogCategory" AS ENUM ('GUEST_REQUEST', 'VIP', 'COMPLAINT', 'PAYMENT_FOLLOWUP', 'ARRIVAL', 'DEPARTURE', 'ROOM', 'HOUSEKEEPING', 'MAINTENANCE', 'TRANSPORT', 'SECURITY', 'GENERAL');
CREATE TYPE "OperationsLogPriority" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');
CREATE TYPE "OperationsLogStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

CREATE TABLE "OperationsLogEntry" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "category" "OperationsLogCategory" NOT NULL,
    "priority" "OperationsLogPriority" NOT NULL DEFAULT 'NORMAL',
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "status" "OperationsLogStatus" NOT NULL DEFAULT 'OPEN',
    "createdByUserId" TEXT NOT NULL,
    "assignedDepartment" "StaffDepartment",
    "assignedUserId" TEXT,
    "reservationId" TEXT,
    "guestProfileId" TEXT,
    "roomId" TEXT,
    "maintenanceTicketId" TEXT,
    "housekeepingTaskId" TEXT,
    "dueAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OperationsLogEntry_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OperationsLogUpdate" (
    "id" TEXT NOT NULL,
    "logEntryId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OperationsLogUpdate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OperationsLogEntry_hotelId_status_businessDate_idx" ON "OperationsLogEntry"("hotelId", "status", "businessDate");
CREATE INDEX "OperationsLogEntry_hotelId_assignedDepartment_status_idx" ON "OperationsLogEntry"("hotelId", "assignedDepartment", "status");
CREATE INDEX "OperationsLogEntry_hotelId_dueAt_idx" ON "OperationsLogEntry"("hotelId", "dueAt");
CREATE INDEX "OperationsLogEntry_reservationId_idx" ON "OperationsLogEntry"("reservationId");
CREATE INDEX "OperationsLogEntry_roomId_idx" ON "OperationsLogEntry"("roomId");
CREATE INDEX "OperationsLogUpdate_logEntryId_createdAt_idx" ON "OperationsLogUpdate"("logEntryId", "createdAt");

ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_assignedUserId_fkey" FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_maintenanceTicketId_fkey" FOREIGN KEY ("maintenanceTicketId") REFERENCES "MaintenanceTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_housekeepingTaskId_fkey" FOREIGN KEY ("housekeepingTaskId") REFERENCES "HousekeepingTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_acknowledgedByUserId_fkey" FOREIGN KEY ("acknowledgedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogEntry" ADD CONSTRAINT "OperationsLogEntry_resolvedByUserId_fkey" FOREIGN KEY ("resolvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OperationsLogUpdate" ADD CONSTRAINT "OperationsLogUpdate_logEntryId_fkey" FOREIGN KEY ("logEntryId") REFERENCES "OperationsLogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OperationsLogUpdate" ADD CONSTRAINT "OperationsLogUpdate_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

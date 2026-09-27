CREATE TYPE "StayStatus" AS ENUM ('EXPECTED', 'CHECKED_IN', 'CHECKED_OUT', 'NO_SHOW');
CREATE TYPE "RoomOperationalStatus" AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'CLEANING', 'OUT_OF_ORDER');

ALTER TABLE "Reservation"
  ADD COLUMN "stayStatus" "StayStatus" NOT NULL DEFAULT 'EXPECTED',
  ADD COLUMN "checkedInAt" TIMESTAMP(3),
  ADD COLUMN "checkedInById" TEXT,
  ADD COLUMN "checkedOutAt" TIMESTAMP(3),
  ADD COLUMN "checkedOutById" TEXT;

UPDATE "Reservation" SET "stayStatus" = 'CHECKED_OUT' WHERE "status" = 'COMPLETED';
UPDATE "Reservation" SET "stayStatus" = 'NO_SHOW' WHERE "status" = 'NO_SHOW';

CREATE TABLE "Room" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "roomTypeId" TEXT NOT NULL,
  "roomNumber" TEXT NOT NULL,
  "floor" TEXT,
  "wing" TEXT,
  "status" "RoomOperationalStatus" NOT NULL DEFAULT 'AVAILABLE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReservationRoomAssignment" (
  "id" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "reservationLineId" TEXT,
  "roomId" TEXT NOT NULL,
  "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "assignedById" TEXT NOT NULL,
  "unassignedAt" TIMESTAMP(3),
  "unassignedById" TEXT,
  "reason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReservationRoomAssignment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Room_hotelId_roomNumber_key" ON "Room"("hotelId", "roomNumber");
CREATE INDEX "Room_hotelId_roomTypeId_active_idx" ON "Room"("hotelId", "roomTypeId", "active");
CREATE INDEX "Room_hotelId_status_idx" ON "Room"("hotelId", "status");
CREATE INDEX "Reservation_stayStatus_checkIn_checkOut_idx" ON "Reservation"("stayStatus", "checkIn", "checkOut");
CREATE INDEX "ReservationRoomAssignment_reservationId_unassignedAt_idx" ON "ReservationRoomAssignment"("reservationId", "unassignedAt");
CREATE INDEX "ReservationRoomAssignment_roomId_unassignedAt_idx" ON "ReservationRoomAssignment"("roomId", "unassignedAt");
CREATE INDEX "ReservationRoomAssignment_reservationLineId_idx" ON "ReservationRoomAssignment"("reservationLineId");

ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_checkedInById_fkey" FOREIGN KEY ("checkedInById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_checkedOutById_fkey" FOREIGN KEY ("checkedOutById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Room" ADD CONSTRAINT "Room_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationRoomAssignment" ADD CONSTRAINT "ReservationRoomAssignment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservationRoomAssignment" ADD CONSTRAINT "ReservationRoomAssignment_reservationLineId_fkey" FOREIGN KEY ("reservationLineId") REFERENCES "ReservationLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ReservationRoomAssignment" ADD CONSTRAINT "ReservationRoomAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationRoomAssignment" ADD CONSTRAINT "ReservationRoomAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReservationRoomAssignment" ADD CONSTRAINT "ReservationRoomAssignment_unassignedById_fkey" FOREIGN KEY ("unassignedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

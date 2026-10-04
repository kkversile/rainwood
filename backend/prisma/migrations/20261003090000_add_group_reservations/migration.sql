CREATE TYPE "GroupType" AS ENUM ('CORPORATE', 'CONFERENCE', 'WEDDING', 'TOUR', 'CREW', 'FAMILY', 'EVENT', 'OTHER');
CREATE TYPE "GroupReservationStatus" AS ENUM ('INQUIRY', 'TENTATIVE', 'CONFIRMED', 'IN_HOUSE', 'COMPLETED', 'CANCELLED');
CREATE TYPE "GroupBillingInstruction" AS ENUM ('INDIVIDUAL', 'ROOM_TO_MASTER', 'ALL_TO_MASTER');
CREATE TYPE "GroupRoomingListStatus" AS ENUM ('DRAFT', 'READY', 'RESERVATION_CREATED', 'ERROR');

ALTER TABLE "InventoryDay" ADD COLUMN "groupBlocked" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Reservation" ADD COLUMN "groupReservationId" TEXT;

CREATE TABLE "GroupReservation" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "groupCode" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "groupType" "GroupType" NOT NULL DEFAULT 'OTHER',
    "status" "GroupReservationStatus" NOT NULL DEFAULT 'INQUIRY',
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "primaryContactName" TEXT NOT NULL,
    "primaryContactMobile" TEXT NOT NULL,
    "primaryContactEmail" TEXT,
    "corporateId" TEXT,
    "agentId" TEXT,
    "source" "BookingSource" NOT NULL DEFAULT 'DIRECT',
    "billingInstruction" "GroupBillingInstruction" NOT NULL DEFAULT 'INDIVIDUAL',
    "notes" TEXT,
    "cutoffDate" DATE,
    "roomingListDueDate" DATE,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GroupReservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupRoomBlock" (
    "id" TEXT NOT NULL,
    "groupReservationId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "ratePlanId" TEXT,
    "agreedRate" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "inventoryCommitted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GroupRoomBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupRoomBlockNight" (
    "id" TEXT NOT NULL,
    "groupRoomBlockId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "roomsBlocked" INTEGER NOT NULL,
    "roomsPickedUp" INTEGER NOT NULL DEFAULT 0,
    "roomsReleased" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "GroupRoomBlockNight_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GroupRoomingListEntry" (
    "id" TEXT NOT NULL,
    "groupReservationId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "adults" INTEGER NOT NULL DEFAULT 1,
    "children" INTEGER NOT NULL DEFAULT 0,
    "specialRequest" TEXT,
    "externalReference" TEXT,
    "status" "GroupRoomingListStatus" NOT NULL DEFAULT 'DRAFT',
    "errorMessage" TEXT,
    "reservationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GroupRoomingListEntry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "GroupReservation_groupCode_key" ON "GroupReservation"("groupCode");
CREATE INDEX "GroupReservation_hotelId_status_arrivalDate_idx" ON "GroupReservation"("hotelId", "status", "arrivalDate");
CREATE INDEX "GroupReservation_corporateId_arrivalDate_idx" ON "GroupReservation"("corporateId", "arrivalDate");
CREATE INDEX "GroupReservation_agentId_arrivalDate_idx" ON "GroupReservation"("agentId", "arrivalDate");
CREATE INDEX "GroupRoomBlock_groupReservationId_roomTypeId_idx" ON "GroupRoomBlock"("groupReservationId", "roomTypeId");
CREATE UNIQUE INDEX "GroupRoomBlockNight_groupRoomBlockId_date_key" ON "GroupRoomBlockNight"("groupRoomBlockId", "date");
CREATE INDEX "GroupRoomBlockNight_date_groupRoomBlockId_idx" ON "GroupRoomBlockNight"("date", "groupRoomBlockId");
CREATE UNIQUE INDEX "GroupRoomingListEntry_reservationId_key" ON "GroupRoomingListEntry"("reservationId");
CREATE INDEX "GroupRoomingListEntry_groupReservationId_status_idx" ON "GroupRoomingListEntry"("groupReservationId", "status");
CREATE INDEX "GroupRoomingListEntry_roomTypeId_checkIn_checkOut_idx" ON "GroupRoomingListEntry"("roomTypeId", "checkIn", "checkOut");
CREATE INDEX "InventoryDay_roomTypeId_date_groupBlocked_idx" ON "InventoryDay"("roomTypeId", "date", "groupBlocked");
CREATE INDEX "Reservation_groupReservationId_checkIn_idx" ON "Reservation"("groupReservationId", "checkIn");

ALTER TABLE "GroupReservation" ADD CONSTRAINT "GroupReservation_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupReservation" ADD CONSTRAINT "GroupReservation_corporateId_fkey" FOREIGN KEY ("corporateId") REFERENCES "CorporateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupReservation" ADD CONSTRAINT "GroupReservation_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupReservation" ADD CONSTRAINT "GroupReservation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupRoomBlock" ADD CONSTRAINT "GroupRoomBlock_groupReservationId_fkey" FOREIGN KEY ("groupReservationId") REFERENCES "GroupReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupRoomBlock" ADD CONSTRAINT "GroupRoomBlock_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupRoomBlock" ADD CONSTRAINT "GroupRoomBlock_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GroupRoomBlockNight" ADD CONSTRAINT "GroupRoomBlockNight_groupRoomBlockId_fkey" FOREIGN KEY ("groupRoomBlockId") REFERENCES "GroupRoomBlock"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupRoomingListEntry" ADD CONSTRAINT "GroupRoomingListEntry_groupReservationId_fkey" FOREIGN KEY ("groupReservationId") REFERENCES "GroupReservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GroupRoomingListEntry" ADD CONSTRAINT "GroupRoomingListEntry_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "GroupRoomingListEntry" ADD CONSTRAINT "GroupRoomingListEntry_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_groupReservationId_fkey" FOREIGN KEY ("groupReservationId") REFERENCES "GroupReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

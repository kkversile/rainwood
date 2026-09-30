ALTER TYPE "DocumentSequenceType" ADD VALUE 'SERVICE_ORDER';
ALTER TYPE "DocumentSequenceType" ADD VALUE 'LOST_FOUND';

CREATE TYPE "ServiceItemType" AS ENUM ('FOOD', 'BEVERAGE', 'LAUNDRY', 'ROOM_SERVICE', 'OTHER');
CREATE TYPE "GuestServiceOrderStatus" AS ENUM ('DRAFT', 'POSTED', 'VOIDED');
CREATE TYPE "LostFoundType" AS ENUM ('LOST', 'FOUND');
CREATE TYPE "LostFoundStatus" AS ENUM ('OPEN', 'MATCHED', 'RETURNED', 'DISPOSED');

CREATE TABLE "ServiceItem" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "type" "ServiceItemType" NOT NULL,
  "code" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "unitPrice" DECIMAL(12,2) NOT NULL,
  "taxRate" DECIMAL(5,2) NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ServiceItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ServiceItem_hotelId_code_key" ON "ServiceItem"("hotelId", "code");
CREATE INDEX "ServiceItem_hotelId_type_active_idx" ON "ServiceItem"("hotelId", "type", "active");
ALTER TABLE "ServiceItem" ADD CONSTRAINT "ServiceItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "GuestServiceOrder" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "reservationId" TEXT NOT NULL,
  "roomAssignmentId" TEXT,
  "department" "StaffDepartment" NOT NULL,
  "orderNo" TEXT NOT NULL,
  "status" "GuestServiceOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "postedById" TEXT,
  "postedAt" TIMESTAMP(3),
  "subtotalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "folioChargeId" TEXT,
  "idempotencyKey" TEXT NOT NULL,
  "voidedAt" TIMESTAMP(3),
  "voidedById" TEXT,
  "voidReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GuestServiceOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GuestServiceOrder_hotelId_orderNo_key" ON "GuestServiceOrder"("hotelId", "orderNo");
CREATE UNIQUE INDEX "GuestServiceOrder_folioChargeId_key" ON "GuestServiceOrder"("folioChargeId");
CREATE UNIQUE INDEX "GuestServiceOrder_idempotencyKey_key" ON "GuestServiceOrder"("idempotencyKey");
CREATE INDEX "GuestServiceOrder_hotelId_department_status_createdAt_idx" ON "GuestServiceOrder"("hotelId", "department", "status", "createdAt");
CREATE INDEX "GuestServiceOrder_reservationId_createdAt_idx" ON "GuestServiceOrder"("reservationId", "createdAt");
ALTER TABLE "GuestServiceOrder" ADD CONSTRAINT "GuestServiceOrder_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestServiceOrder" ADD CONSTRAINT "GuestServiceOrder_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestServiceOrder" ADD CONSTRAINT "GuestServiceOrder_roomAssignmentId_fkey" FOREIGN KEY ("roomAssignmentId") REFERENCES "ReservationRoomAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestServiceOrder" ADD CONSTRAINT "GuestServiceOrder_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestServiceOrder" ADD CONSTRAINT "GuestServiceOrder_voidedById_fkey" FOREIGN KEY ("voidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestServiceOrder" ADD CONSTRAINT "GuestServiceOrder_folioChargeId_fkey" FOREIGN KEY ("folioChargeId") REFERENCES "ReservationFolioCharge"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "GuestServiceOrderLine" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "serviceItemId" TEXT NOT NULL,
  "descriptionSnapshot" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL,
  "unitPriceSnapshot" DECIMAL(12,2) NOT NULL,
  "taxRateSnapshot" DECIMAL(5,2) NOT NULL,
  "taxableAmount" DECIMAL(12,2) NOT NULL,
  "taxAmount" DECIMAL(12,2) NOT NULL,
  "lineTotal" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestServiceOrderLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "GuestServiceOrderLine_orderId_idx" ON "GuestServiceOrderLine"("orderId");
CREATE INDEX "GuestServiceOrderLine_serviceItemId_createdAt_idx" ON "GuestServiceOrderLine"("serviceItemId", "createdAt");
ALTER TABLE "GuestServiceOrderLine" ADD CONSTRAINT "GuestServiceOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "GuestServiceOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestServiceOrderLine" ADD CONSTRAINT "GuestServiceOrderLine_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "LostFoundItem" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "type" "LostFoundType" NOT NULL,
  "status" "LostFoundStatus" NOT NULL DEFAULT 'OPEN',
  "itemCategory" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "roomId" TEXT,
  "reservationId" TEXT,
  "guestProfileId" TEXT,
  "locationFound" TEXT,
  "foundAt" TIMESTAMP(3),
  "reportedById" TEXT NOT NULL,
  "assignedToId" TEXT,
  "claimantName" TEXT,
  "claimantMobile" TEXT,
  "returnedAt" TIMESTAMP(3),
  "returnedById" TEXT,
  "disposalReason" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LostFoundItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "LostFoundItem_hotelId_reference_key" ON "LostFoundItem"("hotelId", "reference");
CREATE INDEX "LostFoundItem_hotelId_type_status_createdAt_idx" ON "LostFoundItem"("hotelId", "type", "status", "createdAt");
CREATE INDEX "LostFoundItem_roomId_createdAt_idx" ON "LostFoundItem"("roomId", "createdAt");
CREATE INDEX "LostFoundItem_reservationId_status_idx" ON "LostFoundItem"("reservationId", "status");
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "LostFoundItem" ADD CONSTRAINT "LostFoundItem_returnedById_fkey" FOREIGN KEY ("returnedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

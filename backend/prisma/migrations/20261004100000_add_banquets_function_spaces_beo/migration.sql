ALTER TYPE "DocumentSequenceType" ADD VALUE 'BANQUET_EVENT';
ALTER TYPE "DocumentSequenceType" ADD VALUE 'BANQUET_BEO';

CREATE TYPE "FunctionSpaceType" AS ENUM ('BALLROOM', 'BANQUET_HALL', 'MEETING_ROOM', 'BOARDROOM', 'CONFERENCE_HALL', 'LAWN', 'TERRACE', 'POOL_SIDE', 'RESTAURANT_PRIVATE_ROOM', 'OTHER');
CREATE TYPE "BanquetEventType" AS ENUM ('WEDDING', 'RECEPTION', 'CONFERENCE', 'MEETING', 'TRAINING', 'SEMINAR', 'WORKSHOP', 'CORPORATE_EVENT', 'SOCIAL_EVENT', 'BIRTHDAY', 'ANNIVERSARY', 'EXHIBITION', 'OTHER');
CREATE TYPE "BanquetEventStatus" AS ENUM ('INQUIRY', 'TENTATIVE', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BanquetFunctionStatus" AS ENUM ('TENTATIVE', 'CONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "BanquetSetupStyle" AS ENUM ('THEATRE', 'CLASSROOM', 'BOARDROOM', 'U_SHAPE', 'BANQUET', 'RECEPTION', 'CABARET', 'COCKTAIL', 'CUSTOM');
CREATE TYPE "BanquetBEOStatus" AS ENUM ('DRAFT', 'FINAL');
CREATE TYPE "BanquetRequirementCategory" AS ENUM ('FOOD_BEVERAGE', 'AUDIO_VISUAL', 'FURNITURE', 'DECOR', 'HOUSEKEEPING', 'ENGINEERING', 'SECURITY', 'TRANSPORT', 'OTHER');
CREATE TYPE "BanquetRequirementStatus" AS ENUM ('PENDING', 'ACKNOWLEDGED', 'COMPLETED');
CREATE TYPE "BanquetChargeCategory" AS ENUM ('VENUE_RENTAL', 'AUDIO_VISUAL', 'FOOD_PACKAGE', 'DECORATION', 'EQUIPMENT', 'MISCELLANEOUS');

CREATE TABLE "FunctionSpace" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "spaceType" "FunctionSpaceType" NOT NULL DEFAULT 'OTHER',
  "floor" TEXT,
  "locationDescription" TEXT,
  "areaSqFt" DECIMAL(10,2),
  "capacityTheatre" INTEGER,
  "capacityClassroom" INTEGER,
  "capacityBoardroom" INTEGER,
  "capacityUShape" INTEGER,
  "capacityBanquet" INTEGER,
  "capacityReception" INTEGER,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "outOfService" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FunctionSpace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BanquetEvent" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "eventCode" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "eventType" "BanquetEventType" NOT NULL DEFAULT 'OTHER',
  "status" "BanquetEventStatus" NOT NULL DEFAULT 'INQUIRY',
  "groupReservationId" TEXT,
  "inquiryId" TEXT,
  "corporateId" TEXT,
  "agentId" TEXT,
  "primaryContactName" TEXT NOT NULL,
  "primaryContactMobile" TEXT NOT NULL,
  "primaryContactEmail" TEXT,
  "startDate" DATE NOT NULL,
  "endDate" DATE NOT NULL,
  "expectedPax" INTEGER,
  "guaranteedPax" INTEGER,
  "notes" TEXT,
  "cancellationReason" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BanquetEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BanquetFunction" (
  "id" TEXT NOT NULL,
  "banquetEventId" TEXT NOT NULL,
  "functionSpaceId" TEXT NOT NULL,
  "functionName" TEXT NOT NULL,
  "functionDate" DATE NOT NULL,
  "startTime" TEXT NOT NULL,
  "endTime" TEXT NOT NULL,
  "startAt" TIMESTAMP(3) NOT NULL,
  "endAt" TIMESTAMP(3) NOT NULL,
  "setupStyle" "BanquetSetupStyle" NOT NULL,
  "expectedPax" INTEGER,
  "guaranteedPax" INTEGER,
  "status" "BanquetFunctionStatus" NOT NULL DEFAULT 'TENTATIVE',
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BanquetFunction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BanquetEventOrder" (
  "id" TEXT NOT NULL,
  "banquetFunctionId" TEXT NOT NULL,
  "beoNumber" TEXT NOT NULL,
  "status" "BanquetBEOStatus" NOT NULL DEFAULT 'DRAFT',
  "finalizedAt" TIMESTAMP(3),
  "finalizedById" TEXT,
  "operationalNotes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BanquetEventOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BanquetScheduleItem" (
  "id" TEXT NOT NULL,
  "beoId" TEXT NOT NULL,
  "itemTime" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BanquetScheduleItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BanquetRequirement" (
  "id" TEXT NOT NULL,
  "beoId" TEXT NOT NULL,
  "category" "BanquetRequirementCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2),
  "requiredAt" TEXT,
  "department" TEXT NOT NULL,
  "notes" TEXT,
  "status" "BanquetRequirementStatus" NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BanquetRequirement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BanquetChargeLine" (
  "id" TEXT NOT NULL,
  "eventId" TEXT,
  "beoId" TEXT,
  "category" "BanquetChargeCategory" NOT NULL,
  "description" TEXT NOT NULL,
  "quantity" DECIMAL(10,2) NOT NULL DEFAULT 1,
  "unitAmount" DECIMAL(14,2) NOT NULL,
  "totalAmount" DECIMAL(14,2) NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BanquetChargeLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunctionSpace_hotelId_code_key" ON "FunctionSpace"("hotelId", "code");
CREATE INDEX "FunctionSpace_hotelId_active_outOfService_idx" ON "FunctionSpace"("hotelId", "active", "outOfService");
CREATE UNIQUE INDEX "BanquetEvent_eventCode_key" ON "BanquetEvent"("eventCode");
CREATE INDEX "BanquetEvent_hotelId_status_startDate_idx" ON "BanquetEvent"("hotelId", "status", "startDate");
CREATE INDEX "BanquetEvent_hotelId_eventType_startDate_idx" ON "BanquetEvent"("hotelId", "eventType", "startDate");
CREATE INDEX "BanquetEvent_groupReservationId_startDate_idx" ON "BanquetEvent"("groupReservationId", "startDate");
CREATE INDEX "BanquetEvent_corporateId_startDate_idx" ON "BanquetEvent"("corporateId", "startDate");
CREATE INDEX "BanquetEvent_inquiryId_idx" ON "BanquetEvent"("inquiryId");
CREATE INDEX "BanquetFunction_functionSpaceId_startAt_endAt_status_idx" ON "BanquetFunction"("functionSpaceId", "startAt", "endAt", "status");
CREATE INDEX "BanquetFunction_banquetEventId_functionDate_idx" ON "BanquetFunction"("banquetEventId", "functionDate");
CREATE UNIQUE INDEX "BanquetEventOrder_banquetFunctionId_key" ON "BanquetEventOrder"("banquetFunctionId");
CREATE UNIQUE INDEX "BanquetEventOrder_beoNumber_key" ON "BanquetEventOrder"("beoNumber");
CREATE INDEX "BanquetEventOrder_status_finalizedAt_idx" ON "BanquetEventOrder"("status", "finalizedAt");
CREATE INDEX "BanquetScheduleItem_beoId_sortOrder_idx" ON "BanquetScheduleItem"("beoId", "sortOrder");
CREATE INDEX "BanquetRequirement_beoId_status_department_idx" ON "BanquetRequirement"("beoId", "status", "department");
CREATE INDEX "BanquetChargeLine_eventId_createdAt_idx" ON "BanquetChargeLine"("eventId", "createdAt");
CREATE INDEX "BanquetChargeLine_beoId_createdAt_idx" ON "BanquetChargeLine"("beoId", "createdAt");

ALTER TABLE "FunctionSpace" ADD CONSTRAINT "FunctionSpace_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanquetEvent" ADD CONSTRAINT "BanquetEvent_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanquetEvent" ADD CONSTRAINT "BanquetEvent_groupReservationId_fkey" FOREIGN KEY ("groupReservationId") REFERENCES "GroupReservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BanquetEvent" ADD CONSTRAINT "BanquetEvent_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "BookingInquiry"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BanquetEvent" ADD CONSTRAINT "BanquetEvent_corporateId_fkey" FOREIGN KEY ("corporateId") REFERENCES "CorporateAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BanquetEvent" ADD CONSTRAINT "BanquetEvent_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BanquetEvent" ADD CONSTRAINT "BanquetEvent_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BanquetFunction" ADD CONSTRAINT "BanquetFunction_banquetEventId_fkey" FOREIGN KEY ("banquetEventId") REFERENCES "BanquetEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanquetFunction" ADD CONSTRAINT "BanquetFunction_functionSpaceId_fkey" FOREIGN KEY ("functionSpaceId") REFERENCES "FunctionSpace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BanquetEventOrder" ADD CONSTRAINT "BanquetEventOrder_banquetFunctionId_fkey" FOREIGN KEY ("banquetFunctionId") REFERENCES "BanquetFunction"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanquetEventOrder" ADD CONSTRAINT "BanquetEventOrder_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BanquetScheduleItem" ADD CONSTRAINT "BanquetScheduleItem_beoId_fkey" FOREIGN KEY ("beoId") REFERENCES "BanquetEventOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanquetRequirement" ADD CONSTRAINT "BanquetRequirement_beoId_fkey" FOREIGN KEY ("beoId") REFERENCES "BanquetEventOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanquetChargeLine" ADD CONSTRAINT "BanquetChargeLine_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "BanquetEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BanquetChargeLine" ADD CONSTRAINT "BanquetChargeLine_beoId_fkey" FOREIGN KEY ("beoId") REFERENCES "BanquetEventOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

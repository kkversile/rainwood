CREATE TYPE "RateAdjustmentType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "RateSeason" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "adjustmentType" "RateAdjustmentType" NOT NULL,
    "adjustmentValue" DECIMAL(12,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "RateSeason_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RateSeasonRoomType" (
    "seasonId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    CONSTRAINT "RateSeasonRoomType_pkey" PRIMARY KEY ("seasonId", "roomTypeId")
);

CREATE TABLE "RateSeasonRatePlan" (
    "seasonId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    CONSTRAINT "RateSeasonRatePlan_pkey" PRIMARY KEY ("seasonId", "ratePlanId")
);

CREATE TABLE "YieldRule" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomTypeId" TEXT,
    "occupancyFrom" INTEGER NOT NULL,
    "occupancyTo" INTEGER NOT NULL,
    "adjustmentType" "RateAdjustmentType" NOT NULL,
    "adjustmentValue" DECIMAL(12,2) NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "YieldRule_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RateSeason_hotelId_active_startDate_endDate_priority_idx" ON "RateSeason"("hotelId", "active", "startDate", "endDate", "priority");
CREATE INDEX "RateSeasonRoomType_roomTypeId_idx" ON "RateSeasonRoomType"("roomTypeId");
CREATE INDEX "RateSeasonRatePlan_ratePlanId_idx" ON "RateSeasonRatePlan"("ratePlanId");
CREATE INDEX "YieldRule_hotelId_active_occupancyFrom_occupancyTo_priority_idx" ON "YieldRule"("hotelId", "active", "occupancyFrom", "occupancyTo", "priority");
CREATE INDEX "YieldRule_roomTypeId_idx" ON "YieldRule"("roomTypeId");

ALTER TABLE "RateSeason" ADD CONSTRAINT "RateSeason_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateSeasonRoomType" ADD CONSTRAINT "RateSeasonRoomType_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "RateSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateSeasonRoomType" ADD CONSTRAINT "RateSeasonRoomType_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateSeasonRatePlan" ADD CONSTRAINT "RateSeasonRatePlan_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "RateSeason"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RateSeasonRatePlan" ADD CONSTRAINT "RateSeasonRatePlan_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "YieldRule" ADD CONSTRAINT "YieldRule_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "YieldRule" ADD CONSTRAINT "YieldRule_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

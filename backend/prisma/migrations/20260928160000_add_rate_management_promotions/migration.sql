ALTER TABLE "RateDay" ADD COLUMN "baseAmount" DECIMAL(12,2);
ALTER TABLE "RateDay" ADD COLUMN "overrideAmount" DECIMAL(12,2);

CREATE TYPE "PromotionDiscountType" AS ENUM ('PERCENT', 'FIXED');

CREATE TABLE "Promotion" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT,
    "name" TEXT NOT NULL,
    "discountType" "PromotionDiscountType" NOT NULL,
    "discountValue" DECIMAL(12,2) NOT NULL,
    "bookingStart" DATE,
    "bookingEnd" DATE,
    "stayStart" DATE,
    "stayEnd" DATE,
    "minNights" INTEGER,
    "maxNights" INTEGER,
    "channels" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Promotion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PromotionRoomType" (
    "promotionId" TEXT NOT NULL,
    "roomTypeId" TEXT NOT NULL,
    CONSTRAINT "PromotionRoomType_pkey" PRIMARY KEY ("promotionId","roomTypeId")
);

CREATE TABLE "PromotionRatePlan" (
    "promotionId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    CONSTRAINT "PromotionRatePlan_pkey" PRIMARY KEY ("promotionId","ratePlanId")
);

CREATE UNIQUE INDEX "Promotion_hotelId_code_key" ON "Promotion"("hotelId", "code");
CREATE INDEX "Promotion_hotelId_active_idx" ON "Promotion"("hotelId", "active");
CREATE INDEX "Promotion_bookingStart_bookingEnd_stayStart_stayEnd_idx" ON "Promotion"("bookingStart", "bookingEnd", "stayStart", "stayEnd");
CREATE INDEX "PromotionRoomType_roomTypeId_idx" ON "PromotionRoomType"("roomTypeId");
CREATE INDEX "PromotionRatePlan_ratePlanId_idx" ON "PromotionRatePlan"("ratePlanId");

ALTER TABLE "Promotion" ADD CONSTRAINT "Promotion_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionRoomType" ADD CONSTRAINT "PromotionRoomType_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionRoomType" ADD CONSTRAINT "PromotionRoomType_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionRatePlan" ADD CONSTRAINT "PromotionRatePlan_promotionId_fkey" FOREIGN KEY ("promotionId") REFERENCES "Promotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PromotionRatePlan" ADD CONSTRAINT "PromotionRatePlan_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

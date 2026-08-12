CREATE TABLE "HotelReview" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "description" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotelReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HotelReview_hotelId_createdAt_idx" ON "HotelReview"("hotelId", "createdAt");

ALTER TABLE "HotelReview" ADD CONSTRAINT "HotelReview_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

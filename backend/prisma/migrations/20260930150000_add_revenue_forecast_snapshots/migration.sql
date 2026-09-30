CREATE TABLE "RevenueForecastSnapshot" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "observationDate" DATE NOT NULL,
    "stayDate" DATE NOT NULL,
    "roomTypeId" TEXT,
    "sellableRooms" INTEGER NOT NULL,
    "bookedRooms" INTEGER NOT NULL,
    "heldRooms" INTEGER NOT NULL,
    "roomRevenue" DECIMAL(14,2) NOT NULL,
    "adr" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RevenueForecastSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RevenueForecastSnapshot_hotelId_observationDate_stayDate_idx" ON "RevenueForecastSnapshot"("hotelId", "observationDate", "stayDate");
CREATE INDEX "RevenueForecastSnapshot_hotelId_stayDate_roomTypeId_idx" ON "RevenueForecastSnapshot"("hotelId", "stayDate", "roomTypeId");
CREATE UNIQUE INDEX "RevenueForecastSnapshot_hotelId_observationDate_stayDate_roomTypeId_key" ON "RevenueForecastSnapshot"("hotelId", "observationDate", "stayDate", "roomTypeId");
CREATE UNIQUE INDEX "RevenueForecastSnapshot_hotel_observation_stay_aggregate_key" ON "RevenueForecastSnapshot"("hotelId", "observationDate", "stayDate") WHERE "roomTypeId" IS NULL;

ALTER TABLE "RevenueForecastSnapshot" ADD CONSTRAINT "RevenueForecastSnapshot_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RevenueForecastSnapshot" ADD CONSTRAINT "RevenueForecastSnapshot_roomTypeId_fkey" FOREIGN KEY ("roomTypeId") REFERENCES "RoomType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

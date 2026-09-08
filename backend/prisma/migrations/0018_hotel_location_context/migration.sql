CREATE TABLE "HotelLocationProfile" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'IST (UTC +5:30)',
    "bestTimeToVisit" TEXT,
    "elevation" TEXT,
    "weather" TEXT,
    "nearbyCity" TEXT,
    "accessRoad" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelLocationProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotelLocationAttraction" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distance" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelLocationAttraction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotelLocationTransport" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "distance" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelLocationTransport_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelLocationProfile_hotelId_key" ON "HotelLocationProfile"("hotelId");
CREATE INDEX "HotelLocationAttraction_hotelId_sortOrder_idx" ON "HotelLocationAttraction"("hotelId", "sortOrder");
CREATE INDEX "HotelLocationTransport_hotelId_sortOrder_idx" ON "HotelLocationTransport"("hotelId", "sortOrder");

ALTER TABLE "HotelLocationProfile" ADD CONSTRAINT "HotelLocationProfile_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelLocationAttraction" ADD CONSTRAINT "HotelLocationAttraction_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelLocationTransport" ADD CONSTRAINT "HotelLocationTransport_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "HotelBusinessDayStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "HotelBusinessDay" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "businessDate" DATE NOT NULL,
    "status" "HotelBusinessDayStatus" NOT NULL DEFAULT 'OPEN',
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "closedById" TEXT,
    "summary" JSONB,
    "exceptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelBusinessDay_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "HotelBusinessDay_hotelId_businessDate_key" ON "HotelBusinessDay"("hotelId", "businessDate");
CREATE INDEX "HotelBusinessDay_hotelId_status_businessDate_idx" ON "HotelBusinessDay"("hotelId", "status", "businessDate");

ALTER TABLE "HotelBusinessDay" ADD CONSTRAINT "HotelBusinessDay_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelBusinessDay" ADD CONSTRAINT "HotelBusinessDay_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

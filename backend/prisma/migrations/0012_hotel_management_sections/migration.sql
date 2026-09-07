CREATE TABLE "HotelPolicy" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "checkInTime" TEXT,
  "checkOutTime" TEXT,
  "childMinAge" INTEGER NOT NULL DEFAULT 0,
  "childMaxAge" INTEGER NOT NULL DEFAULT 12,
  "childPolicyType" TEXT NOT NULL DEFAULT 'FREE',
  "houseRules" TEXT,
  "noShowPolicy" TEXT,
  "amendmentPolicy" TEXT,
  "termsAndConditions" TEXT,
  "allowEarlyCheckIn" BOOLEAN NOT NULL DEFAULT false,
  "allowLateCheckOut" BOOLEAN NOT NULL DEFAULT false,
  "allowExtraBed" BOOLEAN NOT NULL DEFAULT false,
  "allowPets" BOOLEAN NOT NULL DEFAULT false,
  "allowOutsideFood" BOOLEAN NOT NULL DEFAULT false,
  "smokingAllowed" BOOLEAN NOT NULL DEFAULT false,
  "alcoholAllowed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotelPolicy_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "HotelPolicy_hotelId_key" ON "HotelPolicy"("hotelId");
ALTER TABLE "HotelPolicy" ADD CONSTRAINT "HotelPolicy_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HotelContact" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "contactType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "designation" TEXT,
  "department" TEXT,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "mobile" TEXT,
  "preferredMode" TEXT NOT NULL DEFAULT 'EMAIL',
  "primary" BOOLEAN NOT NULL DEFAULT false,
  "remarks" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotelContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HotelContact_hotelId_active_idx" ON "HotelContact"("hotelId", "active");
ALTER TABLE "HotelContact" ADD CONSTRAINT "HotelContact_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "HotelDocument" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "documentType" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "expiryDate" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HotelDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "HotelDocument_hotelId_documentType_idx" ON "HotelDocument"("hotelId", "documentType");
ALTER TABLE "HotelDocument" ADD CONSTRAINT "HotelDocument_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

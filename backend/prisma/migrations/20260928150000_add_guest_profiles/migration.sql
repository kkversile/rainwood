CREATE TYPE "GuestNoteCategory" AS ENUM ('PREFERENCE', 'SERVICE', 'COMPLAINT', 'COMPLIMENT', 'MANAGEMENT');
CREATE TYPE "GuestNoteVisibility" AS ENUM ('FRONT_OFFICE', 'SERVICE_STAFF', 'MANAGEMENT_ONLY');

CREATE TABLE "GuestProfile" (
    "id" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "mobile" TEXT,
    "email" TEXT,
    "normalizedMobile" TEXT,
    "normalizedEmail" TEXT,
    "gstin" TEXT,
    "preferredLanguage" TEXT,
    "preferredRoomTypeId" TEXT,
    "preferredHotelId" TEXT,
    "preferences" JSONB,
    "vipLevel" TEXT,
    "blacklisted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuestProfile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GuestNote" (
    "id" TEXT NOT NULL,
    "guestProfileId" TEXT NOT NULL,
    "category" "GuestNoteCategory" NOT NULL,
    "visibility" "GuestNoteVisibility" NOT NULL DEFAULT 'FRONT_OFFICE',
    "note" TEXT NOT NULL,
    "hotelId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GuestNote_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Reservation" ADD COLUMN "guestProfileId" TEXT;

CREATE INDEX "GuestProfile_normalizedMobile_idx" ON "GuestProfile"("normalizedMobile");
CREATE INDEX "GuestProfile_normalizedEmail_idx" ON "GuestProfile"("normalizedEmail");
CREATE INDEX "GuestProfile_preferredHotelId_idx" ON "GuestProfile"("preferredHotelId");
CREATE INDEX "GuestNote_guestProfileId_createdAt_idx" ON "GuestNote"("guestProfileId", "createdAt");
CREATE INDEX "GuestNote_hotelId_visibility_idx" ON "GuestNote"("hotelId", "visibility");
CREATE INDEX "Reservation_guestProfileId_createdAt_idx" ON "Reservation"("guestProfileId", "createdAt");

ALTER TABLE "GuestProfile" ADD CONSTRAINT "GuestProfile_preferredRoomTypeId_fkey" FOREIGN KEY ("preferredRoomTypeId") REFERENCES "RoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestProfile" ADD CONSTRAINT "GuestProfile_preferredHotelId_fkey" FOREIGN KEY ("preferredHotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GuestNote" ADD CONSTRAINT "GuestNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_guestProfileId_fkey" FOREIGN KEY ("guestProfileId") REFERENCES "GuestProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "UserRole" ADD VALUE 'SERVICE_STAFF';

CREATE TYPE "StaffDepartment" AS ENUM ('FOOD_BEVERAGE', 'HOUSEKEEPING', 'ROOM_SERVICE', 'FRONT_OFFICE', 'OTHER');

ALTER TABLE "User"
  ADD COLUMN "staffDepartment" "StaffDepartment",
  ADD COLUMN "jobTitle" TEXT,
  ADD COLUMN "staffHotelId" TEXT;

ALTER TABLE "User"
  ADD CONSTRAINT "User_staffHotelId_fkey"
  FOREIGN KEY ("staffHotelId") REFERENCES "Hotel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReservationFolioCharge"
  ADD COLUMN "idempotencyKey" TEXT;

CREATE UNIQUE INDEX "ReservationFolioCharge_idempotencyKey_key" ON "ReservationFolioCharge"("idempotencyKey");
CREATE INDEX "User_staffHotelId_role_idx" ON "User"("staffHotelId", "role");

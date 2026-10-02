-- Existing duplicate active profiles are intentionally not auto-resolved. The
-- migration must stop so finance can choose the correct profile explicitly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "HotelTaxProfile"
    WHERE "active" = true
    GROUP BY "hotelId"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce one active HotelTaxProfile per hotel: duplicate active profiles exist';
  END IF;
END $$;

CREATE TYPE "TaxCategory" AS ENUM ('ROOM', 'FOOD_BEVERAGE', 'LAUNDRY', 'ROOM_SERVICE', 'OTHER_SERVICE');

ALTER TABLE "HotelTaxProfile" ADD COLUMN "gstRegistered" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "TaxRule" ADD COLUMN "taxCategory" "TaxCategory" NOT NULL DEFAULT 'ROOM';

CREATE UNIQUE INDEX "HotelTaxProfile_one_active_per_hotel_key"
  ON "HotelTaxProfile" ("hotelId")
  WHERE "active" = true;

CREATE INDEX "TaxRule_category_scope_dates_idx"
  ON "TaxRule" ("hotelId", "taxCategory", "active", "effectiveFrom", "effectiveTo");

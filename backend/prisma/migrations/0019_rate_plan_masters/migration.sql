-- Add hotel-level commercial definitions while retaining every existing
-- RatePlan id as the room assignment id used by rates, bookings and channels.
CREATE TABLE "RatePlanMaster" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mealPlan" TEXT NOT NULL,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RatePlanMaster_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "RatePlan" ADD COLUMN "masterId" TEXT;

-- Refuse an unsafe merge if one hotel's normalized code has different business
-- definitions. The migration remains non-destructive and can be retried after
-- an explicit data decision.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "RatePlan" rp
    JOIN "RoomType" rt ON rt."id" = rp."roomTypeId"
    GROUP BY rt."hotelId", UPPER(TRIM(rp."code"))
    HAVING COUNT(DISTINCT (
      UPPER(TRIM(rp."name")) || '|' ||
      UPPER(TRIM(rp."mealPlan")) || '|' ||
      COALESCE(TRIM(rp."description"), '')
    )) > 1
  ) THEN
    RAISE EXCEPTION 'Conflicting legacy rate plans share a normalized hotel/code; resolve them before migration';
  END IF;
END $$;

WITH ranked AS (
  SELECT
    rp.*,
    rt."hotelId",
    UPPER(TRIM(rp."code")) AS normalized_code,
    ROW_NUMBER() OVER (
      PARTITION BY rt."hotelId", UPPER(TRIM(rp."code"))
      ORDER BY rp."id"
    ) AS row_number,
    BOOL_OR(rp."active") OVER (
      PARTITION BY rt."hotelId", UPPER(TRIM(rp."code"))
    ) AS master_active
  FROM "RatePlan" rp
  JOIN "RoomType" rt ON rt."id" = rp."roomTypeId"
)
INSERT INTO "RatePlanMaster" (
  "id", "hotelId", "code", "name", "mealPlan", "description", "active"
)
SELECT
  'rpm_' || MD5("hotelId" || '|' || normalized_code),
  "hotelId",
  normalized_code,
  TRIM("name"),
  UPPER(TRIM("mealPlan")),
  NULLIF(TRIM(COALESCE("description", '')), ''),
  master_active
FROM ranked
WHERE row_number = 1;

UPDATE "RatePlan" rp
SET
  "masterId" = rpm."id",
  "code" = rpm."code",
  "name" = rpm."name",
  "mealPlan" = rpm."mealPlan",
  "description" = rpm."description"
FROM "RoomType" rt, "RatePlanMaster" rpm
WHERE rt."id" = rp."roomTypeId"
  AND rpm."hotelId" = rt."hotelId"
  AND rpm."code" = UPPER(TRIM(rp."code"));

ALTER TABLE "RatePlan" ALTER COLUMN "masterId" SET NOT NULL;

CREATE UNIQUE INDEX "RatePlanMaster_hotelId_code_key" ON "RatePlanMaster"("hotelId", "code");
CREATE INDEX "RatePlanMaster_hotelId_active_idx" ON "RatePlanMaster"("hotelId", "active");
CREATE UNIQUE INDEX "RatePlan_roomTypeId_masterId_key" ON "RatePlan"("roomTypeId", "masterId");

ALTER TABLE "RatePlanMaster" ADD CONSTRAINT "RatePlanMaster_hotelId_fkey"
  FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_masterId_fkey"
  FOREIGN KEY ("masterId") REFERENCES "RatePlanMaster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

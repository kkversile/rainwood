UPDATE "HotelImage"
SET "isMain" = false;

WITH ranked AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "hotelId"
      ORDER BY "sortOrder", "createdAt"
    ) AS row_number
  FROM "HotelImage"
  WHERE "published" = true
    AND "url" <> '/rainwood-placeholder.svg'
)
UPDATE "HotelImage" image
SET "isMain" = true
FROM ranked
WHERE image."id" = ranked."id"
  AND ranked.row_number = 1;

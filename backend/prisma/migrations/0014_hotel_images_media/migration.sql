ALTER TABLE "Hotel" ADD COLUMN "virtualTourUrl" TEXT;

ALTER TABLE "HotelImage" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'OTHERS';
ALTER TABLE "HotelImage" ADD COLUMN "isMain" BOOLEAN NOT NULL DEFAULT false;

WITH ranked AS (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "hotelId" ORDER BY "sortOrder", "createdAt") AS row_number
  FROM "HotelImage"
)
UPDATE "HotelImage" image
SET "isMain" = true
FROM ranked
WHERE image."id" = ranked."id" AND ranked.row_number = 1;

CREATE TABLE "HotelVideo" (
  "id" TEXT NOT NULL,
  "hotelId" TEXT NOT NULL,
  "fileId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "fileName" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "size" INTEGER NOT NULL,
  "duration" TEXT,
  "thumbnailUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HotelVideo_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "HotelVideo_hotelId_createdAt_idx" ON "HotelVideo"("hotelId", "createdAt");
ALTER TABLE "HotelVideo" ADD CONSTRAINT "HotelVideo_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

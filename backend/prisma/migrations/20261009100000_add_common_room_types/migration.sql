CREATE TABLE "CommonRoomType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CommonRoomType_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommonRoomType_code_key" ON "CommonRoomType"("code");
CREATE INDEX "CommonRoomType_active_code_idx" ON "CommonRoomType"("active", "code");

ALTER TABLE "RoomType" ADD COLUMN "commonRoomTypeId" TEXT;
CREATE INDEX "RoomType_commonRoomTypeId_active_idx" ON "RoomType"("commonRoomTypeId", "active");

ALTER TABLE "RoomType" ADD CONSTRAINT "RoomType_commonRoomTypeId_fkey"
  FOREIGN KEY ("commonRoomTypeId") REFERENCES "CommonRoomType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "FeatureSetting" (
    "id" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "FeatureSetting_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "HotelFeatureOverride" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "featureKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "HotelFeatureOverride_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FeatureSetting_featureKey_key" ON "FeatureSetting"("featureKey");
CREATE UNIQUE INDEX "HotelFeatureOverride_hotelId_featureKey_key" ON "HotelFeatureOverride"("hotelId", "featureKey");
CREATE INDEX "HotelFeatureOverride_hotelId_idx" ON "HotelFeatureOverride"("hotelId");
ALTER TABLE "FeatureSetting" ADD CONSTRAINT "FeatureSetting_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "HotelFeatureOverride" ADD CONSTRAINT "HotelFeatureOverride_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "Hotel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "HotelFeatureOverride" ADD CONSTRAINT "HotelFeatureOverride_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

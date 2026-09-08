ALTER TABLE "HotelPolicy"
ADD COLUMN "cancellationRules" JSONB,
ADD COLUMN "noShowAmount" DECIMAL(12,2),
ADD COLUMN "noShowCustomText" TEXT;

ALTER TABLE "User"
  ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Existing users and agents were created before email verification was introduced.
-- Mark them verified so this change only applies to new self-registrations.
UPDATE "User"
SET "emailVerifiedAt" = CURRENT_TIMESTAMP
WHERE "emailVerifiedAt" IS NULL;

CREATE TABLE "EmailVerificationCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "codeHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailVerificationCode_userId_createdAt_idx"
  ON "EmailVerificationCode"("userId", "createdAt");

CREATE INDEX "EmailVerificationCode_expiresAt_idx"
  ON "EmailVerificationCode"("expiresAt");

ALTER TABLE "EmailVerificationCode"
  ADD CONSTRAINT "EmailVerificationCode_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

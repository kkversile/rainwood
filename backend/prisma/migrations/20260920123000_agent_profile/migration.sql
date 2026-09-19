-- AlterTable
ALTER TABLE "User" ADD COLUMN "profileImageFileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_profileImageFileId_key" ON "User"("profileImageFileId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_profileImageFileId_fkey" FOREIGN KEY ("profileImageFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

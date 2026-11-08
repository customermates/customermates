-- AlterEnum
ALTER TYPE "Resource" ADD VALUE 'publicLinks';

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "allowPublicLinks" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PublicViewLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "viewId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "lastOpenedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PublicViewLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PublicViewLink_companyId_viewId_idx" ON "PublicViewLink"("companyId", "viewId");

-- CreateIndex
CREATE INDEX "PublicViewLink_createdById_idx" ON "PublicViewLink"("createdById");

-- AddForeignKey
ALTER TABLE "PublicViewLink" ADD CONSTRAINT "PublicViewLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicViewLink" ADD CONSTRAINT "PublicViewLink_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "DataView"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicViewLink" ADD CONSTRAINT "PublicViewLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


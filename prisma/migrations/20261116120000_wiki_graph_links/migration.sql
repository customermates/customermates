-- CreateEnum
CREATE TYPE "WikiLinkTargetKind" AS ENUM ('page', 'record');

-- AlterTable
ALTER TABLE "WikiPage" ADD COLUMN     "linksSyncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "WikiPageLink" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "targetKind" "WikiLinkTargetKind" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetTypeId" TEXT,
    "pageUpdatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiPageLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiGraphLayout" (
    "companyId" TEXT NOT NULL,
    "linksHash" TEXT NOT NULL,
    "positions" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiGraphLayout_pkey" PRIMARY KEY ("companyId")
);

-- CreateIndex
CREATE INDEX "WikiPageLink_companyId_targetKind_targetId_idx" ON "WikiPageLink"("companyId", "targetKind", "targetId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiPageLink_companyId_pageId_targetKind_targetId_key" ON "WikiPageLink"("companyId", "pageId", "targetKind", "targetId");

-- AddForeignKey
ALTER TABLE "WikiPageLink" ADD CONSTRAINT "WikiPageLink_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiPageLink" ADD CONSTRAINT "WikiPageLink_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "WikiPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiGraphLayout" ADD CONSTRAINT "WikiGraphLayout_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

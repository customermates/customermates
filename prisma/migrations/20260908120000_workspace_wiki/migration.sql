ALTER TYPE "Resource" ADD VALUE 'wiki';

CREATE TABLE "WikiPage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WikiPage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WikiPage_companyId_createdAt_id_idx" ON "WikiPage"("companyId", "createdAt", "id");

ALTER TABLE "WikiPage" ADD CONSTRAINT "WikiPage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

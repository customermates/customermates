-- CreateEnum
CREATE TYPE "WikiWebsiteCrawlStatus" AS ENUM ('queued', 'discovering', 'fetching', 'importing', 'synthesizing', 'completed', 'failed', 'blocked');

-- CreateTable
CREATE TABLE "WikiWebsiteCrawl" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "homepageUrl" TEXT NOT NULL,
    "registrableDomain" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'initial',
    "status" "WikiWebsiteCrawlStatus" NOT NULL DEFAULT 'queued',
    "extraHosts" TEXT[],
    "pendingHosts" TEXT[],
    "targets" JSONB,
    "crawlDelayMs" INTEGER NOT NULL DEFAULT 0,
    "discovered" INTEGER NOT NULL DEFAULT 0,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "importedPages" INTEGER NOT NULL DEFAULT 0,
    "conversationId" TEXT,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WikiWebsiteCrawl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WikiSourceDocument" (
    "id" TEXT NOT NULL,
    "crawlId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "qaPairs" JSONB,
    "contentHash" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WikiSourceDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WikiWebsiteCrawl_clientRequestId_key" ON "WikiWebsiteCrawl"("clientRequestId");

-- CreateIndex
CREATE INDEX "WikiWebsiteCrawl_companyId_startedAt_idx" ON "WikiWebsiteCrawl"("companyId", "startedAt");

-- CreateIndex
CREATE INDEX "WikiSourceDocument_companyId_crawlId_idx" ON "WikiSourceDocument"("companyId", "crawlId");

-- CreateIndex
CREATE UNIQUE INDEX "WikiSourceDocument_crawlId_canonicalUrl_key" ON "WikiSourceDocument"("crawlId", "canonicalUrl");

-- AddForeignKey
ALTER TABLE "WikiWebsiteCrawl" ADD CONSTRAINT "WikiWebsiteCrawl_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiSourceDocument" ADD CONSTRAINT "WikiSourceDocument_crawlId_fkey" FOREIGN KEY ("crawlId") REFERENCES "WikiWebsiteCrawl"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WikiSourceDocument" ADD CONSTRAINT "WikiSourceDocument_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;


CREATE UNIQUE INDEX "WikiWebsiteCrawl_active_company_key" ON "WikiWebsiteCrawl"("companyId")
  WHERE "status" IN ('queued', 'discovering', 'fetching', 'importing', 'synthesizing');

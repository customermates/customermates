import { Prisma } from "@/generated/prisma";

export const WIKI_INDEX_CLAIM_SECONDS = 300;

const WIKI_CONTENT_HASH = Prisma.sql`encode(sha256(convert_to(p."title" || E'\\n' || p."markdown", 'UTF8')), 'hex')`;
const UNTOUCHED_IMPORT = Prisma.sql`(p."sourceImportedUpdatedAt" IS NOT NULL AND p."sourceImportedUpdatedAt" = p."updatedAt")`;

export const UNCLAIMED_WIKI_INDEX_PAGE = Prisma.sql`(p."semanticIndexClaimedAt" IS NULL
  OR p."semanticIndexClaimedAt" < CURRENT_TIMESTAMP - make_interval(secs => ${WIKI_INDEX_CLAIM_SECONDS}))`;

export function unsyncedWikiPage() {
  return Prisma.sql`NOT EXISTS (
    SELECT 1 FROM "WikiPageSection" s
    WHERE s."pageId" = p."id" AND s."companyId" = p."companyId" AND s."pageUpdatedAt" = p."updatedAt"
  )`;
}

export function unembeddedWikiPage(version: string) {
  return Prisma.sql`(${unsyncedWikiPage()} OR EXISTS (
    SELECT 1 FROM "WikiPageSection" s
    WHERE s."pageId" = p."id" AND s."companyId" = p."companyId"
      AND (s."embedding" IS NULL OR s."embeddingVersion" IS DISTINCT FROM ${version})
  ))`;
}

export function staleWikiIndexPage(version: string) {
  return Prisma.sql`(${unembeddedWikiPage(version)}
    OR (NOT ${UNTOUCHED_IMPORT} AND p."summaryContentHash" IS DISTINCT FROM ${WIKI_CONTENT_HASH}))`;
}

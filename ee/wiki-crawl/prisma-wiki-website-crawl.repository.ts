import type { WikiCrawlSynthesisResult } from "./wiki-crawl-synthesis";
import { activeWikiHomepageSetupWhere } from "@/ee/agent-chat/wiki-setup-admission";
import type { WikiCrawlTarget, WikiCrawlCategory, WikiCrawlTargetStatus } from "./website-discovery";
import type { WikiSourceQa } from "./website-source-extract";
import type {
  WikiCrawlRecord,
  WikiCrawlStatus,
  WikiSourceRecord,
  WikiWebsiteCrawlRepo,
} from "./wiki-website-crawl.service";
import type { StartWikiWebsiteCrawlRepo } from "@/features/wiki/start-wiki-homepage-setup.interactor";
import type { GetWikiWebsiteCrawlStateRepo } from "@/features/wiki/get-wiki-homepage-setup-state.interactor";

import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";

const CRAWL_SELECT = {
  id: true,
  userId: true,
  clientRequestId: true,
  homepageUrl: true,
  registrableDomain: true,
  locale: true,
  mode: true,
  status: true,
  extraHosts: true,
  pendingHosts: true,
  targets: true,
  crawlDelayMs: true,
  discovered: true,
  fetched: true,
  failed: true,
  importedPages: true,
  conversationId: true,
  failureReason: true,
  startedAt: true,
  finishedAt: true,
} as const;

const SOURCE_SELECT = {
  id: true,
  url: true,
  category: true,
  title: true,
  text: true,
  qaPairs: true,
  contentHash: true,
  fetchedAt: true,
  readAt: true,
  readOffset: true,
} as const;

type CrawlRow = Prisma.WikiWebsiteCrawlGetPayload<{
  select: typeof CRAWL_SELECT;
}>;
type SourceRow = Prisma.WikiSourceDocumentGetPayload<{
  select: typeof SOURCE_SELECT;
}>;

function crawlRecord(row: CrawlRow): WikiCrawlRecord {
  return {
    ...row,
    mode: row.mode === "refresh" || row.mode === "extend" ? row.mode : "initial",
    targets: Array.isArray(row.targets) ? (row.targets as unknown as WikiCrawlTarget[]) : null,
  };
}

function sourceRecord(row: SourceRow): WikiSourceRecord {
  return {
    ...row,
    category: row.category as WikiCrawlCategory,
    qaPairs: Array.isArray(row.qaPairs) ? (row.qaPairs as unknown as WikiSourceQa[]) : [],
  };
}

function crawlPatch({ targets, ...rest }: Partial<Omit<WikiCrawlRecord, "id" | "userId">>) {
  return {
    ...rest,
    ...(targets !== undefined
      ? {
          targets: targets === null ? Prisma.DbNull : (targets as Prisma.InputJsonValue),
        }
      : {}),
  };
}

export class PrismaWikiWebsiteCrawlRepo
  extends BaseRepository
  implements WikiWebsiteCrawlRepo, StartWikiWebsiteCrawlRepo, GetWikiWebsiteCrawlStateRepo
{
  async createCrawl(
    data: Pick<
      WikiCrawlRecord,
      "clientRequestId" | "homepageUrl" | "registrableDomain" | "locale" | "mode" | "extraHosts"
    >,
  ) {
    try {
      return await this.withCompanyTransaction(this.companyId, async () => {
        const activeSetup = await this.prisma.agentTurnRequest.findFirst({
          where: activeWikiHomepageSetupWhere(this.companyId, new Date()),
          select: { id: true },
        });
        if (activeSetup) return { status: "active" as const };
        const row = await this.prisma.wikiWebsiteCrawl.create({
          data: { ...data, companyId: this.companyId, userId: this.user.id },
          select: CRAWL_SELECT,
        });
        return { status: "created" as const, crawl: crawlRecord(row) };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
        return { status: "active" as const };
      throw error;
    }
  }

  async findCrawlByClientRequest(clientRequestId: string) {
    const row = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { clientRequestId, companyId: this.companyId },
      select: CRAWL_SELECT,
    });
    return row ? crawlRecord(row) : null;
  }

  async findLatestCrawl() {
    const row = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { companyId: this.companyId },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: CRAWL_SELECT,
    });
    return row ? crawlRecord(row) : null;
  }

  async failDispatch(id: string) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WikiWebsiteCrawl"
      SET "status" = 'failed', "failureReason" = 'dispatch', "finishedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${id} AND "companyId" = ${this.companyId}
        AND "status" = 'queued' AND "workflowRunId" IS NULL
    `);
  }

  async retryFailedDispatch(id: string) {
    try {
      return await this.withCompanyTransaction(this.companyId, async () => {
        const activeSetup = await this.prisma.agentTurnRequest.findFirst({
          where: activeWikiHomepageSetupWhere(this.companyId, new Date()),
          select: { id: true },
        });
        if (activeSetup) return null;
        await this.prisma.wikiWebsiteCrawl.updateMany({
          where: {
            id,
            companyId: this.companyId,
            status: "failed",
            failureReason: "dispatch",
          },
          data: { status: "queued", failureReason: null, finishedAt: null },
        });
        return this.getCrawl(id);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  }

  async findRefreshHomepage(registrableDomain: string) {
    const row = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { companyId: this.companyId, registrableDomain, mode: "initial" },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { homepageUrl: true },
    });
    return row?.homepageUrl ?? null;
  }

  async listRefreshTargets(): Promise<WikiCrawlTarget[]> {
    const rows = await this.prisma.wikiPage.findMany({
      where: { companyId: this.companyId, sourceUrl: { not: null } },
      distinct: ["sourceUrl"],
      orderBy: [{ sourceUrl: "asc" }],
      select: { sourceUrl: true },
    });
    return rows.flatMap(({ sourceUrl }) => (sourceUrl ? [{ url: sourceUrl, category: "help" as const }] : []));
  }

  async claimWorkflow(id: string, workflowRunId: string) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WikiWebsiteCrawl" SET "workflowRunId" = ${workflowRunId}
      WHERE "id" = ${id} AND "companyId" = ${this.companyId}
        AND ("workflowRunId" IS NULL OR "workflowRunId" = ${workflowRunId})
        AND "status" IN ('queued', 'discovering', 'fetching', 'importing', 'synthesizing')
    `);
    return count === 1;
  }

  async getCrawl(id: string) {
    const row = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { id, companyId: this.companyId },
      select: CRAWL_SELECT,
    });
    return row ? crawlRecord(row) : null;
  }

  async updateCrawl(id: string, patch: Partial<Omit<WikiCrawlRecord, "id" | "userId">>) {
    await this.prisma.wikiWebsiteCrawl.updateMany({
      where: { id, companyId: this.companyId },
      data: crawlPatch(patch),
    });
  }

  async claimCrawl(
    id: string,
    from: readonly WikiCrawlStatus[],
    patch: Partial<Omit<WikiCrawlRecord, "id" | "userId">> & {
      status: WikiCrawlStatus;
    },
  ) {
    const { count } = await this.prisma.wikiWebsiteCrawl.updateMany({
      where: { id, companyId: this.companyId, status: { in: [...from] } },
      data: crawlPatch(patch),
    });
    return count === 1;
  }

  async settleCrawl(id: string, result: WikiCrawlSynthesisResult): Promise<void> {
    await this.withCompanyTransaction(this.companyId, async () => {
      const crawl = await this.prisma.wikiWebsiteCrawl.findFirst({
        where: { id, companyId: this.companyId },
        select: { userId: true, clientRequestId: true, homepageUrl: true },
      });
      if (!crawl) return;
      const turn = await this.prisma.agentTurnRequest.findFirst({
        where: {
          companyId: this.companyId,
          userId: crawl.userId,
          clientRequestId: crawl.clientRequestId,
          wikiHomepageSetupUrl: crawl.homepageUrl,
        },
        select: { conversationId: true },
      });
      const conversationId = turn?.conversationId ?? result.conversationId;
      await this.prisma.wikiWebsiteCrawl.updateMany({
        where: {
          id,
          companyId: this.companyId,
          status: { in: ["queued", "discovering", "fetching", "importing", "synthesizing"] },
        },
        data: {
          status: conversationId ? "completed" : "failed",
          conversationId,
          failureReason: conversationId ? null : result.failureReason,
          finishedAt: new Date(),
        },
      });
    });
  }

  async updateTargetStatus(crawlId: string, url: string, status: Exclude<WikiCrawlTargetStatus, "pending">) {
    const count = await this.prisma.$executeRaw(Prisma.sql`
      WITH locked AS MATERIALIZED (
        SELECT "id", "targets"
        FROM "WikiWebsiteCrawl"
        WHERE "id" = ${crawlId} AND "companyId" = ${this.companyId} AND "status" = 'fetching'
        FOR UPDATE
      ), changed AS (
        SELECT "id", (
          SELECT jsonb_agg(
            CASE WHEN target->>'url' = ${url}
              AND target->>'status' IN ('pending', 'reading')
              AND (${status}::text = 'reading' OR target->>'status' = 'reading')
              THEN jsonb_set(target, '{status}', to_jsonb(${status}::text))
              ELSE target END ORDER BY ordinal
          ) FROM jsonb_array_elements(locked."targets") WITH ORDINALITY AS items(target, ordinal)
        ) AS targets
        FROM locked
        WHERE jsonb_typeof("targets") = 'array' AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(locked."targets") AS target
          WHERE target->>'url' = ${url}
            AND target->>'status' IN ('pending', 'reading')
            AND (${status}::text = 'reading' OR target->>'status' = 'reading')
        )
      )
      UPDATE "WikiWebsiteCrawl" AS crawl
      SET "targets" = changed.targets,
          "fetched" = (SELECT count(*)::int FROM jsonb_array_elements(changed.targets) AS target WHERE target->>'status' = 'read'),
          "failed" = (SELECT count(*)::int FROM jsonb_array_elements(changed.targets) AS target WHERE target->>'status' = 'failed'),
          "updatedAt" = now()
      FROM changed
      WHERE crawl."id" = changed."id" AND crawl."companyId" = ${this.companyId} AND crawl."status" = 'fetching'
    `);
    return count === 1;
  }

  async countSources(crawlId: string) {
    return this.prisma.wikiSourceDocument.count({
      where: { crawlId, companyId: this.companyId },
    });
  }

  async saveSource(
    crawlId: string,
    source: Omit<WikiSourceRecord, "id" | "fetchedAt" | "readAt" | "readOffset"> & {
      canonicalUrl: string;
    },
  ) {
    await this.withCompanyTransaction(this.companyId, async () => {
      const rows = await this.prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id" FROM "WikiWebsiteCrawl"
        WHERE "id" = ${crawlId} AND "companyId" = ${this.companyId} AND "status" = 'fetching'
        FOR UPDATE
      `);
      if (rows.length === 0) return;
      const existing = await this.prisma.wikiSourceDocument.findUnique({
        where: { crawlId_canonicalUrl: { crawlId, canonicalUrl: source.canonicalUrl }, companyId: this.companyId },
        select: { contentHash: true, text: true },
      });
      const changed =
        existing !== null && (existing.contentHash !== source.contentHash || existing.text !== source.text);
      const data = {
        url: source.url,
        category: source.category,
        title: source.title,
        text: source.text,
        qaPairs: source.qaPairs as unknown as Prisma.InputJsonValue,
        contentHash: source.contentHash,
        fetchedAt: new Date(),
      };
      await this.prisma.wikiSourceDocument.upsert({
        where: {
          crawlId_canonicalUrl: { crawlId, canonicalUrl: source.canonicalUrl },
          companyId: this.companyId,
        },
        create: {
          ...data,
          crawlId,
          companyId: this.companyId,
          canonicalUrl: source.canonicalUrl,
        },
        update: {
          ...data,
          companyId: this.companyId,
          ...(changed ? { readOffset: 0, readAt: null, importClaimedAt: null } : {}),
        },
      });
    });
  }

  async listSources(crawlId: string) {
    const rows = await this.prisma.wikiSourceDocument.findMany({
      where: { crawlId, companyId: this.companyId },
      orderBy: [{ fetchedAt: "asc" }, { id: "asc" }],
      select: SOURCE_SELECT,
    });
    return rows.map(sourceRecord);
  }

  async getSource(crawlId: string, id: string) {
    const row = await this.prisma.wikiSourceDocument.findFirst({
      where: { id, crawlId, companyId: this.companyId },
      select: SOURCE_SELECT,
    });
    return row ? sourceRecord(row) : null;
  }

  async advanceSourceRead(crawlId: string, id: string, offset: number, end: number) {
    const source = await this.getSource(crawlId, id);
    if (
      !source ||
      !Number.isSafeInteger(offset) ||
      !Number.isSafeInteger(end) ||
      offset < 0 ||
      end <= offset ||
      end > source.text.length ||
      offset > source.readOffset
    )
      return false;
    if (end <= source.readOffset) return true;
    if (offset !== source.readOffset) return false;
    const { count } = await this.prisma.wikiSourceDocument.updateMany({
      where: { id, crawlId, companyId: this.companyId, readOffset: offset },
      data: { readOffset: end, readAt: end === source.text.length ? new Date() : null },
    });
    if (count === 1) return true;
    const current = await this.getSource(crawlId, id);
    return current !== null && current.readOffset >= end;
  }

  async advanceSourceReads(crawlId: string, chunks: Array<{ id: string; offset: number; end: number }>) {
    await this.withCompanyTransaction(this.companyId, async () => {
      for (const chunk of chunks) {
        if (!(await this.advanceSourceRead(crawlId, chunk.id, chunk.offset, chunk.end)))
          throw new Error("Website source cursor changed; retry the read.");
      }
    });
  }

  async claimSourceImport(crawlId: string, id: string) {
    const { count } = await this.prisma.wikiSourceDocument.updateMany({
      where: { id, crawlId, companyId: this.companyId, importClaimedAt: null },
      data: { importClaimedAt: new Date() },
    });
    return count === 1;
  }

  async countImportedPages(since: Date) {
    return this.prisma.wikiPage.count({
      where: {
        companyId: this.companyId,
        sourceUrl: { not: null },
        sourceFetchedAt: { gte: since },
      },
    });
  }

  async deleteEarlierSources(crawlId: string) {
    await this.withCompanyTransaction(this.companyId, async () => {
      const now = new Date();
      const activeSetups = await this.prisma.agentTurnRequest.findMany({
        where: activeWikiHomepageSetupWhere(this.companyId, now),
        select: { wikiHomepageSetupUrl: true },
      });
      const protectedHomepages = activeSetups.flatMap(({ wikiHomepageSetupUrl }) =>
        wikiHomepageSetupUrl ? [wikiHomepageSetupUrl] : [],
      );
      await this.prisma.wikiSourceDocument.deleteMany({
        where: {
          companyId: this.companyId,
          crawlId: { not: crawlId },
          crawl: {
            companyId: this.companyId,
            startedAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1_000) },
            status: { in: ["completed", "failed", "blocked"] },
            homepageUrl: { notIn: protectedHomepages },
          },
        },
      });
    });
  }

  async findImportedPage(sourceUrl: string) {
    return this.prisma.wikiPage.findFirst({
      where: { companyId: this.companyId, sourceUrl },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: {
        id: true,
        updatedAt: true,
        sourceFetchedAt: true,
        sourceContentHash: true,
        sourceImportedUpdatedAt: true,
      },
    });
  }

  async findSetupCrawl(homepageUrl: string, clientRequestId: string) {
    return this.prisma.wikiWebsiteCrawl.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.user.id,
        homepageUrl,
        clientRequestId,
        mode: { in: ["initial", "extend"] },
        status: { in: ["synthesizing", "completed"] },
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { id: true, homepageUrl: true, pendingHosts: true, mode: true, locale: true },
    });
  }

  async countSynthesizedPages(since: Date) {
    return this.prisma.wikiPage.count({
      where: {
        companyId: this.companyId,
        createdAt: { gte: since },
        sourceUrl: null,
      },
    });
  }

  async listSynthesizedPages(since: Date, limit: number) {
    return this.prisma.wikiPage.findMany({
      where: { companyId: this.companyId, createdAt: { gte: since }, sourceUrl: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: limit,
      select: { id: true, title: true },
    });
  }

  async markImported(
    pageId: string,
    source: {
      url: string;
      fetchedAt: Date;
      contentHash: string;
      importedUpdatedAt: Date;
    },
  ) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WikiPage"
      SET "sourceUrl" = ${source.url}, "sourceFetchedAt" = ${source.fetchedAt}, "sourceContentHash" = ${source.contentHash},
        "sourceImportedUpdatedAt" = ${source.importedUpdatedAt}
      WHERE "id" = ${pageId} AND "companyId" = ${this.companyId} AND "updatedAt" = ${source.importedUpdatedAt}
    `);
  }
}

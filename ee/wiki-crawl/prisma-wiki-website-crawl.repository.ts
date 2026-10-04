import type { WikiImportPageRepo, WikiImportProvenance } from "@/features/wiki/wiki-import-page.repo";
import type { WikiCrawlTarget } from "./website-discovery";
import type { WikiCrawlTargetStatus } from "@/features/wiki/wiki-crawl-progress.schema";
import type { WikiCrawlRecord, WikiCrawlStatus, WikiSourceRecord } from "./wiki-website-crawl.service";
import type { WikiWebsiteCrawlRepo } from "@/ee/wiki-crawl/wiki-website-crawl.repo";
import type { StartWikiWebsiteCrawlRepo } from "@/features/wiki/start-wiki-website-crawl.repo";
import type { GetWikiWebsiteCrawlStateRepo } from "@/features/wiki/get-wiki-website-crawl-state.repo";
import type { WikiWebsiteCrawlCleanupRepo, WikiWebsiteCrawlCleanup } from "./wiki-website-crawl-cleanup.repo";

import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { WIKI_CRAWL_ACTIVE_STATUSES } from "./wiki-website-crawl.service";
import { parseStoredWikiCrawlTargets } from "./wiki-crawl-target.schema";
import { parseWikiCrawlMode } from "@/features/wiki/wiki-crawl-mode.schema";
import { parseStoredWikiSourceMetadata } from "./wiki-source-metadata.schema";
import { parseStoredWikiSynthesisTopics, type StoredWikiSynthesisTopic } from "./wiki-synthesis.schema";

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
  topics: true,
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
} as const;

type CrawlRow = Prisma.WikiWebsiteCrawlGetPayload<{
  select: typeof CRAWL_SELECT;
}>;
type SourceRow = Prisma.WikiSourceDocumentGetPayload<{
  select: typeof SOURCE_SELECT;
}>;

function crawlRecord(row: CrawlRow): WikiCrawlRecord {
  const targets = parseStoredWikiCrawlTargets(row.targets);
  if (["fetching", "importing", "synthesizing"].includes(row.status) && (!targets || targets.length === 0))
    throw new Error("Knowledge Base crawl progress is invalid.");

  return {
    ...row,
    mode: parseWikiCrawlMode(row.mode),
    targets,
    topics: parseStoredWikiSynthesisTopics(row.topics),
  };
}

function sourceRecord(row: SourceRow): WikiSourceRecord {
  return {
    ...row,
    ...parseStoredWikiSourceMetadata(row),
  };
}

function crawlPatch({ targets, topics, mode, ...rest }: Partial<Omit<WikiCrawlRecord, "id" | "userId">>) {
  const storedTargets = targets === undefined ? undefined : parseStoredWikiCrawlTargets(targets);
  return {
    ...rest,
    ...(topics !== undefined
      ? { topics: topics === null ? Prisma.DbNull : (parseStoredWikiSynthesisTopics(topics) as Prisma.InputJsonValue) }
      : {}),
    ...(mode !== undefined ? { mode: parseWikiCrawlMode(mode) } : {}),
    ...(targets !== undefined
      ? {
          targets: storedTargets === null ? Prisma.DbNull : (storedTargets as Prisma.InputJsonValue),
        }
      : {}),
  };
}

export class PrismaWikiWebsiteCrawlRepo
  extends BaseRepository
  implements WikiWebsiteCrawlRepo, StartWikiWebsiteCrawlRepo, GetWikiWebsiteCrawlStateRepo, WikiWebsiteCrawlCleanupRepo
{
  constructor(private readonly pages: WikiImportPageRepo) {
    super();
  }

  @BypassTenantGuard
  async failWorkflowUnscoped({ crawlId, userId, workflowRunId }: WikiWebsiteCrawlCleanup): Promise<void> {
    const crawl = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { id: crawlId, userId },
      select: { companyId: true },
    });
    if (!crawl) return;
    await this.withCompanyTransaction(crawl.companyId, async () => {
      await this.prisma.wikiWebsiteCrawl.updateMany({
        where: {
          id: crawlId,
          userId,
          companyId: crawl.companyId,
          OR: [{ workflowRunId: null }, { workflowRunId }],
          status: { in: [...WIKI_CRAWL_ACTIVE_STATUSES] },
        },
        data: { status: "failed", failureReason: "error", finishedAt: new Date() },
      });
    });
  }

  async createCrawl(
    data: Pick<
      WikiCrawlRecord,
      "clientRequestId" | "homepageUrl" | "registrableDomain" | "locale" | "mode" | "extraHosts"
    >,
  ) {
    const mode = parseWikiCrawlMode(data.mode);
    try {
      const row = await this.prisma.wikiWebsiteCrawl.create({
        data: { ...data, mode, companyId: this.companyId, userId: this.user.id },
        select: CRAWL_SELECT,
      });
      return { status: "created" as const, crawl: crawlRecord(row) };
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
    await this.prisma.wikiWebsiteCrawl.updateMany({
      where: { id, companyId: this.companyId, status: "queued", workflowRunId: null },
      data: { status: "failed", failureReason: "dispatch", finishedAt: new Date() },
    });
  }

  async retryFailedDispatch(id: string) {
    try {
      await this.prisma.wikiWebsiteCrawl.updateMany({
        where: { id, companyId: this.companyId, status: "failed", failureReason: "dispatch" },
        data: { status: "queued", failureReason: null, finishedAt: null },
      });
      return await this.getCrawl(id);
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
    return this.pages.listRefreshTargets();
  }

  async claimWorkflow(id: string, workflowRunId: string) {
    const { count } = await this.prisma.wikiWebsiteCrawl.updateMany({
      where: {
        id,
        companyId: this.companyId,
        OR: [{ workflowRunId: null }, { workflowRunId }],
        status: { in: ["queued", "discovering", "fetching", "importing", "synthesizing"] },
      },
      data: { workflowRunId },
    });
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
    source: Omit<WikiSourceRecord, "id" | "fetchedAt"> & {
      canonicalUrl: string;
    },
  ) {
    const metadata = parseStoredWikiSourceMetadata(source);
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
        category: metadata.category,
        title: source.title,
        text: source.text,
        qaPairs: metadata.qaPairs,
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
          ...(changed ? { importClaimedAt: null } : {}),
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

  async claimSourceImport(crawlId: string, id: string) {
    const { count } = await this.prisma.wikiSourceDocument.updateMany({
      where: { id, crawlId, companyId: this.companyId, importClaimedAt: null },
      data: { importClaimedAt: new Date() },
    });
    return count === 1;
  }

  async countImportedPages(since: Date) {
    return this.pages.countImportedPages(since);
  }

  async deleteEarlierSources(crawlId: string) {
    await this.prisma.wikiSourceDocument.deleteMany({
      where: {
        companyId: this.companyId,
        crawlId: { not: crawlId },
        crawl: { companyId: this.companyId, status: { in: ["completed", "failed", "blocked"] } },
      },
    });
  }

  async findImportedPage(sourceUrl: string) {
    return this.pages.findImportedPage(sourceUrl);
  }

  async listPageTitles() {
    return this.pages.listPageTitles();
  }

  async startSynthesisTopic(crawlId: string, index: number) {
    return this.updateSynthesisTopic(crawlId, index, (topic) =>
      topic.status === "pending" || topic.status === "writing" ? { ...topic, status: "writing" } : null,
    );
  }

  async settleSynthesisTopic(
    crawlId: string,
    index: number,
    outcome: Pick<StoredWikiSynthesisTopic, "status" | "pageId" | "skipReason">,
  ) {
    return this.updateSynthesisTopic(crawlId, index, (topic) =>
      topic.status === "writing" ? { ...topic, ...outcome } : null,
    );
  }

  private async updateSynthesisTopic(
    crawlId: string,
    index: number,
    update: (topic: StoredWikiSynthesisTopic) => StoredWikiSynthesisTopic | null,
  ) {
    const crawl = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { id: crawlId, companyId: this.companyId, status: "synthesizing" },
      select: { topics: true, updatedAt: true },
    });
    const topics = parseStoredWikiSynthesisTopics(crawl?.topics);
    const next = topics?.[index] ? update(topics[index]) : null;
    if (!crawl || !topics || !next) return false;
    topics[index] = next;
    const { count } = await this.prisma.wikiWebsiteCrawl.updateMany({
      where: { id: crawlId, companyId: this.companyId, updatedAt: crawl.updatedAt },
      data: { topics: topics as Prisma.InputJsonValue },
    });
    return count === 1;
  }

  async markImported(pageId: string, source: WikiImportProvenance) {
    if (!(await this.pages.markImported(pageId, source)))
      throw new Error("Knowledge Base page changed before import provenance could be recorded.");
  }
}

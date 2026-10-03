import type { WikiCrawlSynthesisResult } from "./wiki-crawl-synthesis";
import type { WikiCrawlSetupRepo } from "@/ee/agent-chat/wiki-crawl-setup.repo";
import type { WikiImportPageRepo, WikiImportProvenance } from "@/features/wiki/wiki-import-page.repo";
import type { WikiCrawlTarget } from "./website-discovery";
import type { WikiCrawlTargetStatus } from "@/features/wiki/wiki-crawl-progress.schema";
import type { WikiCrawlRecord, WikiCrawlStatus, WikiSourceRecord } from "./wiki-website-crawl.service";
import type { WikiWebsiteCrawlRepo } from "@/ee/wiki-crawl/wiki-website-crawl.repo";
import type { StartWikiWebsiteCrawlRepo } from "@/features/wiki/start-wiki-website-crawl.repo";
import type { GetWikiWebsiteCrawlStateRepo } from "@/features/wiki/get-wiki-website-crawl-state.repo";
import type { WikiCrawlAdmissionRepo, WikiHomepageSetupCrawlBinding } from "./wiki-crawl-admission.repo";
import type { WikiWebsiteCrawlCleanupRepo, WikiWebsiteCrawlCleanup } from "./wiki-website-crawl-cleanup.repo";

import { Prisma } from "@/generated/prisma";

import { BaseRepository } from "@/core/base/base-repository";
import { BypassTenantGuard } from "@/core/decorators/bypass-tenant.decorator";
import { WIKI_CRAWL_ACTIVE_STATUSES } from "./wiki-website-crawl.service";
import { parseStoredWikiCrawlTargets } from "./wiki-crawl-target.schema";
import { parseWikiCrawlMode } from "@/features/wiki/wiki-crawl-mode.schema";
import { parseStoredWikiSourceMetadata } from "./wiki-source-metadata.schema";

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
  const targets = parseStoredWikiCrawlTargets(row.targets);
  if (["fetching", "importing", "synthesizing"].includes(row.status) && (!targets || targets.length === 0))
    throw new Error("Knowledge Base crawl progress is invalid.");

  return {
    ...row,
    mode: parseWikiCrawlMode(row.mode),
    targets,
  };
}

function sourceRecord(row: SourceRow): WikiSourceRecord {
  return {
    ...row,
    ...parseStoredWikiSourceMetadata(row),
  };
}

function crawlPatch({ targets, mode, ...rest }: Partial<Omit<WikiCrawlRecord, "id" | "userId">>) {
  const storedTargets = targets === undefined ? undefined : parseStoredWikiCrawlTargets(targets);
  return {
    ...rest,
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
  implements
    WikiWebsiteCrawlRepo,
    StartWikiWebsiteCrawlRepo,
    GetWikiWebsiteCrawlStateRepo,
    WikiCrawlAdmissionRepo,
    WikiWebsiteCrawlCleanupRepo
{
  constructor(
    private readonly pages: WikiImportPageRepo,
    private readonly agentSetup: WikiCrawlSetupRepo,
  ) {
    super();
  }

  async findActiveHomepageSetupCrawl() {
    return this.prisma.wikiWebsiteCrawl.findFirst({
      where: { companyId: this.companyId, status: { in: [...WIKI_CRAWL_ACTIVE_STATUSES] } },
      select: { clientRequestId: true, homepageUrl: true, status: true },
    });
  }

  async hasBoundHomepageSetupCrawl({ userId, clientRequestId, homepageUrl }: WikiHomepageSetupCrawlBinding) {
    const crawl = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: {
        companyId: this.companyId,
        userId,
        clientRequestId,
        homepageUrl,
        status: { in: ["synthesizing", "completed"] },
      },
      select: { id: true },
    });
    return crawl !== null;
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
      return await this.withCompanyTransaction(this.companyId, async () => {
        const activeSetup = await this.agentSetup.hasActiveWikiHomepageSetup(new Date());
        if (activeSetup) return { status: "active" as const };
        const row = await this.prisma.wikiWebsiteCrawl.create({
          data: { ...data, mode, companyId: this.companyId, userId: this.user.id },
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
    await this.prisma.wikiWebsiteCrawl.updateMany({
      where: { id, companyId: this.companyId, status: "queued", workflowRunId: null },
      data: { status: "failed", failureReason: "dispatch", finishedAt: new Date() },
    });
  }

  async retryFailedDispatch(id: string) {
    try {
      return await this.withCompanyTransaction(this.companyId, async () => {
        const activeSetup = await this.agentSetup.hasActiveWikiHomepageSetup(new Date());
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

  async settleCrawl(id: string, result: WikiCrawlSynthesisResult): Promise<void> {
    await this.withCompanyTransaction(this.companyId, async () => {
      const crawl = await this.prisma.wikiWebsiteCrawl.findFirst({
        where: { id, companyId: this.companyId },
        select: { userId: true, clientRequestId: true, homepageUrl: true },
      });
      if (!crawl) return;
      const admittedConversationId = await this.agentSetup.findWikiHomepageSetupConversation({
        userId: crawl.userId,
        clientRequestId: crawl.clientRequestId,
        homepageUrl: crawl.homepageUrl,
      });
      const conversationId = admittedConversationId ?? result.conversationId;
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
    return this.pages.countImportedPages(since);
  }

  async deleteEarlierSources(crawlId: string) {
    await this.withCompanyTransaction(this.companyId, async () => {
      const now = new Date();
      const protectedHomepages = await this.agentSetup.protectedWikiHomepageSetupUrls(now);
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
    return this.pages.findImportedPage(sourceUrl);
  }

  async findSetupCrawl(homepageUrl: string, clientRequestId: string) {
    const crawl = await this.prisma.wikiWebsiteCrawl.findFirst({
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
    return crawl ? { ...crawl, mode: parseWikiCrawlMode(crawl.mode) } : null;
  }

  async countSynthesizedPages(since: Date) {
    return this.pages.countSynthesizedPages(since);
  }

  async listSynthesizedPages(since: Date, limit: number) {
    return this.pages.listSynthesizedPages(since, limit);
  }

  async markImported(pageId: string, source: WikiImportProvenance) {
    if (!(await this.pages.markImported(pageId, source)))
      throw new Error("Knowledge Base page changed before import provenance could be recorded.");
  }
}

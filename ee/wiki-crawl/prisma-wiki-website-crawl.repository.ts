import type { WikiCrawlTarget, WikiCrawlCategory } from "./website-discovery";
import type { WikiSourceQa } from "./website-source-extract";
import type { WikiCrawlRecord, WikiSourceRecord, WikiWebsiteCrawlRepo } from "./wiki-website-crawl.service";
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
} as const;

type CrawlRow = Prisma.WikiWebsiteCrawlGetPayload<{ select: typeof CRAWL_SELECT }>;
type SourceRow = Prisma.WikiSourceDocumentGetPayload<{ select: typeof SOURCE_SELECT }>;

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
      const row = await this.prisma.wikiWebsiteCrawl.create({
        data: { ...data, companyId: this.companyId, userId: this.user.id },
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

  async getCrawl(id: string) {
    const row = await this.prisma.wikiWebsiteCrawl.findFirst({
      where: { id, companyId: this.companyId },
      select: CRAWL_SELECT,
    });
    return row ? crawlRecord(row) : null;
  }

  async updateCrawl(id: string, patch: Partial<Omit<WikiCrawlRecord, "id" | "userId">>) {
    const { targets, ...rest } = patch;
    await this.prisma.wikiWebsiteCrawl.updateMany({
      where: { id, companyId: this.companyId },
      data: {
        ...rest,
        ...(targets !== undefined
          ? { targets: targets === null ? Prisma.DbNull : (targets as Prisma.InputJsonValue) }
          : {}),
      },
    });
  }

  async saveSource(crawlId: string, source: Omit<WikiSourceRecord, "id" | "fetchedAt"> & { canonicalUrl: string }) {
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
      where: { crawlId_canonicalUrl: { crawlId, canonicalUrl: source.canonicalUrl }, companyId: this.companyId },
      create: { ...data, crawlId, companyId: this.companyId, canonicalUrl: source.canonicalUrl },
      update: { ...data, companyId: this.companyId },
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

  async findImportedPage(sourceUrl: string) {
    return this.prisma.wikiPage.findFirst({
      where: { companyId: this.companyId, sourceUrl },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, updatedAt: true, sourceFetchedAt: true, sourceContentHash: true },
    });
  }

  async findSetupCrawl(homepageUrl: string) {
    return this.prisma.wikiWebsiteCrawl.findFirst({
      where: {
        companyId: this.companyId,
        userId: this.user.id,
        homepageUrl,
        mode: "initial",
        status: { in: ["synthesizing", "completed"] },
        startedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1_000) },
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: { id: true, homepageUrl: true, pendingHosts: true },
    });
  }

  async countSynthesizedPages(since: Date) {
    return this.prisma.wikiPage.count({
      where: { companyId: this.companyId, createdAt: { gte: since }, sourceUrl: null },
    });
  }

  async markImported(pageId: string, source: { url: string; fetchedAt: Date; contentHash: string }) {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "WikiPage"
      SET "sourceUrl" = ${source.url}, "sourceFetchedAt" = ${source.fetchedAt}, "sourceContentHash" = ${source.contentHash}
      WHERE "id" = ${pageId} AND "companyId" = ${this.companyId}
    `);
  }
}

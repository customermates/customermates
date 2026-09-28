import type { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import type { UpdateWikiPageInteractor } from "@/features/wiki/update-wiki-page.interactor";
import type { WikiCrawlCategory, WikiCrawlTarget } from "./website-discovery";
import type { WikiSourceQa } from "./website-source-extract";

import { UserAccessor } from "@/core/base/user-accessor";
import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";

import { discoverWikiWebsite, fetchWikiSource, WikiCrawlRobots } from "./website-crawler";
import { canonicalCrawlUrl } from "./website-discovery";

export const WIKI_CRAWL_FETCH_BATCH = 5;
const WIKI_CRAWL_MIN_DELAY_MS = 1_000;
const WIKI_IMPORT_MAX_PAGES = 30;
export const WIKI_IMPORTED_CATEGORIES: ReadonlySet<WikiCrawlCategory> = new Set(["help", "policy", "pricing"]);
const WIKI_IMPORT_PAGE_CHARACTERS = Math.floor(MAX_NOTES_LENGTH * 0.9);

export const WIKI_CRAWL_ACTIVE_STATUSES = ["queued", "discovering", "fetching", "importing", "synthesizing"] as const;
export type WikiCrawlStatus = (typeof WIKI_CRAWL_ACTIVE_STATUSES)[number] | "completed" | "failed" | "blocked";

export type WikiCrawlRecord = {
  id: string;
  userId: string;
  clientRequestId: string;
  homepageUrl: string;
  registrableDomain: string;
  locale: string;
  mode: "initial" | "refresh" | "extend";
  status: WikiCrawlStatus;
  extraHosts: string[];
  pendingHosts: string[];
  targets: WikiCrawlTarget[] | null;
  crawlDelayMs: number;
  discovered: number;
  fetched: number;
  failed: number;
  importedPages: number;
  conversationId: string | null;
  failureReason: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export type WikiSourceRecord = {
  id: string;
  url: string;
  category: WikiCrawlCategory;
  title: string;
  text: string;
  qaPairs: WikiSourceQa[];
  contentHash: string;
  fetchedAt: Date;
};

export type WikiImportedPage = {
  id: string;
  updatedAt: Date;
  sourceFetchedAt: Date | null;
  sourceContentHash: string | null;
};

export abstract class WikiWebsiteCrawlRepo {
  abstract createCrawl(
    data: Pick<
      WikiCrawlRecord,
      "clientRequestId" | "homepageUrl" | "registrableDomain" | "locale" | "mode" | "extraHosts"
    >,
  ): Promise<{ status: "created"; crawl: WikiCrawlRecord } | { status: "active" }>;
  abstract findCrawlByClientRequest(clientRequestId: string): Promise<WikiCrawlRecord | null>;
  abstract findLatestCrawl(): Promise<WikiCrawlRecord | null>;
  abstract getCrawl(id: string): Promise<WikiCrawlRecord | null>;
  abstract updateCrawl(id: string, patch: Partial<Omit<WikiCrawlRecord, "id" | "userId">>): Promise<void>;
  abstract saveSource(
    crawlId: string,
    source: Omit<WikiSourceRecord, "id" | "fetchedAt"> & { canonicalUrl: string },
  ): Promise<void>;
  abstract listSources(crawlId: string): Promise<WikiSourceRecord[]>;
  abstract getSource(crawlId: string, id: string): Promise<WikiSourceRecord | null>;
  abstract findImportedPage(sourceUrl: string): Promise<WikiImportedPage | null>;
  abstract markImported(pageId: string, source: { url: string; fetchedAt: Date; contentHash: string }): Promise<void>;
  abstract countSynthesizedPages(since: Date): Promise<number>;
}

export type WikiCrawlSynthesisStarter = (crawl: WikiCrawlRecord) => Promise<string | null>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fetchDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function wikiImportedMarkdown(source: WikiSourceRecord): string[] {
  const footer = `\n\nSource: ${source.url} · fetched ${fetchDate(source.fetchedAt)}`;
  const faqMissing = source.qaPairs.filter(({ question }) => !source.text.includes(question));
  const faq =
    faqMissing.length > 0
      ? `\n\n## Frequently asked questions\n\n${faqMissing.map(({ question, answer }) => `### ${question}\n\n${answer}`).join("\n\n")}`
      : "";
  const body = `${source.text.replace(/^# .+\n+/u, "")}${faq}`.trim();
  const parts: string[] = [];
  let rest = body;
  while (rest.length > 0) {
    let end = Math.min(rest.length, WIKI_IMPORT_PAGE_CHARACTERS - footer.length);
    if (end < rest.length) {
      const heading = rest.lastIndexOf("\n## ", end);
      const paragraph = rest.lastIndexOf("\n\n", end);
      end = heading > end / 2 ? heading : paragraph > end / 2 ? paragraph : end;
    }
    parts.push(`${rest.slice(0, end).trim()}${footer}`);
    rest = rest.slice(end).trim();
  }
  return parts.length > 0 ? parts : [footer.trim()];
}

function wikiImportedTitle(source: WikiSourceRecord, part: number, parts: number) {
  const base = (source.title || new URL(source.url).pathname.split("/").filter(Boolean).at(-1) || source.url).slice(
    0,
    100,
  );
  return parts > 1 ? `${base} (${part + 1}/${parts})` : base;
}

export class WikiWebsiteCrawlService extends UserAccessor {
  constructor(
    private repo: WikiWebsiteCrawlRepo,
    private createPages: Pick<CreateWikiPagesInteractor, "invoke">,
    private updatePage: Pick<UpdateWikiPageInteractor, "invoke">,
    private startSynthesis: WikiCrawlSynthesisStarter,
  ) {
    super();
  }

  private scope(crawl: WikiCrawlRecord) {
    return { registrableDomain: crawl.registrableDomain, extraHosts: crawl.extraHosts };
  }

  private async load(crawlId: string) {
    const crawl = await this.repo.getCrawl(crawlId);
    if (!crawl) throw new Error("Wiki website crawl not found.");
    return crawl;
  }

  async discover(crawlId: string): Promise<number> {
    const crawl = await this.load(crawlId);
    await this.repo.updateCrawl(crawlId, { status: "discovering" });
    const discovery = await discoverWikiWebsite({
      homepage: crawl.homepageUrl,
      locale: crawl.locale,
      scope: this.scope(crawl),
    });
    if (discovery.status !== "ready") {
      await this.repo.updateCrawl(crawlId, {
        status: discovery.status === "blocked" ? "blocked" : "failed",
        failureReason: discovery.status,
        finishedAt: new Date(),
      });
      return 0;
    }
    const targets =
      crawl.mode === "extend"
        ? discovery.targets.filter(({ url }) => crawl.extraHosts.includes(new URL(url).hostname))
        : discovery.targets;
    await this.repo.updateCrawl(crawlId, {
      status: "fetching",
      targets,
      pendingHosts: discovery.pendingHosts.filter((host) => !crawl.extraHosts.includes(host)),
      crawlDelayMs: discovery.crawlDelayMs,
      discovered: targets.length,
    });
    return Math.ceil(targets.length / WIKI_CRAWL_FETCH_BATCH);
  }

  async fetchBatch(crawlId: string, batch: number): Promise<void> {
    const crawl = await this.load(crawlId);
    const targets = (crawl.targets ?? []).slice(batch * WIKI_CRAWL_FETCH_BATCH, (batch + 1) * WIKI_CRAWL_FETCH_BATCH);
    const robots = new WikiCrawlRobots(this.scope(crawl));
    let fetched = 0;
    let failed = 0;
    for (const [index, target] of targets.entries()) {
      if (index > 0) await sleep(Math.max(WIKI_CRAWL_MIN_DELAY_MS, crawl.crawlDelayMs));
      const source = await fetchWikiSource(target.url, this.scope(crawl), robots);
      const canonicalUrl = source ? canonicalCrawlUrl(source.url) : null;
      if (!source || !canonicalUrl) {
        failed += 1;
        continue;
      }
      await this.repo.saveSource(crawlId, { ...source, canonicalUrl, category: target.category });
      fetched += 1;
    }
    const current = await this.load(crawlId);
    await this.repo.updateCrawl(crawlId, { fetched: current.fetched + fetched, failed: current.failed + failed });
  }

  async importSources(crawlId: string): Promise<void> {
    const crawl = await this.load(crawlId);
    await this.repo.updateCrawl(crawlId, { status: "importing" });
    const sources = (await this.repo.listSources(crawlId)).filter(({ category }) =>
      WIKI_IMPORTED_CATEGORIES.has(category),
    );
    let imported = 0;
    for (const source of sources) {
      if (imported >= WIKI_IMPORT_MAX_PAGES) break;
      const existing = await this.repo.findImportedPage(source.url);
      const parts = wikiImportedMarkdown(source);
      if (existing) {
        const untouched =
          existing.sourceFetchedAt !== null &&
          existing.updatedAt.getTime() <= existing.sourceFetchedAt.getTime() + 1_000;
        if (!untouched || existing.sourceContentHash === source.contentHash || parts.length !== 1) continue;
        const updated = await this.updatePage.invoke({
          id: existing.id,
          expectedUpdatedAt: existing.updatedAt,
          markdown: parts[0],
        });
        if (updated.ok) {
          await this.repo.markImported(updated.data.id, {
            url: source.url,
            fetchedAt: new Date(updated.data.updatedAt.getTime() + 1),
            contentHash: source.contentHash,
          });
          imported += 1;
        }
        continue;
      }
      if (crawl.mode === "refresh") continue;
      const created = await this.createPages.invoke({
        pages: parts.slice(0, WIKI_IMPORT_MAX_PAGES - imported).map((markdown, part) => ({
          title: wikiImportedTitle(source, part, parts.length),
          markdown,
        })),
        requireEmpty: false,
      });
      if (!created.ok) continue;
      for (const page of created.data) {
        await this.repo.markImported(page.id, {
          url: source.url,
          fetchedAt: new Date(page.updatedAt.getTime() + 1),
          contentHash: source.contentHash,
        });
      }
      imported += created.data.length;
    }
    await this.repo.updateCrawl(crawlId, { importedPages: crawl.importedPages + imported });
  }

  async fail(crawlId: string): Promise<void> {
    await this.repo.updateCrawl(crawlId, { status: "failed", failureReason: "error", finishedAt: new Date() });
  }

  async finish(crawlId: string): Promise<void> {
    const crawl = await this.load(crawlId);
    if (crawl.mode !== "initial") {
      await this.repo.updateCrawl(crawlId, { status: "completed", finishedAt: new Date() });
      return;
    }
    await this.repo.updateCrawl(crawlId, { status: "synthesizing" });
    const conversationId = await this.startSynthesis(crawl);
    await this.repo.updateCrawl(crawlId, {
      status: conversationId ? "completed" : "failed",
      conversationId,
      failureReason: conversationId ? null : "synthesisNotStarted",
      finishedAt: new Date(),
    });
  }
}

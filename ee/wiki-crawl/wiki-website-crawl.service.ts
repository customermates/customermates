import type { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import type { UpdateWikiPageInteractor } from "@/features/wiki/update-wiki-page.interactor";
import type { WikiCrawlCategory, WikiCrawlTarget } from "./website-discovery";
import type { WikiSourceQa } from "./website-source-extract";

import { UserAccessor } from "@/core/base/user-accessor";
import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

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
  readAt: Date | null;
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
  abstract claimCrawl(
    id: string,
    from: readonly WikiCrawlStatus[],
    patch: Partial<Omit<WikiCrawlRecord, "id" | "userId">> & { status: WikiCrawlStatus },
  ): Promise<boolean>;
  abstract countSources(crawlId: string): Promise<number>;
  abstract saveSource(
    crawlId: string,
    source: Omit<WikiSourceRecord, "id" | "fetchedAt" | "readAt"> & { canonicalUrl: string },
  ): Promise<void>;
  abstract listSources(crawlId: string): Promise<WikiSourceRecord[]>;
  abstract getSource(crawlId: string, id: string): Promise<WikiSourceRecord | null>;
  abstract markSourceRead(crawlId: string, id: string): Promise<void>;
  abstract claimSourceImport(crawlId: string, id: string): Promise<boolean>;
  abstract countImportedPages(since: Date): Promise<number>;
  abstract deleteEarlierSources(crawlId: string): Promise<void>;
  abstract findImportedPage(sourceUrl: string): Promise<WikiImportedPage | null>;
  abstract markImported(pageId: string, source: { url: string; fetchedAt: Date; contentHash: string }): Promise<void>;
  abstract countSynthesizedPages(since: Date): Promise<number>;
}

export type WikiCrawlSynthesisStarter = (crawl: WikiCrawlRecord) => Promise<string | null>;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function fetchDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export type WikiImportCopy = {
  source: (values: { url: string; date: string }) => string;
  faqHeading: string;
};

export async function wikiImportCopy(locale: string): Promise<WikiImportCopy> {
  const appLocale = appLocaleOrDefault(locale);
  const t = await getTranslator(appLocale, "Wiki.websiteImport");
  return { source: (values) => t("source", values), faqHeading: t("faqHeading") };
}

export function wikiImportedMarkdown(source: WikiSourceRecord, copy: WikiImportCopy): string[] {
  const footer = `\n\n${copy.source({ url: source.url, date: fetchDate(source.fetchedAt) })}`;
  const faqMissing = source.qaPairs.filter(({ question }) => !source.text.includes(question));
  const faq =
    faqMissing.length > 0
      ? `\n\n## ${copy.faqHeading}\n\n${faqMissing.map(({ question, answer }) => `### ${question}\n\n${answer}`).join("\n\n")}`
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
    if (crawl.status !== "queued" && crawl.status !== "discovering") return this.batchCount(crawl);
    await this.repo.claimCrawl(crawlId, ["queued"], { status: "discovering" });
    const discovery = await discoverWikiWebsite({
      homepage: crawl.homepageUrl,
      locale: crawl.locale,
      scope: this.scope(crawl),
    });
    if (discovery.status !== "ready") {
      await this.repo.claimCrawl(crawlId, ["queued", "discovering"], {
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
    const claimed = await this.repo.claimCrawl(crawlId, ["discovering"], {
      status: "fetching",
      targets,
      pendingHosts: discovery.pendingHosts.filter((host) => !crawl.extraHosts.includes(host)),
      crawlDelayMs: discovery.crawlDelayMs,
      discovered: targets.length,
    });
    return claimed ? Math.ceil(targets.length / WIKI_CRAWL_FETCH_BATCH) : this.batchCount(await this.load(crawlId));
  }

  private batchCount(crawl: WikiCrawlRecord) {
    return Math.ceil((crawl.targets?.length ?? 0) / WIKI_CRAWL_FETCH_BATCH);
  }

  async fetchBatch(crawlId: string, batch: number): Promise<void> {
    const crawl = await this.load(crawlId);
    if (crawl.status !== "fetching") return;
    const targets = (crawl.targets ?? []).slice(batch * WIKI_CRAWL_FETCH_BATCH, (batch + 1) * WIKI_CRAWL_FETCH_BATCH);
    const robots = new WikiCrawlRobots(this.scope(crawl));
    for (const [index, target] of targets.entries()) {
      if (index > 0) await sleep(Math.max(WIKI_CRAWL_MIN_DELAY_MS, crawl.crawlDelayMs));
      const source = await fetchWikiSource(target.url, this.scope(crawl), robots);
      const canonicalUrl = source ? canonicalCrawlUrl(source.url) : null;
      if (source && canonicalUrl)
        await this.repo.saveSource(crawlId, { ...source, canonicalUrl, category: target.category });
    }
    const stored = await this.repo.countSources(crawlId);
    const attempted = Math.min(crawl.discovered, (batch + 1) * WIKI_CRAWL_FETCH_BATCH);
    await this.repo.updateCrawl(crawlId, { fetched: stored, failed: Math.max(0, attempted - stored) });
  }

  async importSources(crawlId: string): Promise<void> {
    await this.repo.claimCrawl(crawlId, ["fetching"], { status: "importing" });
    const crawl = await this.load(crawlId);
    if (crawl.status !== "importing") return;
    const sources = (await this.repo.listSources(crawlId)).filter(({ category }) =>
      WIKI_IMPORTED_CATEGORIES.has(category),
    );
    const seen = new Set<string>();
    const copy = await wikiImportCopy(crawl.locale);
    let imported = await this.repo.countImportedPages(crawl.startedAt);
    for (const source of sources) {
      if (imported >= WIKI_IMPORT_MAX_PAGES) break;
      const duplicateKeys = [`hash:${source.contentHash}`, `title:${source.title.trim().toLocaleLowerCase()}`];
      if (duplicateKeys.some((key) => seen.has(key))) continue;
      for (const key of duplicateKeys) seen.add(key);
      if (!(await this.repo.claimSourceImport(crawlId, source.id))) continue;
      const existing = await this.repo.findImportedPage(source.url);
      const parts = wikiImportedMarkdown(source, copy);
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
    await this.repo.updateCrawl(crawlId, { importedPages: await this.repo.countImportedPages(crawl.startedAt) });
  }

  async fail(crawlId: string): Promise<void> {
    await this.repo.claimCrawl(crawlId, WIKI_CRAWL_ACTIVE_STATUSES, {
      status: "failed",
      failureReason: "error",
      finishedAt: new Date(),
    });
  }

  async finish(crawlId: string): Promise<void> {
    const crawl = await this.load(crawlId);
    await this.repo.deleteEarlierSources(crawlId);
    if (crawl.mode !== "initial") {
      await this.repo.claimCrawl(crawlId, ["importing"], { status: "completed", finishedAt: new Date() });
      return;
    }
    if (!(await this.repo.claimCrawl(crawlId, ["importing"], { status: "synthesizing" }))) return;
    const conversationId = await this.startSynthesis(crawl);
    await this.repo.updateCrawl(crawlId, {
      status: conversationId ? "completed" : "failed",
      conversationId,
      failureReason: conversationId ? null : "synthesisNotStarted",
      finishedAt: new Date(),
    });
  }
}

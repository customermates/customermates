import type { WikiWebsiteCrawlRepo } from "./wiki-website-crawl.repo";
import { wikiSourceLanguageMatches } from "@/features/wiki/wiki-language";
import type { CreateWikiPagesInteractor } from "@/features/wiki/create-wiki-pages.interactor";
import type { UpdateWikiPageInteractor } from "@/features/wiki/update-wiki-page.interactor";
import type { WikiCrawlCategory } from "./website-discovery";
import type { StoredWikiCrawlTarget } from "./wiki-crawl-target.schema";
import type { WikiCrawlSynthesisResult } from "./wiki-crawl-synthesis";
import type { WikiSourceQa } from "./website-source-extract";
import type { WikiWebsiteCrawlMode } from "@/features/wiki/wiki-crawl-mode.schema";

import { UserAccessor } from "@/core/base/user-accessor";
import { runInTransaction } from "@/core/decorators/transaction-runner";
import { MAX_NOTES_LENGTH } from "@/core/validation/validate-notes";
import { getTranslator } from "@/i18n/get-translator";
import { appLocaleOrDefault } from "@/i18n/locale-registry";

import type { WikiWebsiteNetwork } from "./wiki-website-network";
import { wikiWebsiteNetwork } from "./wiki-website-network";
import { canonicalCrawlUrl } from "./website-discovery";
import { parseStoredWikiCrawlTargets } from "./wiki-crawl-target.schema";

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
  mode: WikiWebsiteCrawlMode;
  status: WikiCrawlStatus;
  extraHosts: string[];
  pendingHosts: string[];
  targets: StoredWikiCrawlTarget[] | null;
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
  readOffset: number;
};

export type WikiImportedPage = {
  id: string;
  updatedAt: Date;
  sourceFetchedAt: Date | null;
  sourceContentHash: string | null;
  sourceImportedUpdatedAt: Date | null;
};

export type WikiCrawlSynthesisStarter = (crawl: WikiCrawlRecord) => Promise<WikiCrawlSynthesisResult>;

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
  return {
    source: (values) => t("source", values),
    faqHeading: t("faqHeading"),
  };
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
    private network: WikiWebsiteNetwork = wikiWebsiteNetwork(),
  ) {
    super();
  }

  private scope(crawl: WikiCrawlRecord) {
    return {
      registrableDomain: crawl.registrableDomain,
      extraHosts: crawl.extraHosts,
    };
  }

  private async load(crawlId: string) {
    const crawl = await this.repo.getCrawl(crawlId);
    if (!crawl) throw new Error("Knowledge Base website crawl not found.");
    return crawl;
  }

  async claimWorkflow(crawlId: string, workflowRunId: string): Promise<boolean> {
    return this.repo.claimWorkflow(crawlId, workflowRunId);
  }

  async discover(crawlId: string): Promise<number> {
    const crawl = await this.load(crawlId);
    if (crawl.status !== "queued" && crawl.status !== "discovering") return this.batchCount(crawl);
    await this.repo.claimCrawl(crawlId, ["queued"], { status: "discovering" });
    if (crawl.mode === "refresh") {
      const targets = await this.repo.listRefreshTargets();
      await this.repo.claimCrawl(crawlId, ["discovering"], {
        status: targets.length > 0 ? "fetching" : "completed",
        targets: targets.map((target) => ({ ...target, status: "pending" })),
        discovered: targets.length,
        ...(targets.length === 0 ? { finishedAt: new Date() } : {}),
      });
      return this.batchCount(await this.load(crawlId));
    }
    const discovery = await this.network.discover({
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
      status: targets.length > 0 ? "fetching" : "completed",
      targets: targets.map((target) => ({ ...target, status: "pending" })),
      pendingHosts: discovery.pendingHosts.filter((host) => !crawl.extraHosts.includes(host)),
      crawlDelayMs: discovery.crawlDelayMs,
      discovered: targets.length,
      ...(targets.length === 0 ? { finishedAt: new Date() } : {}),
    });
    return claimed ? Math.ceil(targets.length / WIKI_CRAWL_FETCH_BATCH) : this.batchCount(await this.load(crawlId));
  }

  private batchCount(crawl: WikiCrawlRecord) {
    return Math.ceil((crawl.targets?.length ?? 0) / WIKI_CRAWL_FETCH_BATCH);
  }

  async fetchBatch(crawlId: string, batch: number): Promise<void> {
    const crawl = await this.load(crawlId);
    if (crawl.status !== "fetching") return;
    const storedTargets = parseStoredWikiCrawlTargets(crawl.targets);
    if (!storedTargets || storedTargets.length === 0) throw new Error("Knowledge Base crawl progress is invalid.");
    const targets = storedTargets.slice(batch * WIKI_CRAWL_FETCH_BATCH, (batch + 1) * WIKI_CRAWL_FETCH_BATCH);
    const robots = this.network.robots(this.scope(crawl));
    const rules = await Promise.allSettled(targets.map((target) => robots.forUrl(target.url)));
    const delay = Math.max(
      WIKI_CRAWL_MIN_DELAY_MS,
      crawl.crawlDelayMs,
      ...rules.flatMap((rule) => (rule.status === "fulfilled" ? [rule.value.crawlDelayMs] : [])),
    );
    const failures: unknown[] = [];
    const fetching: Promise<void>[] = [];
    let lastStartedAt = batch > 0 ? Date.now() : null;
    try {
      for (const target of targets) {
        if (target.status === "read" || target.status === "failed") continue;
        if (!(await this.repo.updateTargetStatus(crawlId, target.url, "reading"))) continue;
        if (lastStartedAt !== null) await sleep(Math.max(0, delay - (Date.now() - lastStartedAt)));
        lastStartedAt = Date.now();
        fetching.push(
          (async () => {
            let source;
            try {
              source = await this.network.fetchSource(target.url, this.scope(crawl), robots);
            } catch {
              await this.repo.updateTargetStatus(crawlId, target.url, "failed");
              return;
            }
            const canonicalUrl = source ? canonicalCrawlUrl(source.url) : null;
            if (source && canonicalUrl) {
              await this.repo.saveSource(crawlId, {
                ...source,
                canonicalUrl,
                category: target.category,
              });
              await this.repo.updateTargetStatus(crawlId, target.url, "read");
            } else await this.repo.updateTargetStatus(crawlId, target.url, "failed");
          })().catch((error) => {
            failures.push(error);
          }),
        );
      }
    } catch (error) {
      failures.push(error);
    }
    await Promise.all(fetching);
    if (failures.length) throw failures[0];
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
    for (const source of sources) {
      if (!wikiSourceLanguageMatches(source, appLocaleOrDefault(crawl.locale))) continue;
      const duplicateKeys = [`hash:${source.contentHash}`, `title:${source.title.trim().toLocaleLowerCase()}`];
      if (crawl.mode !== "refresh" && duplicateKeys.some((key) => seen.has(key))) continue;
      for (const key of duplicateKeys) seen.add(key);
      const parts = wikiImportedMarkdown(source, copy);
      const result = await runInTransaction(async () => {
        const imported = await this.repo.countImportedPages(crawl.startedAt);
        if (crawl.mode !== "refresh" && imported >= WIKI_IMPORT_MAX_PAGES) return "full";
        if (!(await this.repo.claimSourceImport(crawlId, source.id))) return;
        const existing = await this.repo.findImportedPage(source.url);
        if (existing) {
          const untouched =
            existing.sourceImportedUpdatedAt !== null &&
            existing.updatedAt.getTime() === existing.sourceImportedUpdatedAt.getTime();
          if (!untouched || existing.sourceContentHash === source.contentHash || parts.length !== 1) return;
          const updated = await this.updatePage.invoke({
            id: existing.id,
            expectedUpdatedAt: existing.updatedAt,
            markdown: parts[0],
          });
          if (!updated.ok) return updated;
          await this.repo.markImported(updated.data.id, {
            url: source.url,
            fetchedAt: source.fetchedAt,
            importedUpdatedAt: updated.data.updatedAt,
            contentHash: source.contentHash,
          });
          return;
        }
        if (crawl.mode === "refresh") return;
        const created = await this.createPages.invoke({
          pages: parts.slice(0, WIKI_IMPORT_MAX_PAGES - imported).map((markdown, part) => ({
            title: wikiImportedTitle(source, part, parts.length),
            markdown,
          })),
          requireEmpty: false,
        });
        if (!created.ok) return created;
        for (const page of created.data) {
          await this.repo.markImported(page.id, {
            url: source.url,
            fetchedAt: source.fetchedAt,
            importedUpdatedAt: page.updatedAt,
            contentHash: source.contentHash,
          });
        }
      });
      if (result === "full") break;
    }
    await this.repo.updateCrawl(crawlId, {
      importedPages: await this.repo.countImportedPages(crawl.startedAt),
    });
  }

  async fail(crawlId: string): Promise<void> {
    await this.repo.settleCrawl(crawlId, { conversationId: null, failureReason: "error" });
  }

  async finish(crawlId: string): Promise<void> {
    const crawl = await this.load(crawlId);
    await this.repo.deleteEarlierSources(crawlId);
    if (crawl.mode === "refresh") {
      const unavailable = crawl.discovered > 0 && crawl.fetched === 0;
      await this.repo.claimCrawl(crawlId, ["importing"], {
        status: unavailable ? "failed" : "completed",
        failureReason: unavailable ? "unavailable" : null,
        finishedAt: new Date(),
      });
      return;
    }
    if ((await this.repo.countSources(crawlId)) === 0) {
      await this.repo.claimCrawl(crawlId, ["importing"], {
        status: "failed",
        failureReason: "unavailable",
        finishedAt: new Date(),
      });
      return;
    }
    if (
      crawl.status !== "synthesizing" &&
      !(await this.repo.claimCrawl(crawlId, ["importing"], {
        status: "synthesizing",
      }))
    )
      return;
    const result = await this.startSynthesis(crawl);
    const { failureReason } = result;
    if (
      failureReason === "synthesisAdmission:agentTurnAlreadyRunning" ||
      failureReason === "synthesisDisposition:atCapacity"
    )
      throw new Error("Wiki synthesis admission is still busy.");
    await this.repo.settleCrawl(crawlId, result);
  }
}

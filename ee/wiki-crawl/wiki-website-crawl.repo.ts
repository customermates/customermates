import type { WikiCrawlTarget } from "./website-discovery";
import type { WikiCrawlTargetStatus } from "@/features/wiki/wiki-crawl-progress.schema";
import type { StoredWikiSynthesisTopic } from "./wiki-synthesis.schema";
import type {
  WikiCrawlStatus,
  WikiCrawlRecord,
  WikiSourceRecord,
  WikiImportedPage,
} from "./wiki-website-crawl.service";

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
  abstract claimWorkflow(id: string, workflowRunId: string): Promise<boolean>;
  abstract listRefreshTargets(): Promise<WikiCrawlTarget[]>;
  abstract updateCrawl(id: string, patch: Partial<Omit<WikiCrawlRecord, "id" | "userId">>): Promise<void>;
  abstract claimCrawl(
    id: string,
    from: readonly WikiCrawlStatus[],
    patch: Partial<Omit<WikiCrawlRecord, "id" | "userId">> & {
      status: WikiCrawlStatus;
    },
  ): Promise<boolean>;
  abstract updateTargetStatus(
    crawlId: string,
    url: string,
    status: Exclude<WikiCrawlTargetStatus, "pending">,
  ): Promise<boolean>;
  abstract countSources(crawlId: string): Promise<number>;
  abstract saveSource(
    crawlId: string,
    source: Omit<WikiSourceRecord, "id" | "fetchedAt"> & {
      canonicalUrl: string;
    },
  ): Promise<void>;
  abstract listSources(crawlId: string): Promise<WikiSourceRecord[]>;
  abstract claimSourceImport(crawlId: string, id: string): Promise<boolean>;
  abstract countImportedPages(since: Date): Promise<number>;
  abstract deleteEarlierSources(crawlId: string): Promise<void>;
  abstract findImportedPage(sourceUrl: string): Promise<WikiImportedPage | null>;
  abstract listPageTitles(): Promise<string[]>;
  abstract claimSynthesisTopic(crawlId: string, index: number, staleBefore: Date): Promise<boolean>;
  abstract settleSynthesisTopic(
    crawlId: string,
    index: number,
    outcome: Pick<StoredWikiSynthesisTopic, "status" | "pageId" | "skipReason">,
  ): Promise<boolean>;
  abstract markImported(
    pageId: string,
    source: {
      url: string;
      fetchedAt: Date;
      contentHash: string;
      importedUpdatedAt: Date;
    },
  ): Promise<void>;
}

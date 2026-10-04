import type { WikiWebsiteCrawlStart } from "./start-wiki-homepage-setup.interactor";
import type { WikiWebsiteCrawlMode } from "./wiki-crawl-mode.schema";

export abstract class StartWikiWebsiteCrawlRepo {
  abstract findCrawlByClientRequest(clientRequestId: string): Promise<WikiWebsiteCrawlStart | null>;
  abstract findLatestCrawl(): Promise<WikiWebsiteCrawlStart | null>;
  abstract findRefreshHomepage(registrableDomain: string): Promise<string | null>;
  abstract failDispatch(id: string): Promise<void>;
  abstract retryFailedDispatch(id: string): Promise<WikiWebsiteCrawlStart | null>;
  abstract createCrawl(data: {
    clientRequestId: string;
    homepageUrl: string;
    registrableDomain: string;
    locale: string;
    mode: WikiWebsiteCrawlMode;
    extraHosts: string[];
  }): Promise<{ status: "created"; crawl: WikiWebsiteCrawlStart } | { status: "active" }>;
}

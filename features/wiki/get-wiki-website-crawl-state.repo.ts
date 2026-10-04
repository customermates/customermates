import type { WikiWebsiteCrawlState } from "./get-wiki-homepage-setup-state.interactor";

export abstract class GetWikiWebsiteCrawlStateRepo {
  abstract findLatestCrawl(): Promise<WikiWebsiteCrawlState | null>;
}

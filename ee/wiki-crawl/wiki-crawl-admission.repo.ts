import type { WikiCrawlStatus } from "./wiki-website-crawl.service";

export type WikiHomepageSetupCrawl = {
  clientRequestId: string;
  homepageUrl: string;
  status: WikiCrawlStatus;
};

export type WikiHomepageSetupCrawlBinding = {
  userId: string;
  clientRequestId: string;
  homepageUrl: string;
};

export abstract class WikiCrawlAdmissionRepo {
  abstract findActiveHomepageSetupCrawl(): Promise<WikiHomepageSetupCrawl | null>;
  abstract hasBoundHomepageSetupCrawl(binding: WikiHomepageSetupCrawlBinding): Promise<boolean>;
}

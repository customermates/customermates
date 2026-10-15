export abstract class WikiWebsiteCrawlControlRepo {
  abstract stopCrawl(crawlId: string): Promise<void>;
  abstract setCrawlLocale(crawlId: string, locale: string): Promise<void>;
  abstract reopenSynthesis(crawlId: string): Promise<boolean>;
}

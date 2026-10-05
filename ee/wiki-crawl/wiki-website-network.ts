import type { WikiCrawlScope } from "./website-crawl-scope";

import { discoverWikiWebsite, fetchWikiSource } from "./website-crawler";
import { WikiCrawlRobots } from "./wiki-crawl-robots";

export type WikiWebsiteNetwork = {
  discover: typeof discoverWikiWebsite;
  fetchSource: typeof fetchWikiSource;
  robots: (scope: WikiCrawlScope) => WikiCrawlRobots;
};

export function wikiWebsiteNetwork(): WikiWebsiteNetwork {
  return {
    discover: discoverWikiWebsite,
    fetchSource: fetchWikiSource,
    robots: (scope) => new WikiCrawlRobots(scope),
  };
}

import type { WikiCrawlScope } from "./website-crawl-scope";
import type { RobotsRules } from "./website-discovery";

import { isWikiCrawlTargetInScope } from "./website-crawl-scope";
import { robotsFromFetch, robotsPathOf, WIKI_CRAWL_USER_AGENT } from "./website-discovery";
import { fetchWebsiteResource } from "./website-fetch";

export class WikiCrawlRobots {
  private rules = new Map<string, Promise<RobotsRules>>();

  constructor(private scope: WikiCrawlScope) {}

  forUrl(url: string): Promise<RobotsRules> {
    const origin = new URL(url).origin;
    let rules = this.rules.get(origin);
    if (!rules) {
      rules = fetchWebsiteResource({
        url: `${origin}/robots.txt`,
        allows: (target) => isWikiCrawlTargetInScope(this.scope, target),
        accept: ["text/plain", "text/markdown"],
        userAgent: WIKI_CRAWL_USER_AGENT,
        truncateOversized: true,
      }).then(robotsFromFetch);
      this.rules.set(origin, rules);
    }
    return rules;
  }

  async allows(url: string): Promise<boolean> {
    return (await this.forUrl(url)).allows(robotsPathOf(url));
  }
}

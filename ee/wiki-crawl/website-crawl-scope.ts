import type { WebsiteResourceTarget } from "./website-fetch";

export type WikiCrawlScope = { registrableDomain: string; extraHosts: string[] };

export function isWikiCrawlTargetInScope(scope: WikiCrawlScope, target: WebsiteResourceTarget): boolean {
  return target.registrableDomain === scope.registrableDomain || scope.extraHosts.includes(target.host);
}

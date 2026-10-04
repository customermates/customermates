import type { RobotsRules } from "./website-discovery";
import type { WebsiteFetchFailure, WebsiteResourceResult, WebsiteResourceTarget } from "./website-fetch";

import { robotsFromFetch, robotsPathOf, WIKI_CRAWL_USER_AGENT } from "./website-discovery";
import { WIKI_CRAWL_PAGE_TYPES } from "./website-crawler";
import { fetchWebsiteResource } from "./website-fetch";
import { extractWikiSourceDocument } from "./website-source-extract";
import { wikiSourceText } from "./wiki-source-text";

export type PublicWebPage = {
  ok: true;
  url: string;
  title: string;
  text: string;
  truncated: boolean;
};

export type PublicWebPageResult = PublicWebPage | { ok: false; reason: WebsiteFetchFailure | "empty"; status?: number };

export async function readPublicWebPage(
  url: string,
  options: { signal?: AbortSignal } = {},
): Promise<PublicWebPageResult> {
  const robots = new Map<string, Promise<{ fetched: WebsiteResourceResult; rules: RobotsRules }>>();
  let blockedRobotsHost = false;
  const allowsRead = async (target: WebsiteResourceTarget) => {
    const origin = new URL(target.url).origin;
    let entry = robots.get(origin);
    if (!entry) {
      entry = fetchWebsiteResource(
        {
          url: `${origin}/robots.txt`,
          allows: (robotsTarget) => robotsTarget.registrableDomain === target.registrableDomain,
          accept: ["text/plain", "text/markdown"],
          userAgent: WIKI_CRAWL_USER_AGENT,
          truncateOversized: true,
        },
        options,
      ).then((fetched) => ({ fetched, rules: robotsFromFetch(fetched) }));
      robots.set(origin, entry);
    }
    const { fetched, rules } = await entry;
    if (!fetched.ok && fetched.reason === "blocked_address") blockedRobotsHost = true;
    return rules.allows(robotsPathOf(target.url));
  };
  const resource = await fetchWebsiteResource(
    {
      url,
      allows: () => true,
      allowsRead,
      accept: WIKI_CRAWL_PAGE_TYPES,
      userAgent: WIKI_CRAWL_USER_AGENT,
      truncateOversized: true,
    },
    options,
  );
  if (!resource.ok)
    return resource.reason === "robots" && blockedRobotsHost ? { ok: false, reason: "blocked_address" } : resource;
  const document = extractWikiSourceDocument(resource.body, resource.url, resource.contentType);
  const text = wikiSourceText(document);
  if (!text.trim()) return { ok: false, reason: "empty" };
  return {
    ok: true,
    url: resource.url,
    title: document.title,
    text,
    truncated: resource.truncated || document.truncated,
  };
}

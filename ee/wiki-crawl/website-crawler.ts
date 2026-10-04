import { wikiSourceText } from "./wiki-source-text";
import type { WikiCrawlCandidate, WikiCrawlTarget } from "./website-discovery";
import type { WikiSourceQa } from "./website-source-extract";

import { createHash } from "node:crypto";

import { fetchWebsiteResource } from "./website-fetch";
import { parsePublicPageUrl } from "@/features/wiki/wiki-homepage";

import {
  isExternalHelpHost,
  parseLlmsTxt,
  parseSitemap,
  rankWikiCrawlTargets,
  WIKI_CRAWL_MAX_SITEMAP_URLS,
  WIKI_CRAWL_USER_AGENT,
} from "./website-discovery";
import { extractWikiSourceDocument } from "./website-source-extract";

const MAX_SITEMAP_FETCHES = 6;
const MAX_PENDING_HOSTS = 3;
const PAGE_TYPES = ["text/html", "application/xhtml+xml", "text/plain", "text/markdown"] as const;
const XML_TYPES = ["application/xml", "text/xml", "application/rss+xml"] as const;
const TEXT_TYPES = ["text/plain", "text/markdown"] as const;

import type { WikiCrawlScope } from "./website-crawl-scope";
import { isWikiCrawlTargetInScope } from "./website-crawl-scope";
import { WikiCrawlRobots } from "./wiki-crawl-robots";

export type WikiCrawlDiscovery =
  | { status: "blocked" }
  | { status: "unavailable" }
  | { status: "ready"; targets: WikiCrawlTarget[]; pendingHosts: string[]; crawlDelayMs: number };

export type WikiFetchedSource = {
  url: string;
  title: string;
  text: string;
  qaPairs: WikiSourceQa[];
  contentHash: string;
};

function fetchResource(url: string, scope: WikiCrawlScope, accept: readonly string[], robots: WikiCrawlRobots) {
  return fetchWebsiteResource({
    url,
    allows: (target) => isWikiCrawlTargetInScope(scope, target),
    allowsRead: (target) => robots.allows(target.url),
    accept,
    userAgent: WIKI_CRAWL_USER_AGENT,
  });
}

async function fetchText(url: string, scope: WikiCrawlScope, accept: readonly string[], robots: WikiCrawlRobots) {
  const resource = await fetchResource(url, scope, accept, robots);
  return resource.ok ? resource : null;
}

export async function discoverWikiWebsite(input: {
  homepage: string;
  locale: string;
  scope: WikiCrawlScope;
}): Promise<WikiCrawlDiscovery> {
  const homepage = parsePublicPageUrl(input.homepage);
  if (!homepage) return { status: "unavailable" };
  const origin = new URL(homepage.url).origin;
  const robots = new WikiCrawlRobots(input.scope);
  const rootRules = await robots.forUrl(homepage.url);
  if (rootRules.unreachable) return { status: "unavailable" };
  if (!(await robots.allows(homepage.url))) return { status: "blocked" };

  const home = await fetchText(homepage.url, input.scope, PAGE_TYPES, robots);
  if (!home) return { status: "unavailable" };
  const homeDocument = extractWikiSourceDocument(home.body, home.url, home.contentType);
  const candidates: WikiCrawlCandidate[] = homeDocument.links.map((link) => ({ ...link, source: "link" }));
  const pendingHosts = new Set<string>();
  for (const link of homeDocument.links) {
    const target = parsePublicPageUrl(link.url);
    const host = target ? new URL(target.url).hostname : null;
    if (!target || !host || isWikiCrawlTargetInScope(input.scope, { ...target, host })) continue;
    if (isExternalHelpHost(host) && pendingHosts.size < MAX_PENDING_HOSTS) pendingHosts.add(host);
  }

  const llms = await fetchText(`${origin}/llms.txt`, input.scope, TEXT_TYPES, robots);
  if (llms) candidates.push(...parseLlmsTxt(llms.body, origin).map((link) => ({ ...link, source: "llms" as const })));

  const sitemapQueue = rootRules.sitemaps.length > 0 ? [...rootRules.sitemaps] : [`${origin}/sitemap.xml`];
  let sitemapFetches = 0;
  let sitemapUrls = 0;
  while (sitemapQueue.length > 0 && sitemapFetches < MAX_SITEMAP_FETCHES && sitemapUrls < WIKI_CRAWL_MAX_SITEMAP_URLS) {
    const next = sitemapQueue.shift();
    if (!next || /\.gz$/iu.test(next)) continue;
    sitemapFetches += 1;
    const sitemap = await fetchText(next, input.scope, XML_TYPES, robots);
    if (!sitemap) continue;
    const parsed = parseSitemap(sitemap.body);
    sitemapQueue.push(...parsed.sitemaps);
    for (const url of parsed.urls.slice(0, WIKI_CRAWL_MAX_SITEMAP_URLS - sitemapUrls))
      candidates.push({ url, source: "sitemap" });
    sitemapUrls += parsed.urls.length;
  }

  const allowed = new Set<string>();
  for (const candidate of candidates) {
    const target = parsePublicPageUrl(candidate.url);
    if (!target) continue;
    const host = new URL(target.url).hostname;
    if (!isWikiCrawlTargetInScope(input.scope, { ...target, host })) continue;
    if (await robots.allows(target.url)) allowed.add(target.url);
  }
  const targets = rankWikiCrawlTargets({
    homepage: homepage.url,
    candidates: candidates.filter((candidate) => {
      const target = parsePublicPageUrl(candidate.url);
      return target ? allowed.has(target.url) : false;
    }),
    locale: input.locale,
    allows: () => true,
  });
  return { status: "ready", targets, pendingHosts: [...pendingHosts], crawlDelayMs: rootRules.crawlDelayMs };
}

export async function fetchWikiSource(
  url: string,
  scope: WikiCrawlScope,
  robots: WikiCrawlRobots,
): Promise<WikiFetchedSource | null> {
  if (!(await robots.allows(url))) return null;
  const resource = await fetchText(url, scope, PAGE_TYPES, robots);
  if (!resource) return null;
  const document = extractWikiSourceDocument(resource.body, resource.url, resource.contentType);
  const text = wikiSourceText(document);
  if (!text) return null;
  return {
    url: resource.url,
    title: document.title,
    text,
    qaPairs: document.qaPairs.filter(({ question, answer }) => text.includes(question) && text.includes(answer)),
    contentHash: createHash("sha256").update(text).digest("hex"),
  };
}

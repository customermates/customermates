import { parsePublicPageUrl } from "@/features/wiki/wiki-homepage";

import { crawlPathCategory, isSkippedCrawlPath } from "./website-url-vocabulary";

export { isExternalHelpHost } from "./website-url-vocabulary";

export const WIKI_CRAWL_USER_AGENT_TOKEN = "customermates";
export const WIKI_CRAWL_USER_AGENT =
  "Customermates/1.0 (+https://customermates.com/docs/app-assistant; website import)";
export const WIKI_CRAWL_MAX_PAGES = 40;
export const WIKI_CRAWL_MAX_SITEMAP_URLS = 5_000;
const WIKI_CRAWL_MAX_CRAWL_DELAY_MS = 10_000;

export const WIKI_CRAWL_CATEGORIES = [
  "help",
  "product",
  "policy",
  "pricing",
  "about",
  "customers",
  "blog",
  "other",
] as const;
export type WikiCrawlCategory = (typeof WIKI_CRAWL_CATEGORIES)[number];

const CATEGORY_QUOTAS: Array<{ categories: WikiCrawlCategory[]; pages: number }> = [
  { categories: ["help"], pages: 18 },
  { categories: ["product", "about", "customers"], pages: 8 },
  { categories: ["policy"], pages: 5 },
  { categories: ["pricing"], pages: 3 },
  { categories: ["other"], pages: 6 },
];

export type RobotsRules = {
  allows: (path: string) => boolean;
  sitemaps: string[];
  crawlDelayMs: number;
  blocked: boolean;
};

type RobotsRule = { allow: boolean; pattern: string };

function robotsPatternMatches(pattern: string, path: string): boolean {
  if (!pattern) return false;
  const anchored = pattern.endsWith("$");
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${body}${anchored ? "$" : ""}`, "u").test(path);
}

export function parseRobots(text: string | null): RobotsRules {
  const groups: Array<{ agents: string[]; rules: RobotsRule[]; crawlDelayMs: number | null }> = [];
  const sitemaps: string[] = [];
  let current: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of (text ?? "").split(/\r?\n/u)) {
    const line = raw.replace(/#.*$/u, "").trim();
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (field === "sitemap") {
      if (value) sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [], crawlDelayMs: null };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") current.rules.push({ allow: field === "allow", pattern: value });
    if (field === "crawl-delay") {
      const seconds = Number(value);
      if (Number.isFinite(seconds) && seconds >= 0) current.crawlDelayMs = seconds * 1_000;
    }
  }
  const own = groups.filter((group) =>
    group.agents.some((agent) => agent.split("/", 1)[0].trim() === WIKI_CRAWL_USER_AGENT_TOKEN),
  );
  const selected = own.length > 0 ? own : groups.filter((group) => group.agents.includes("*"));
  const rules = selected.flatMap((group) => group.rules);
  const delays = selected.map((group) => group.crawlDelayMs).filter((delay): delay is number => delay !== null);
  const allows = (path: string) => {
    let best: RobotsRule | null = null;
    for (const rule of rules) {
      if (!robotsPatternMatches(rule.pattern, path)) continue;
      if (
        !best ||
        rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow)
      )
        best = rule;
    }
    return best ? best.allow : true;
  };
  return {
    allows,
    sitemaps,
    crawlDelayMs: Math.min(WIKI_CRAWL_MAX_CRAWL_DELAY_MS, Math.max(0, ...delays)),
    blocked: !allows("/"),
  };
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decodeXmlText(value: string): string {
  const text = value.trim();
  const cdata = /^<!\[CDATA\[([\s\S]*?)\]\]>$/u.exec(text);
  if (cdata) return cdata[1].trim();
  return text.replace(/&(amp|lt|gt|quot|apos);/gu, (_, name: string) => XML_ENTITIES[name]);
}

export function parseSitemap(xml: string): { urls: string[]; sitemaps: string[] } {
  const locations = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/giu)].map((match) => decodeXmlText(match[1]));
  return /<sitemapindex[\s>]/iu.test(xml)
    ? { urls: [], sitemaps: locations }
    : { urls: locations.slice(0, WIKI_CRAWL_MAX_SITEMAP_URLS), sitemaps: [] };
}

export function parseLlmsTxt(markdown: string, baseUrl: string): Array<{ url: string; title: string }> {
  return [...markdown.matchAll(/\[([^\]\n]{1,200})\]\(([^)\s]+)\)/gu)].flatMap((match) => {
    try {
      return [{ url: new URL(match[2], baseUrl).toString(), title: match[1].trim() }];
    } catch {
      return [];
    }
  });
}

export function canonicalCrawlUrl(value: string): string | null {
  const page = parsePublicPageUrl(value);
  if (!page) return null;
  const url = new URL(page.url);
  url.search = "";
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/index\.html?$/iu, "/");
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/u, "");
  return url.toString();
}

export function wikiCrawlCategory(url: string, title = ""): WikiCrawlCategory {
  const path = decodeURIComponent(new URL(url).pathname).toLocaleLowerCase();
  const searchable = `${path} ${title.toLocaleLowerCase()}`;
  if (path === "/" || path === "") return "about";
  return crawlPathCategory(path, searchable);
}

export type WikiCrawlCandidate = { url: string; title?: string; source: "homepage" | "llms" | "link" | "sitemap" };
export type WikiCrawlTarget = { url: string; category: WikiCrawlCategory };

const SOURCE_RANK = { homepage: 0, llms: 1, link: 2, sitemap: 3 } as const;

function localeSegment(url: string): string | null {
  const first = new URL(url).pathname.split("/").filter(Boolean)[0]?.toLowerCase() ?? "";
  return /^[a-z]{2}(?:-[a-z]{2})?$/u.test(first) ? first.slice(0, 2) : null;
}

export function rankWikiCrawlTargets(input: {
  homepage: string;
  candidates: WikiCrawlCandidate[];
  locale: string;
  allows: (url: string) => boolean;
  maxPages?: number;
}): WikiCrawlTarget[] {
  const maxPages = input.maxPages ?? WIKI_CRAWL_MAX_PAGES;
  const homepage = canonicalCrawlUrl(input.homepage);
  const homeLocale = homepage ? localeSegment(homepage) : null;
  const seen = new Map<string, { candidate: WikiCrawlCandidate; order: number }>();
  input.candidates.forEach((candidate, order) => {
    const url = canonicalCrawlUrl(candidate.url);
    if (!url || url === homepage) return;
    const path = new URL(url).pathname.toLowerCase();
    if (isSkippedCrawlPath(path) || !input.allows(url)) return;
    const known = seen.get(url);
    if (!known || SOURCE_RANK[candidate.source] < SOURCE_RANK[known.candidate.source])
      seen.set(url, { candidate: { ...candidate, url, title: candidate.title ?? known?.candidate.title }, order });
  });
  const locale = input.locale.slice(0, 2).toLowerCase();
  const score = ({ candidate, order }: { candidate: WikiCrawlCandidate; order: number }) => {
    const segment = localeSegment(candidate.url);
    const foreignLocale = segment !== null && segment !== locale && segment !== homeLocale;
    const depth = new URL(candidate.url).pathname.split("/").filter(Boolean).length;
    return (foreignLocale ? 1_000 : 0) + SOURCE_RANK[candidate.source] * 100 + depth * 10 + order / 100_000;
  };
  const byCategory = new Map<WikiCrawlCategory, WikiCrawlCandidate[]>();
  for (const entry of [...seen.values()].sort((left, right) => score(left) - score(right))) {
    const category = wikiCrawlCategory(entry.candidate.url, entry.candidate.title);
    byCategory.set(category, [...(byCategory.get(category) ?? []), entry.candidate]);
  }

  const targets: WikiCrawlTarget[] = homepage ? [{ url: homepage, category: "about" }] : [];
  const take = (category: WikiCrawlCategory, limit: number) => {
    const pool = byCategory.get(category) ?? [];
    const taken = pool.splice(0, Math.max(0, limit));
    targets.push(...taken.map(({ url }) => ({ url, category })));
    return taken.length;
  };
  for (const quota of CATEGORY_QUOTAS) {
    let remaining = quota.pages;
    while (remaining > 0) {
      const before = remaining;
      for (const category of quota.categories) if (remaining > 0) remaining -= take(category, 1);
      if (remaining === before) break;
    }
  }
  for (const category of [...WIKI_CRAWL_CATEGORIES, "blog" as const]) {
    if (targets.length >= maxPages) break;
    take(category, maxPages - targets.length);
  }
  return targets.slice(0, maxPages);
}

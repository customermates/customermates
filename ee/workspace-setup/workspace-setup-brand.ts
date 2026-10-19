import type { BrandMapping } from "./workspace-setup.schema";

import { WIKI_CRAWL_USER_AGENT } from "@/ee/wiki-crawl/website-discovery";
import { isWikiCrawlTargetInScope } from "@/ee/wiki-crawl/website-crawl-scope";
import { fetchWebsiteResource } from "@/ee/wiki-crawl/website-fetch";
import { WikiCrawlRobots } from "@/ee/wiki-crawl/wiki-crawl-robots";
import { mapBrandColors } from "@/features/workspace-setup/brand-colors";

const MAX_STYLESHEETS = 3;
const HTML_TYPES = ["text/html", "application/xhtml+xml"] as const;
const CSS_TYPES = ["text/css"] as const;
const MANIFEST_TYPES = ["application/manifest+json", "application/json"] as const;

export type BrandFetch = (url: string, accept: readonly string[]) => ReturnType<typeof fetchWebsiteResource>;

export function websiteBrandFetch(scope: { registrableDomain: string }): BrandFetch {
  const crawlScope = { registrableDomain: scope.registrableDomain, extraHosts: [] };
  const robots = new WikiCrawlRobots(crawlScope);
  return (url, accept) =>
    fetchWebsiteResource({
      url,
      allows: (target) => isWikiCrawlTargetInScope(crawlScope, target),
      allowsRead: (target) => robots.allows(target.url),
      accept,
      userAgent: WIKI_CRAWL_USER_AGENT,
      truncateOversized: true,
    });
}

function linkHrefs(html: string, rel: string): string[] {
  const hrefs: string[] = [];
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi)) {
    const rels = /\brel\s*=\s*["']?([^"'>]+)/i.exec(tag)?.[1]?.toLowerCase().split(/\s+/) ?? [];
    const href = /\bhref\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1];
    if (href && rels.includes(rel)) hrefs.push(href);
  }
  return hrefs;
}

function absolute(href: string, base: string): string | null {
  try {
    const url = new URL(href, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export async function readWebsiteBrand(homepageUrl: string, fetch: BrandFetch): Promise<BrandMapping | null> {
  const page = await fetch(homepageUrl, HTML_TYPES);
  if (!page.ok) return null;
  const manifestUrl = linkHrefs(page.body, "manifest")
    .map((href) => absolute(href, page.url))
    .find((url): url is string => url !== null);
  const stylesheetUrls = linkHrefs(page.body, "stylesheet")
    .flatMap((href) => absolute(href, page.url) ?? [])
    .slice(0, MAX_STYLESHEETS);
  const [manifest, ...stylesheets] = await Promise.all([
    manifestUrl ? fetch(manifestUrl, MANIFEST_TYPES) : Promise.resolve(null),
    ...stylesheetUrls.map((url) => fetch(url, CSS_TYPES)),
  ]);
  const mapping = mapBrandColors({
    html: page.body,
    manifest: manifest?.ok ? manifest.body : null,
    stylesheets: stylesheets.flatMap((sheet) => (sheet?.ok ? [sheet.body] : [])),
  });
  return mapping ? { hex: mapping.hex.toLowerCase(), chip: mapping.chip, chart: mapping.chart } : null;
}

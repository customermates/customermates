import { z } from "zod";

import rawManifest from "@/generated/raw-docs-manifest.json";

import { encodeToToon, VALIDATION_ERROR_PREFIX } from "./utils";

import { env } from "@/env";
import { getMcpInstallSnippet, type McpTool } from "@/features/docs/mcp-install-snippet";

type ManifestPage = { title: string; description: string; content: string };
type Manifest = Record<DocsSource, Record<DocsLocale, Record<string, ManifestPage>>>;
type DocsSource = "docs" | "api";
type DocsLocale = "en" | "de";

type IndexEntry = {
  slug: string;
  source: DocsSource;
  title: string;
  description: string;
  headings: string[];
  body: string;
  lowerTitle: string;
  lowerDescription: string;
  lowerHeadings: string[];
  lowerBody: string;
};

const manifest = rawManifest as Manifest;
const indexCache = new Map<string, IndexEntry[]>();

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function buildIndex(source: DocsSource, locale: DocsLocale): IndexEntry[] {
  const cacheKey = `${source}:${locale}`;
  const cached = indexCache.get(cacheKey);
  if (cached) return cached;

  const entries = Object.entries(manifest[source]?.[locale] ?? {}).map(([slug, page]) => {
    const body = stripFrontmatter(page.content);
    const headings = [...body.matchAll(/^#{1,4}\s+(.+)$/gm)].map((m) => m[1]);
    return {
      slug,
      source,
      title: page.title,
      description: page.description,
      headings,
      body,
      lowerTitle: page.title.toLowerCase(),
      lowerDescription: page.description.toLowerCase(),
      lowerHeadings: headings.map((h) => h.toLowerCase()),
      lowerBody: body.toLowerCase(),
    };
  });
  indexCache.set(cacheKey, entries);
  return entries;
}

function pageUrl(source: DocsSource, locale: DocsLocale, slug: string): string {
  return source === "docs"
    ? `${env.BASE_URL}/${locale}/docs/${slug}`
    : `${env.BASE_URL}/${locale}/docs/openapi/${slug}`;
}

function countOccurrences(haystack: string, needle: string): number {
  let count = 0;
  let position = haystack.indexOf(needle);
  while (position !== -1 && count < 5) {
    count += 1;
    position = haystack.indexOf(needle, position + needle.length);
  }
  return count;
}

function scoreEntry(entry: IndexEntry, tokens: string[], phrase: string): number {
  let score = 0;
  for (const token of tokens) {
    if (entry.lowerTitle.includes(token)) score += 10;
    if (entry.lowerDescription.includes(token)) score += 5;
    if (entry.lowerHeadings.some((h) => h.includes(token))) score += 4;
    score += countOccurrences(entry.lowerBody, token);
  }
  if (tokens.length > 1) {
    if (entry.lowerTitle.includes(phrase)) score += 15;
    else if (entry.lowerBody.includes(phrase)) score += 5;
  }
  return score;
}

function buildSnippet(entry: IndexEntry, tokens: string[], phrase: string): string {
  const matchIndex = [phrase, ...tokens].map((n) => entry.lowerBody.indexOf(n)).find((i) => i !== -1) ?? 0;
  const start = Math.max(0, matchIndex - 90);
  const raw = entry.body
    .slice(start, start + 180)
    .replace(/\s+/g, " ")
    .trim();
  return `${start > 0 ? "…" : ""}${raw}…`;
}

function normalizeSlug(slug: string): string {
  return slug
    .replace(/^\/?(docs\/)?/, "")
    .replace(/(\.mdx?)+$/, "")
    .trim();
}

export type DocsSearchHit = { slug: string; source: DocsSource; title: string; url: string; snippet: string };

export function searchDocsRaw(
  query: string,
  locale: DocsLocale,
  source: DocsSource | "all",
): { results: DocsSearchHit[]; total: number } {
  const phrase = query.toLowerCase().trim();
  const tokens = phrase.split(/\s+/).filter((t) => t.length >= 2);
  const sources: DocsSource[] = source === "all" ? ["docs", "api"] : [source];
  const scored = sources
    .flatMap((s) => buildIndex(s, locale))
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens, phrase) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.slug.localeCompare(b.entry.slug));

  const results = scored.slice(0, 5).map(({ entry }) => ({
    slug: entry.slug,
    source: entry.source,
    title: entry.title,
    url: pageUrl(entry.source, locale, entry.slug),
    snippet: buildSnippet(entry, tokens, phrase),
  }));

  return { results, total: scored.length };
}

export function listDocsSlugs(locale: DocsLocale, source: DocsSource): string[] {
  return Object.keys(manifest[source]?.[locale] ?? {}).sort();
}

export function getDocsPageRaw(
  slug: string,
  locale: DocsLocale,
  source: DocsSource,
): { slug: string; title: string; description: string; url: string; markdown: string } | null {
  const normalized = normalizeSlug(slug);
  const page = manifest[source]?.[locale]?.[normalized];
  if (!page) return null;

  const markdown = stripFrontmatter(page.content)
    .replace(
      /<McpInstallSnippet\s+tool="([a-zA-Z]+)"\s*\/>/g,
      (_, tool: string) => `\`\`\`\n${getMcpInstallSnippet(tool as McpTool, "<your-api-key>", env.BASE_URL)}\n\`\`\``,
    )
    .replace(/^<[A-Z][A-Za-z]*(\s[^>]*)?\/>\s*$/gm, "")
    .trim();

  return {
    slug: normalized,
    title: page.title,
    description: page.description,
    url: pageUrl(source, locale, normalized),
    markdown,
  };
}

export const searchDocsTool = {
  name: "search_docs",
  title: "Search documentation",
  description:
    "Use this when you need to search the Customermates documentation (product guides and REST API reference). " +
    "Required: query. Optional: locale (one of: en, de; default en), source (one of: docs, api, all; default docs). " +
    "Returns up to 5 matches as {slug, source, title, url, snippet}. Follow up with get_docs_page for the full page.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    query: z.string().min(2).describe("Free-text search, e.g. 'webhook signature' or 'filter operators'"),
    locale: z.enum(["en", "de"]).default("en").describe("Documentation language (one of: en, de)"),
    source: z
      .enum(["docs", "api", "all"])
      .default("docs")
      .describe("docs = product guides, api = REST endpoint reference, all = both"),
  }),
  execute: ({ query, locale, source }: { query: string; locale: DocsLocale; source: "docs" | "api" | "all" }) => {
    const { results, total } = searchDocsRaw(query, locale, source);

    if (results.length === 0) {
      return encodeToToon({
        results: [],
        total: 0,
        hint: "Try broader terms or source: 'all'. get_docs_page lists all valid slugs on a miss.",
      });
    }

    return encodeToToon({ results, total });
  },
};

export const getDocsPageTool = {
  name: "get_docs_page",
  title: "Get documentation page",
  description:
    "Use this when you need one Customermates documentation page as markdown, with its canonical URL. " +
    "Required: slug (as returned by search_docs). Optional: locale (one of: en, de; default en), source (one of: docs, api; default docs). " +
    "Unknown slugs return the full list of valid slugs. Use search_docs first when you don't know the slug.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    slug: z.string().min(1).describe("Docs page slug, e.g. 'quickstart' or 'mcp-tool-catalog'"),
    locale: z.enum(["en", "de"]).default("en").describe("Documentation language (one of: en, de)"),
    source: z.enum(["docs", "api"]).default("docs").describe("docs = product guides, api = REST endpoint reference"),
  }),
  execute: ({ slug, locale, source }: { slug: string; locale: DocsLocale; source: DocsSource }) => {
    const page = getDocsPageRaw(slug, locale, source);

    if (!page) {
      const validSlugs = listDocsSlugs(locale, source).join(", ");
      return `${VALIDATION_ERROR_PREFIX} Unknown ${source} page "${slug}" for locale "${locale}". Valid slugs: ${validSlugs}`;
    }

    return [`# ${page.title}`, "", `> ${page.description}`, "", `Canonical URL: ${page.url}`, "", page.markdown].join(
      "\n",
    );
  },
};

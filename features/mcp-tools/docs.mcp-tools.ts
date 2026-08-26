import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";

import rawManifest from "@/generated/raw-docs-manifest.json";

import { mcpMessageFailure } from "./utils";

import { env } from "@/env";
import { getMcpInstallSnippet, type McpTool } from "@/features/docs/mcp-install-snippet";
import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

type ManifestPage = { title: string; description: string; content: string };
type Manifest = Record<DocsSource, Record<DocsLocale, Record<string, ManifestPage>>>;
type DocsSource = "docs" | "api";
type DocsLocale = ContentLocale;

const [firstDocsLocale, ...otherDocsLocales] = CONTENT_LOCALES;
const docsLocaleList = CONTENT_LOCALES.join(", ");
const docsLocaleSchema = z
  .enum([firstDocsLocale, ...otherDocsLocales])
  .default(DEFAULT_LOCALE)
  .describe(`Documentation language (one of: ${docsLocaleList})`);

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
const SEARCH_STOP_WORDS = new Set([
  "and",
  "can",
  "could",
  "customermates",
  "for",
  "from",
  "how",
  "into",
  "me",
  "please",
  "should",
  "show",
  "tell",
  "the",
  "through",
  "to",
  "walk",
  "what",
  "when",
  "where",
  "with",
  "would",
  "you",
  "your",
]);

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

function queryTerms(query: string): string[] {
  const terms = new Set<string>();
  for (const match of query.toLocaleLowerCase().matchAll(/[\p{L}\p{N}]+/gu)) {
    const token = match[0];
    if (token.length < 3 || SEARCH_STOP_WORDS.has(token)) continue;
    if (token.length > 5 && token.endsWith("ing")) terms.add(token.slice(0, -3));
    else if (token.length > 4 && token.endsWith("ed")) terms.add(token.slice(0, -2));
    else if (token.length > 3 && token.endsWith("s")) terms.add(token.slice(0, -1));
    else terms.add(token);
  }
  return [...terms];
}

function scoreEntry(entry: IndexEntry, tokens: string[], phrase: string): number {
  let score = 0;
  for (const token of tokens) {
    if (entry.lowerTitle.includes(token)) score += 10;
    if (entry.lowerDescription.includes(token)) score += 5;
    if (entry.lowerHeadings.some((h) => h.includes(token))) score += 4;
    score += Math.min(8, countOccurrences(entry.lowerBody, token));
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

const DocsSearchHitSchema = z.object({
  slug: z.string(),
  source: z.enum(["docs", "api"]),
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
});
const DocsSearchOutputSchema = z.object({
  results: z.array(DocsSearchHitSchema),
  total: z.number().int().nonnegative(),
});

export type DocsSearchHit = z.infer<typeof DocsSearchHitSchema>;

export function searchDocsRaw(
  query: string,
  locale: DocsLocale,
  source: DocsSource | "all",
): { results: DocsSearchHit[]; total: number } {
  const phrase = query.toLowerCase().trim();
  const tokens = queryTerms(phrase);
  const sources: DocsSource[] = source === "all" ? ["docs", "api"] : [source];
  const scored = sources
    .flatMap((s) => buildIndex(s, locale))
    .map((entry) => ({ entry, score: scoreEntry(entry, tokens, phrase) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || (a.entry.slug < b.entry.slug ? -1 : a.entry.slug > b.entry.slug ? 1 : 0));

  const results = scored.slice(0, 5).map(({ entry }) => ({
    slug: entry.slug,
    source: entry.source,
    title: entry.title,
    url: pageUrl(entry.source, locale, entry.slug),
    snippet: buildSnippet(entry, tokens, phrase),
  }));

  return { results, total: scored.length };
}

function relevantDocsExcerpt(markdown: string, query: string): string {
  const terms = queryTerms(query);
  if (terms.length === 0) return markdown.slice(0, 1_200).trim();

  const lowerMarkdown = markdown.toLocaleLowerCase();
  const rarestFirst = [...terms].sort(
    (left, right) => countOccurrences(lowerMarkdown, left) - countOccurrences(lowerMarkdown, right),
  );
  const anchors = rarestFirst.flatMap((term) => {
    const positions: number[] = [];
    let position = lowerMarkdown.indexOf(term);
    while (position !== -1 && positions.length < 20) {
      positions.push(position);
      position = lowerMarkdown.indexOf(term, position + term.length);
    }
    return positions;
  });
  if (anchors.length === 0) return markdown.slice(0, 1_200).trim();

  const termWeights = new Map(terms.map((term) => [term, countOccurrences(lowerMarkdown, term) <= 3 ? 3 : 1] as const));
  const bestAnchor = anchors.reduce(
    (best, anchor) => {
      const start = Math.max(0, anchor - 300);
      const end = Math.min(lowerMarkdown.length, anchor + 500);
      const window = lowerMarkdown.slice(start, end);
      const score = terms.reduce(
        (sum, term) => sum + Math.min(3, countOccurrences(window, term)) * (termWeights.get(term) ?? 1),
        0,
      );
      return score > best.score ? { anchor, score } : best;
    },
    { anchor: anchors[0], score: -1 },
  ).anchor;

  const roughStart = bestAnchor;
  const precedingBreak = markdown.lastIndexOf("\n", roughStart);
  let start = precedingBreak === -1 ? roughStart : precedingBreak + 1;
  for (let contextLines = 0; contextLines < 2 && start > 0; contextLines += 1) {
    const previousBreak = markdown.lastIndexOf("\n", start - 2);
    const candidate = previousBreak === -1 ? 0 : previousBreak + 1;
    if (roughStart - candidate > 300) break;
    start = candidate;
  }
  const roughEnd = Math.min(markdown.length, start + 1_000);
  const followingBreak = markdown.indexOf("\n", roughEnd);
  const end = followingBreak === -1 ? roughEnd : followingBreak;
  const excerpt = markdown.slice(start, end).trim();
  return `${start > 0 ? "…\n" : ""}${excerpt}${end < markdown.length ? "\n…" : ""}`;
}

export function listDocsSlugs(locale: DocsLocale, source: DocsSource): string[] {
  return Object.keys(manifest[source]?.[locale] ?? {}).sort();
}

function compactDocsSearchText(results: DocsSearchHit[], total: number): string {
  if (results.length === 0) return "matches: none\ntotal=0\nhint: Try broader terms or source=all.";

  const best = results[0];
  const matches = results.map(({ slug, source }) => `${source}:${slug}`).join("\n");
  const prefix = `matches:\n${matches}\ntotal=${total}\nbest=${best.source}:${best.slug} ${best.title}\nsnippet=`;
  const available = Math.max(0, 500 - prefix.length);
  return `${prefix}${best.snippet.slice(0, available)}`;
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
    `Required: query. Optional: locale (one of: ${docsLocaleList}; default ${DEFAULT_LOCALE}), source (one of: docs, api, all; default docs). ` +
    "Returns a compact ranked page list and best snippet in text, plus up to 5 full {slug, source, title, url, snippet} matches as structured content. Follow up with get_docs_page for the best page.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    query: z.string().min(2).describe("Free-text search, e.g. 'webhook signature' or 'filter operators'"),
    locale: docsLocaleSchema,
    source: z
      .enum(["docs", "api", "all"])
      .default("docs")
      .describe("docs = product guides, api = REST endpoint reference, all = both"),
  }),
  outputSchema: DocsSearchOutputSchema,
  execute: ({ query, locale, source }: { query: string; locale: DocsLocale; source: "docs" | "api" | "all" }) => {
    const { results, total } = searchDocsRaw(query, locale, source);
    return {
      text: compactDocsSearchText(results, total),
      structuredContent: { results, total },
    };
  },
};

export const getDocsPageTool = {
  name: "get_docs_page",
  title: "Get documentation page",
  description:
    "Use this when you need one Customermates documentation page as markdown, with its canonical URL. " +
    `Required: slug (as returned by search_docs). Optional: locale (one of: ${docsLocaleList}; default ${DEFAULT_LOCALE}), source (one of: docs, api; default docs). ` +
    "Pass query with the exact detail you need to put a bounded relevant excerpt first and avoid repeated page reads; omit query only when you need the full page. " +
    "Unknown slugs return the full list of valid slugs. Use search_docs first when you don't know the slug.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  inputSchema: z.object({
    slug: z.string().min(1).describe("Docs page slug, e.g. 'quickstart' or 'mcp-tool-catalog'"),
    query: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .optional()
      .describe("Exact question or detail to return as a focused excerpt instead of the full page"),
    locale: docsLocaleSchema,
    source: z.enum(["docs", "api"]).default("docs").describe("docs = product guides, api = REST endpoint reference"),
  }),
  execute: ({
    slug,
    query,
    locale,
    source,
  }: {
    slug: string;
    query?: string;
    locale: DocsLocale;
    source: DocsSource;
  }) => {
    const page = getDocsPageRaw(slug, locale, source);

    if (!page) {
      const validSlugs = listDocsSlugs(locale, source).join(", ");
      return mcpMessageFailure(`Unknown ${source} page "${slug}" for locale "${locale}". Valid slugs: ${validSlugs}`);
    }

    if (query) return [`# ${page.title}`, `URL: ${page.url}`, relevantDocsExcerpt(page.markdown, query)].join("\n");

    return [`# ${page.title}`, "", `> ${page.description}`, "", `Canonical URL: ${page.url}`, "", page.markdown].join(
      "\n",
    );
  },
};

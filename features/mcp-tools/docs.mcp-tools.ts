import { z } from "zod";

import { mcpMessageFailure } from "./utils";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

import type { DocsSection } from "./docs-sections";

import {
  docsCorpusSections,
  getDocsPageRaw,
  listDocsSlugs,
  pageUrl,
  type DocsLocale,
  type DocsSource,
} from "./docs-manifest";

import { unifiedDocsExcerpt, unifiedDocsSearch, type UnifiedDocsDeps } from "./docs-unified-search";

import { env } from "@/env";
import { currentSectionRanker } from "@/core/retrieval/retrieval-context";
import { retrievalExcerpt } from "@/core/retrieval/retrieval-excerpt";

export { getDocsPageRaw, listDocsSlugs } from "./docs-manifest";

const [firstDocsLocale, ...otherDocsLocales] = CONTENT_LOCALES;
const docsLocaleList = CONTENT_LOCALES.join(", ");
const docsLocaleSchema = z
  .enum([firstDocsLocale, ...otherDocsLocales])
  .default(DEFAULT_LOCALE)
  .describe("Documentation language");

const DocsSearchHitSchema = z.object({
  slug: z.string(),
  source: z.enum(["docs", "api"]),
  title: z.string(),
  url: z.string(),
  section: z.string().describe("Heading path of the best matching section, joined by ' > '"),
  anchor: z
    .string()
    .describe("Heading anchor of that section; pass a nonempty anchor unchanged to get_docs_page as anchor"),
  snippet: z.string(),
});
const DocsSearchOutputSchema = z.object({
  results: z.array(DocsSearchHitSchema),
  total: z.number().int().nonnegative(),
});

export type DocsSearchHit = z.infer<typeof DocsSearchHitSchema>;

function compactDocsSearchText(results: DocsSearchHit[], total: number): string {
  if (results.length === 0) return "matches: none\ntotal=0\nhint: Try broader terms or source=all.";

  const best = results[0];
  const matches = results.map(({ slug, source, anchor }) => `${source}:${slug}#${anchor}`).join("\n");
  const prefix = `matches:\n${matches}\ntotal=${total}\nbest=${best.url}\nsnippet=`;
  const available = Math.max(0, 500 - prefix.length);
  return `${prefix}${best.snippet.slice(0, available)}`;
}

export const DOCS_RERANK_EXCERPT_CHARS = 1_400;

export type SearchDocsInput = { query: string; locale: DocsLocale; source: "docs" | "api" | "all" };

export function docsRerankExcerpt(
  section: DocsSection,
  chars = DOCS_RERANK_EXCERPT_CHARS,
  query = "",
  locale: DocsLocale = DEFAULT_LOCALE,
): string {
  return retrievalExcerpt({
    heading: `## ${section.headingPath.join(" > ")}`,
    markdown: section.text,
    query,
    maxChars: chars,
    locale,
  });
}

const DOCS_RANK_SECONDARY_EXCERPT_CHARS = 400;

function rankedDocsSearchText(
  results: DocsSearchHit[],
  total: number,
  chosen: readonly DocsSection[],
  query: string,
  locale: DocsLocale,
): string {
  const matches = results.map(({ slug, source, anchor }) => `${source}:${slug}#${anchor}`).join("\n");
  const excerpts = chosen
    .map((section, index) =>
      docsRerankExcerpt(
        section,
        index === 0 ? DOCS_RERANK_EXCERPT_CHARS : DOCS_RANK_SECONDARY_EXCERPT_CHARS,
        query,
        locale,
      ),
    )
    .join("\n\n");
  return `matches:\n${matches}\ntotal=${total}\nbest=${results[0].url}\nexcerpt=\n${excerpts}`;
}

export const searchDocsTool = {
  name: "search_docs",
  title: "Search documentation",
  description:
    "Use this when you need to search the Customermates documentation (product guides and REST API reference). " +
    "Matches the query's words in full text and, with AI credits, also by meaning. " +
    `Required: query. Optional: locale (one of: ${docsLocaleList}; default ${DEFAULT_LOCALE}), source (one of: docs, api, all; default docs). ` +
    "Returns ranked pages with the best section of each (slug#anchor), then the best page's url and its snippet in text, plus up to 5 full matches as structured content. " +
    "App routes in a snippet, such as `/settings/billing`, are relative: prefix them with the origin of the match's url (best= in text); that origin is the instance's configured BASE_URL. " +
    "Then read the best page with get_docs_page, passing its nonempty returned anchor as anchor and the original question as query to preserve both the section and the requested detail; omit anchor and query for an empty anchor. If it does not answer, read the next page.",
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
  execute: (input: SearchDocsInput) => searchDocs(input),
};

const GetDocsPageOutputSchema = z.object({
  title: z.string(),
  url: z.string(),
  markdown: z.string().describe("The focused excerpt when query or anchor was passed, otherwise the full page"),
  excerpt: z.boolean().describe("True when markdown is a section or query-focused excerpt rather than the full page"),
});

export const getDocsPageTool = {
  name: "get_docs_page",
  title: "Get documentation page",
  description:
    "Use this when you need one Customermates documentation page as markdown, with its canonical URL. " +
    "App routes in the markdown, such as `/settings/billing`, are relative: prefix them with the origin of url; that origin is the instance's configured BASE_URL. " +
    `Required: slug (from search_docs). Optional: locale (one of: ${docsLocaleList}; default ${DEFAULT_LOCALE}), source (one of: docs, api; default docs). ` +
    "Pass the nonempty anchor returned by search_docs as anchor and the original question as query to read the selected section without losing the requested detail. For an empty anchor, omit anchor and query to read the full page. Otherwise pass query with the exact detail you need to get a bounded excerpt. " +
    "An unknown slug returns the valid slugs.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  outputSchema: GetDocsPageOutputSchema,
  inputSchema: z.object({
    slug: z.string().min(1).describe("Docs page slug, e.g. 'quickstart' or 'mcp' (the MCP tool catalog is on 'mcp')"),
    anchor: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional()
      .describe(
        "Exact nonempty section anchor returned by search_docs; pins that section while query focuses its content",
      ),
    query: z
      .string()
      .trim()
      .min(2)
      .max(200)
      .optional()
      .describe(
        "Exact question or detail to return as a focused excerpt; may be combined with anchor. A section anchor is also accepted for existing clients",
      ),
    locale: docsLocaleSchema,
    source: z.enum(["docs", "api"]).default("docs").describe("docs = product guides, api = REST endpoint reference"),
  }),
  execute: (input: GetDocsPageInput) => getDocsPage(input),
};

export type GetDocsPageInput = {
  slug: string;
  anchor?: string;
  query?: string;
  locale: DocsLocale;
  source: DocsSource;
};

export function docsPageResult({ slug, anchor, query, locale, source }: GetDocsPageInput, excerpt?: string) {
  const page = getDocsPageRaw(slug, locale, source);

  if (!page) {
    const validSlugs = listDocsSlugs(locale, source).join(", ");
    return mcpMessageFailure(`Unknown ${source} page "${slug}" for locale "${locale}". Valid slugs: ${validSlugs}`);
  }

  if (anchor !== undefined && excerpt === undefined) {
    const section = docsCorpusSections(source, locale).find(
      (value) => value.slug === page.slug && value.anchor === anchor,
    );
    if (!section)
      return mcpMessageFailure(`Unknown section "${anchor}" in ${source} page "${slug}" for locale "${locale}"`);
    excerpt = docsRerankExcerpt(section, DOCS_RERANK_EXCERPT_CHARS, query ?? "", locale);
  }

  if (excerpt !== undefined) {
    return {
      text: [excerpt, "", `Source: ${page.title}`, `URL: ${page.url}`].join("\n"),
      structuredContent: { title: page.title, url: page.url, markdown: excerpt, excerpt: true },
    };
  }

  return {
    text: [`# ${page.title}`, "", `> ${page.description}`, "", `Canonical URL: ${page.url}`, "", page.markdown].join(
      "\n",
    ),
    structuredContent: { title: page.title, url: page.url, markdown: page.markdown, excerpt: false },
  };
}

function docsSearchHit(section: DocsSection, locale: DocsLocale, snippet: string): DocsSearchHit {
  return {
    slug: section.slug,
    source: section.source,
    title: section.pageTitle,
    url: pageUrl(section.source, locale, section.slug),
    section: section.headingPath.join(" > "),
    anchor: section.anchor,
    snippet,
  };
}

async function unifiedDocsDeps(): Promise<UnifiedDocsDeps> {
  const { getDocsChunkRepo, getDocsSemanticIndexDispatcher, getRetrievalQueryEmbedder } = await import("@/core/di");
  const dispatcher = getDocsSemanticIndexDispatcher();
  return {
    repo: getDocsChunkRepo(),
    embed: getRetrievalQueryEmbedder(),
    ranker: env.APP_MODE === "demo" ? undefined : currentSectionRanker("docs"),
    scheduleIndexing: (buildHash, seeded) => dispatcher.schedule(buildHash, seeded),
  };
}

export async function unifiedDocsSearchResult(input: SearchDocsInput, deps: UnifiedDocsDeps) {
  const { pages, total, chosen } = await unifiedDocsSearch(input, deps);
  const results = pages.map(({ section, snippet }) => docsSearchHit(section, input.locale, snippet));
  const text =
    chosen && results.length > 0
      ? rankedDocsSearchText(results, total, chosen, input.query, input.locale)
      : compactDocsSearchText(results, total);
  return { text, structuredContent: { results, total } };
}

export async function searchDocs(input: SearchDocsInput) {
  return unifiedDocsSearchResult(input, await unifiedDocsDeps());
}

export async function searchDocsHits(query: string, locale: DocsLocale, source: DocsSource) {
  return (await unifiedDocsSearchResult({ query, locale, source }, await unifiedDocsDeps())).structuredContent.results;
}

export async function unifiedDocsPageResult(input: GetDocsPageInput, deps: UnifiedDocsDeps) {
  if (input.anchor !== undefined) return docsPageResult(input);
  const page = input.query ? getDocsPageRaw(input.slug, input.locale, input.source) : null;
  if (!page || !input.query) return docsPageResult(input);
  const excerpt = await unifiedDocsExcerpt(
    { source: input.source, locale: input.locale, slug: page.slug },
    input.query,
    deps,
  );
  return docsPageResult(input, excerpt);
}

export async function getDocsPage(input: GetDocsPageInput) {
  if (input.anchor !== undefined || !input.query) return docsPageResult(input);
  return unifiedDocsPageResult(input, await unifiedDocsDeps());
}

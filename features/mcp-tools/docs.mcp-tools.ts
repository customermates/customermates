import { z } from "zod";

import { mcpMessageFailure } from "./utils";

import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

import {
  buildSectionIndex,
  docsExcerpt,
  docsStemmerForLocale,
  rankPages,
  scoreSection,
  searchSections,
  sectionExcerpt,
  slugifyHeading,
  type DocsSection,
  type DocsSectionIndex,
} from "./docs-retrieval";
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
import { currentSectionRanker, type SectionRanker } from "@/core/retrieval/retrieval-context";
import { RetrievalStopwatch } from "@/core/retrieval/retrieval-pipeline";
import { selectRetrievalPipeline } from "@/core/retrieval/retrieval-selection";

export { getDocsPageRaw, listDocsSlugs } from "./docs-manifest";

const [firstDocsLocale, ...otherDocsLocales] = CONTENT_LOCALES;
const docsLocaleList = CONTENT_LOCALES.join(", ");
const docsLocaleSchema = z
  .enum([firstDocsLocale, ...otherDocsLocales])
  .default(DEFAULT_LOCALE)
  .describe("Documentation language");

const indexCache = new Map<string, DocsSectionIndex>();

function buildIndex(source: DocsSource, locale: DocsLocale): DocsSectionIndex {
  const cacheKey = `${source}:${locale}`;
  const cached = indexCache.get(cacheKey);
  if (cached) return cached;

  const index = buildSectionIndex(docsCorpusSections(source, locale), docsStemmerForLocale(locale));
  indexCache.set(cacheKey, index);
  return index;
}

const SEARCH_SNIPPET_CHARS = 240;

function sectionSnippet(section: DocsSection, query: string, locale: DocsLocale): string {
  const heading = section.headingPath.at(-1);
  const text = sectionExcerpt(
    { ...section, headingPath: [] },
    query,
    SEARCH_SNIPPET_CHARS,
    docsStemmerForLocale(locale),
  )
    .replace(/\s+/g, " ")
    .trim();
  return heading ? `${heading}: ${text}` : text;
}

const DocsSearchHitSchema = z.object({
  slug: z.string(),
  source: z.enum(["docs", "api"]),
  title: z.string(),
  url: z.string(),
  section: z.string().describe("Heading path of the best matching section, joined by ' > '"),
  anchor: z.string().describe("Heading anchor of that section; pass it to get_docs_page as query context"),
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
  const sources: DocsSource[] = source === "all" ? ["docs", "api"] : [source];
  const hits = sources.flatMap((s) => searchSections(buildIndex(s, locale), query, 40));
  const pages = rankPages(hits);

  const results = pages.slice(0, 5).map((page) => ({
    slug: page.slug,
    source: page.source as DocsSource,
    title: page.best.section.pageTitle,
    url: pageUrl(page.source as DocsSource, locale, page.slug),
    section: page.best.section.headingPath.join(" > "),
    anchor: page.best.section.anchor,
    snippet: sectionSnippet(page.best.section, query, locale),
  }));

  return { results, total: pages.length };
}

const PAGE_EXCERPT_CHARS = 1_400;

const PAGE_EXCERPT_SECONDARY_WEIGHT = 0.8;

const LINK_LINE_START = /^\*\*Link:\*\*/m;

export function relevantDocsExcerpt(
  page: { source: DocsSource; locale: DocsLocale; slug: string },
  query: string,
  preferredAnchor?: string,
): string {
  const index = buildIndex(page.source, page.locale);
  const own = index.sections.filter((section) => section.slug === page.slug);
  const target = slugifyHeading(query);
  const preferred = (section: DocsSection) =>
    preferredAnchor !== undefined && section.anchor === preferredAnchor ? 1 : 0;
  const named = (section: DocsSection) =>
    target.length > 0 && (section.anchor === target || slugifyHeading(section.headingPath.at(-1) ?? "") === target)
      ? 1
      : 0;
  const ranked = own
    .map((section) => ({ section, score: scoreSection(index, section, query) }))
    .filter((hit) => hit.score > 0 || named(hit.section) === 1 || preferred(hit.section) === 1)
    .sort(
      (left, right) =>
        preferred(right.section) - preferred(left.section) ||
        named(right.section) - named(left.section) ||
        right.score - left.score ||
        left.section.order - right.section.order,
    );
  if (ranked.length === 0) {
    return own
      .map((section) => section.text)
      .join("\n\n")
      .slice(0, PAGE_EXCERPT_CHARS)
      .trim();
  }

  const stemmer = docsStemmerForLocale(page.locale);
  const [first, second] = ranked;
  const secondLinks = !LINK_LINE_START.test(first.section.text);
  const whole = sectionExcerpt(first.section, query, Number.POSITIVE_INFINITY, stemmer);
  if (whole.length <= PAGE_EXCERPT_CHARS) {
    const room = PAGE_EXCERPT_CHARS - whole.length - 2;
    const secondary = second && room > 40 ? sectionExcerpt(second.section, query, room, stemmer, secondLinks) : "";
    return [whole, secondary.length <= room ? secondary : ""].filter((part) => part.length > 40).join("\n\n");
  }
  return docsExcerpt(
    [
      { section: first.section, keepLinkLines: true, lead: true },
      ...(second
        ? [{ section: second.section, weight: PAGE_EXCERPT_SECONDARY_WEIGHT, keepLinkLines: secondLinks }]
        : []),
    ],
    query,
    PAGE_EXCERPT_CHARS,
    stemmer,
  );
}

function compactDocsSearchText(results: DocsSearchHit[], total: number): string {
  if (results.length === 0) return "matches: none\ntotal=0\nhint: Try broader terms or source=all.";

  const best = results[0];
  const matches = results.map(({ slug, source, anchor }) => `${source}:${slug}#${anchor}`).join("\n");
  const prefix = `matches:\n${matches}\ntotal=${total}\nbest=${best.url}\nsnippet=`;
  const available = Math.max(0, 500 - prefix.length);
  return `${prefix}${best.snippet.slice(0, available)}`;
}

export const DOCS_RERANK_CANDIDATES = 20;
export const DOCS_RERANK_EXCERPT_CHARS = 1_400;

type DocsRerankCandidate = { id: number; section: DocsSection };

export type SearchDocsInput = { query: string; locale: DocsLocale; source: "docs" | "api" | "all" };

function topSectionCandidates(
  index: DocsSectionIndex,
  query: string,
  limit = DOCS_RERANK_CANDIDATES,
): DocsRerankCandidate[] {
  return index.sections
    .map((section, id) => ({ id, section, score: scoreSection(index, section, query) }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ id, section }) => ({ id, section }));
}

export function docsRerankExcerpt(section: DocsSection, chars = DOCS_RERANK_EXCERPT_CHARS): string {
  return `## ${section.headingPath.join(" > ")}\n${section.text}`.slice(0, chars);
}

export function keywordDocsSearch(input: SearchDocsInput) {
  const { results, total } = searchDocsRaw(input.query, input.locale, input.source);
  return { text: compactDocsSearchText(results, total), structuredContent: { results, total } };
}

const DOCS_RANK_TOP_PAGES = 5;
const DOCS_RANK_RETURNED = 3;
const DOCS_RANK_MAX_CANDIDATES = 120;
const DOCS_RANK_SECONDARY_EXCERPT_CHARS = 400;

export type DocsRankCandidate = DocsRerankCandidate & { titleOnly: boolean };

export type DocsSectionRanker = SectionRanker;

export function docsRankCandidates(query: string, locale: DocsLocale): DocsRankCandidate[] {
  const index = buildIndex("docs", locale);
  const lexical = topSectionCandidates(index, query);
  const lexicalIds = new Set(lexical.map(({ id }) => id));
  const topPages = new Set(
    rankPages(searchSections(index, query, 40))
      .slice(0, DOCS_RANK_TOP_PAGES)
      .map((page) => `${page.source}:${page.slug}`),
  );
  const titles = index.sections.flatMap((section, id) =>
    !lexicalIds.has(id) && topPages.has(`${section.source}:${section.slug}`) ? [{ id, section, titleOnly: true }] : [],
  );
  const candidates = [...lexical.map((candidate) => ({ ...candidate, titleOnly: false })), ...titles];
  return candidates.slice(0, DOCS_RANK_MAX_CANDIDATES);
}

export function docsPageRankCandidates(page: { source: DocsSource; locale: DocsLocale; slug: string }) {
  const sections = buildIndex(page.source, page.locale).sections;
  const own: DocsRankCandidate[] = sections.flatMap((section, id) =>
    section.slug === page.slug ? [{ id, section, titleOnly: false }] : [],
  );
  return own.slice(0, DOCS_RANK_MAX_CANDIDATES);
}

async function rankedSections(
  query: string,
  candidates: readonly DocsRankCandidate[],
  rank: DocsSectionRanker,
): Promise<DocsSection[] | null> {
  if (candidates.length < 2) return null;
  let ids: number[] | null;
  try {
    ids = await rank(query, candidates);
  } catch {
    return null;
  }
  const chosen = [...new Set(ids ?? [])]
    .flatMap((id) => candidates.find((candidate) => candidate.id === id)?.section ?? [])
    .slice(0, DOCS_RANK_RETURNED);
  return chosen.length > 0 ? chosen : null;
}

function rankedDocsSearchText(results: DocsSearchHit[], total: number, chosen: readonly DocsSection[]): string {
  const matches = results.map(({ slug, source, anchor }) => `${source}:${slug}#${anchor}`).join("\n");
  const excerpts = chosen
    .map((section, index) =>
      docsRerankExcerpt(section, index === 0 ? DOCS_RERANK_EXCERPT_CHARS : DOCS_RANK_SECONDARY_EXCERPT_CHARS),
    )
    .join("\n\n");
  return `matches:\n${matches}\ntotal=${total}\nbest=${results[0].url}\nexcerpt=\n${excerpts}`;
}

export async function searchDocsRanked(input: SearchDocsInput, rank: DocsSectionRanker) {
  const keyword = keywordDocsSearch(input);
  if (input.source !== "docs") return keyword;
  const chosen = await rankedSections(input.query, docsRankCandidates(input.query, input.locale), rank);
  if (!chosen) return keyword;
  const chosenHits: DocsSearchHit[] = chosen.map((section) => ({
    slug: section.slug,
    source: "docs",
    title: section.pageTitle,
    url: pageUrl("docs", input.locale, section.slug),
    section: section.headingPath.join(" > "),
    anchor: section.anchor,
    snippet: sectionSnippet(section, input.query, input.locale),
  }));
  const chosenSlugs = new Set(chosen.map((section) => section.slug));
  const others = keyword.structuredContent.results.filter((hit) => !chosenSlugs.has(hit.slug));
  const results = [...chosenHits, ...others].slice(0, 5);
  const total = Math.max(keyword.structuredContent.total, new Set(results.map((hit) => hit.slug)).size);
  return { text: rankedDocsSearchText(results, total, chosen), structuredContent: { results, total } };
}

export const searchDocsTool = {
  name: "search_docs",
  title: "Search documentation",
  description:
    "Use this when you need to search the Customermates documentation (product guides and REST API reference). " +
    `Required: query. Optional: locale (one of: ${docsLocaleList}; default ${DEFAULT_LOCALE}), source (one of: docs, api, all; default docs). ` +
    "Returns ranked pages with the best section of each (slug#anchor), then the best page's url and its snippet in text, plus up to 5 full matches as structured content. " +
    "App routes in a snippet, such as `/company/subscription`, are relative: prefix them with the origin of the match's url (best= in text); that origin is the instance's configured BASE_URL. " +
    "Then read the best page with get_docs_page and the same question as query; if it does not answer, read the next page.",
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
  markdown: z.string().describe("The focused excerpt when query was passed, otherwise the full page"),
  excerpt: z.boolean().describe("True when markdown is a query-focused excerpt rather than the full page"),
});

export const getDocsPageTool = {
  name: "get_docs_page",
  title: "Get documentation page",
  description:
    "Use this when you need one Customermates documentation page as markdown, with its canonical URL. " +
    "App routes in the markdown, such as `/company/subscription`, are relative: prefix them with the origin of url; that origin is the instance's configured BASE_URL. " +
    `Required: slug (from search_docs). Optional: locale (one of: ${docsLocaleList}; default ${DEFAULT_LOCALE}), source (one of: docs, api; default docs). ` +
    "Pass query with the exact detail you need to get a bounded excerpt; omit it only for the full page. " +
    "An unknown slug returns the valid slugs.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  outputSchema: GetDocsPageOutputSchema,
  inputSchema: z.object({
    slug: z.string().min(1).describe("Docs page slug, e.g. 'quickstart' or 'mcp' (the MCP tool catalog is on 'mcp')"),
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
  execute: (input: GetDocsPageInput) => getDocsPage(input),
};

export type GetDocsPageInput = { slug: string; query?: string; locale: DocsLocale; source: DocsSource };

export function docsPageResult(
  { slug, query, locale, source }: GetDocsPageInput,
  preferredAnchor?: string,
  focused?: (page: { source: DocsSource; locale: DocsLocale; slug: string }, query: string) => string,
) {
  const page = getDocsPageRaw(slug, locale, source);

  if (!page) {
    const validSlugs = listDocsSlugs(locale, source).join(", ");
    return mcpMessageFailure(`Unknown ${source} page "${slug}" for locale "${locale}". Valid slugs: ${validSlugs}`);
  }

  if (query) {
    const excerpt = focused
      ? focused({ source, locale, slug: page.slug }, query)
      : relevantDocsExcerpt({ source, locale, slug: page.slug }, query, preferredAnchor);
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

export async function getDocsPageRanked(input: GetDocsPageInput, rank: DocsSectionRanker) {
  const page = input.query ? getDocsPageRaw(input.slug, input.locale, input.source) : null;
  if (!page || !input.query) return docsPageResult(input);
  const candidates = docsPageRankCandidates({ source: input.source, locale: input.locale, slug: page.slug });
  const chosen = await rankedSections(input.query, candidates, rank);
  return docsPageResult(input, chosen?.[0]?.anchor);
}

function docsSearchHit(section: DocsSection, locale: DocsLocale, snippet: string): DocsSearchHit {
  return {
    slug: section.slug,
    source: section.source as DocsSource,
    title: section.pageTitle,
    url: pageUrl(section.source as DocsSource, locale, section.slug),
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
    scheduleIndexing: (buildHash) => dispatcher.schedule(buildHash),
  };
}

async function legacyDocsRetrieval<T>(run: (rank: DocsSectionRanker | undefined) => T | Promise<T>): Promise<T> {
  const stopwatch = new RetrievalStopwatch("docs", "legacy");
  const rank = currentSectionRanker("docs");
  stopwatch.rerank = rank ? "used" : "unavailable";
  try {
    return await run(rank);
  } finally {
    stopwatch.finish();
  }
}

export async function unifiedDocsSearchResult(input: SearchDocsInput, deps: UnifiedDocsDeps) {
  const { pages, total, chosen } = await unifiedDocsSearch(input, deps);
  const results = pages.map(({ section, snippet }) => docsSearchHit(section, input.locale, snippet));
  const text =
    chosen && results.length > 0 ? rankedDocsSearchText(results, total, chosen) : compactDocsSearchText(results, total);
  return { text, structuredContent: { results, total } };
}

export async function searchDocs(input: SearchDocsInput) {
  if (selectRetrievalPipeline() === "legacy")
    return legacyDocsRetrieval((rank) => (rank ? searchDocsRanked(input, rank) : keywordDocsSearch(input)));
  return unifiedDocsSearchResult(input, await unifiedDocsDeps());
}

export async function searchDocsHits(query: string, locale: DocsLocale, source: DocsSource) {
  if (selectRetrievalPipeline() === "legacy") return searchDocsRaw(query, locale, source).results;
  return (await unifiedDocsSearchResult({ query, locale, source }, await unifiedDocsDeps())).structuredContent.results;
}

export async function unifiedDocsPageResult(input: GetDocsPageInput, deps: UnifiedDocsDeps) {
  const page = input.query ? getDocsPageRaw(input.slug, input.locale, input.source) : null;
  if (!page || !input.query) return docsPageResult(input);
  const excerpt = await unifiedDocsExcerpt(
    { source: input.source, locale: input.locale, slug: page.slug },
    input.query,
    deps,
  );
  return docsPageResult(input, undefined, () => excerpt);
}

export async function getDocsPage(input: GetDocsPageInput) {
  if (!input.query) return docsPageResult(input);
  if (selectRetrievalPipeline() === "legacy")
    return legacyDocsRetrieval((rank) => (rank ? getDocsPageRanked(input, rank) : docsPageResult(input)));
  return unifiedDocsPageResult(input, await unifiedDocsDeps());
}

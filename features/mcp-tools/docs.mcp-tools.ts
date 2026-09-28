import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";

import rawManifest from "@/generated/raw-docs-manifest.json";

import { mcpMessageFailure } from "./utils";

import { env } from "@/env";
import { generateOpenApiSpec } from "@/core/openapi/openapi-spec";
import { DOCS_API_KEY_PLACEHOLDER, getMcpInstallSnippet, type McpTool } from "@/features/docs/mcp-install-snippet";
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
  splitSections,
  unwrapDocsComponents,
  type DocsSection,
  type DocsSectionIndex,
} from "./docs-retrieval";

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

const manifest = rawManifest as Manifest;
const indexCache = new Map<string, DocsSectionIndex>();
const pageCache = new Map<string, string>();

function stripFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, "");
}

function expandSnippet(tool: string): string {
  return getMcpInstallSnippet(tool as McpTool, DOCS_API_KEY_PLACEHOLDER, env.BASE_URL);
}

const API_PAGE_LINE =
  /^<APIPage\s[^>]*\b(operations|webhooks)=\{\[\{"(?:path|name)":"([^"]+)","method":"([a-z]+)"\}\]\}\s*\/>[ \t]*$/gm;

type SpecSchema = { $ref?: string; const?: string; enum?: string[]; properties?: Record<string, SpecSchema> };
type RawDocsSpec = {
  servers?: { url: string }[];
  webhooks?: Record<string, { post?: { requestBody?: { content?: Record<string, { schema?: SpecSchema }> } } }>;
  components?: { schemas?: Record<string, SpecSchema> };
};

let rawDocsSpec: RawDocsSpec | undefined;

function webhookEventName(spec: RawDocsSpec, name: string): string {
  const schema = spec.webhooks?.[name]?.post?.requestBody?.content?.["application/json"]?.schema;
  const resolved = schema?.$ref ? spec.components?.schemas?.[schema.$ref.replace("#/components/schemas/", "")] : schema;
  const event = resolved?.properties?.event;
  return event?.const ?? event?.enum?.[0] ?? name;
}

function expandApiPage(slug: string, markdown: string): string {
  return markdown.replace(API_PAGE_LINE, (_, kind: string, target: string, method: string) => {
    rawDocsSpec ??= generateOpenApiSpec() as RawDocsSpec;
    const restServerPath = rawDocsSpec.servers?.[0]?.url ?? "";
    const spec = `\`${restServerPath}/v1/openapi\``;
    const verb = method.toUpperCase();
    return kind === "webhooks"
      ? `**Webhook:** \`${webhookEventName(rawDocsSpec, target)}\`, sent as \`${verb}\` to your webhook URL, operationId \`${slug}\`. Payload schema: ${spec}.`
      : `**Endpoint:** \`${verb} ${restServerPath}${target}\`, operationId \`${slug}\`. Parameters and schemas: ${spec}.`;
  });
}

function pageMarkdown(source: DocsSource, locale: DocsLocale, slug: string, page: ManifestPage): string {
  const cacheKey = `${source}:${locale}:${slug}`;
  const cached = pageCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const content = stripFrontmatter(page.content);
  const markdown = unwrapDocsComponents(source === "api" ? expandApiPage(slug, content) : content, expandSnippet);
  pageCache.set(cacheKey, markdown);
  return markdown;
}

function pageSections(source: DocsSource, locale: DocsLocale, slug: string, page: ManifestPage): DocsSection[] {
  return splitSections({ slug, source, pageTitle: page.title, markdown: pageMarkdown(source, locale, slug, page) });
}

function buildIndex(source: DocsSource, locale: DocsLocale): DocsSectionIndex {
  const cacheKey = `${source}:${locale}`;
  const cached = indexCache.get(cacheKey);
  if (cached) return cached;

  const sections = Object.entries(manifest[source]?.[locale] ?? {}).flatMap(([slug, page]) =>
    pageSections(source, locale, slug, page),
  );
  const index = buildSectionIndex(sections, docsStemmerForLocale(locale));
  indexCache.set(cacheKey, index);
  return index;
}

function pageUrl(source: DocsSource, locale: DocsLocale, slug: string): string {
  if (source === "api") return `${env.BASE_URL}/${locale}/docs/openapi/${slug}`;
  return slug === "intro-page" ? `${env.BASE_URL}/${locale}/docs` : `${env.BASE_URL}/${locale}/docs/${slug}`;
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

export function listDocsSlugs(locale: DocsLocale, source: DocsSource): string[] {
  return Object.keys(manifest[source]?.[locale] ?? {}).sort();
}

function compactDocsSearchText(results: DocsSearchHit[], total: number): string {
  if (results.length === 0) return "matches: none\ntotal=0\nhint: Try broader terms or source=all.";

  const best = results[0];
  const matches = results.map(({ slug, source, anchor }) => `${source}:${slug}#${anchor}`).join("\n");
  const prefix = `matches:\n${matches}\ntotal=${total}\nbest=${best.url}\nsnippet=`;
  const available = Math.max(0, 500 - prefix.length);
  return `${prefix}${best.snippet.slice(0, available)}`;
}

export function getDocsPageRaw(
  slug: string,
  locale: DocsLocale,
  source: DocsSource,
): { slug: string; title: string; description: string; url: string; markdown: string } | null {
  const normalized = normalizeSlug(slug);
  const pages = manifest[source]?.[locale];
  const page = pages && Object.hasOwn(pages, normalized) ? pages[normalized] : undefined;
  if (!page) return null;

  const markdown = pageMarkdown(source, locale, normalized, page);

  return {
    slug: normalized,
    title: page.title,
    description: page.description,
    url: pageUrl(source, locale, normalized),
    markdown,
  };
}

export const DOCS_RERANK_CANDIDATES = 20;
export const DOCS_RERANK_EXCERPT_CHARS = 1_400;

export type DocsRerankCandidate = { id: number; section: DocsSection };

export type SearchDocsInput = { query: string; locale: DocsLocale; source: "docs" | "api" | "all" };

export function topSectionCandidates(
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

function keywordDocsSearch(input: SearchDocsInput) {
  const { results, total } = searchDocsRaw(input.query, input.locale, input.source);
  return { text: compactDocsSearchText(results, total), structuredContent: { results, total } };
}

export const DOCS_RANK_TOP_PAGES = 5;
export const DOCS_RANK_RETURNED = 3;
export const DOCS_RANK_MAX_CANDIDATES = 120;
export const DOCS_RANK_SECONDARY_EXCERPT_CHARS = 400;

export type DocsRankCandidate = DocsRerankCandidate & { titleOnly: boolean };

export type DocsSectionRanker = (query: string, candidates: readonly DocsRankCandidate[]) => Promise<number[] | null>;

function withTopPageTitles(index: DocsSectionIndex, query: string, ranked: readonly DocsRerankCandidate[]) {
  const rankedIds = new Set(ranked.map(({ id }) => id));
  const topPages = new Set(
    rankPages(searchSections(index, query, 40))
      .slice(0, DOCS_RANK_TOP_PAGES)
      .map((page) => `${page.source}:${page.slug}`),
  );
  const titles = index.sections.flatMap((section, id) =>
    !rankedIds.has(id) && topPages.has(`${section.source}:${section.slug}`) ? [{ id, section, titleOnly: true }] : [],
  );
  const candidates = [...ranked.map((candidate) => ({ ...candidate, titleOnly: false })), ...titles];
  return candidates.slice(0, DOCS_RANK_MAX_CANDIDATES);
}

export function docsRankCandidates(query: string, locale: DocsLocale): DocsRankCandidate[] {
  const index = buildIndex("docs", locale);
  return withTopPageTitles(index, query, topSectionCandidates(index, query));
}

export const DOCS_HYBRID_KEYWORD_CANDIDATES = 10;
export const DOCS_HYBRID_EMBEDDING_CANDIDATES = 10;

export type DocsEmbeddingSearch = (query: string, locale: DocsLocale) => Promise<readonly number[] | null>;

export function docsEmbeddingSections(locale: DocsLocale): readonly DocsSection[] {
  return buildIndex("docs", locale).sections;
}

export function hybridSectionIds(keywordIds: readonly number[], embeddingIds: readonly number[]): number[] {
  const chosen: number[] = [];
  const add = (id: number | undefined) => {
    if (id !== undefined && !chosen.includes(id) && chosen.length < DOCS_RERANK_CANDIDATES) chosen.push(id);
  };
  keywordIds.slice(0, DOCS_HYBRID_KEYWORD_CANDIDATES).forEach(add);
  embeddingIds.slice(0, DOCS_HYBRID_EMBEDDING_CANDIDATES).forEach(add);
  const keywordRest = keywordIds.slice(DOCS_HYBRID_KEYWORD_CANDIDATES);
  const embeddingRest = embeddingIds.slice(DOCS_HYBRID_EMBEDDING_CANDIDATES);
  for (let rank = 0; rank < Math.max(keywordRest.length, embeddingRest.length); rank += 1) {
    add(keywordRest[rank]);
    add(embeddingRest[rank]);
  }
  return chosen;
}

export function hybridDocsRankCandidates(
  query: string,
  locale: DocsLocale,
  embeddingIds: readonly number[],
): DocsRankCandidate[] {
  const index = buildIndex("docs", locale);
  const keywordIds = topSectionCandidates(index, query).map(({ id }) => id);
  const known = embeddingIds.filter((id) => Number.isInteger(id) && id >= 0 && id < index.sections.length);
  const ids = hybridSectionIds(keywordIds, known);
  return withTopPageTitles(
    index,
    query,
    ids.map((id) => ({ id, section: index.sections[id] })),
  );
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

export async function searchDocsRanked(
  input: SearchDocsInput,
  rank: DocsSectionRanker,
  embeddingSearch?: DocsEmbeddingSearch,
) {
  const embedded =
    input.source === "docs" && embeddingSearch
      ? embeddingSearch(input.query, input.locale).catch(() => null)
      : Promise.resolve(null);
  const keyword = keywordDocsSearch(input);
  if (input.source !== "docs") return keyword;
  const embeddingIds = await embedded;
  const candidates = embeddingIds
    ? hybridDocsRankCandidates(input.query, input.locale, embeddingIds)
    : docsRankCandidates(input.query, input.locale);
  const chosen = await rankedSections(input.query, candidates, rank);
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
  execute: (input: SearchDocsInput) => keywordDocsSearch(input),
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
  execute: (input: GetDocsPageInput) => docsPageResult(input),
};

export type GetDocsPageInput = { slug: string; query?: string; locale: DocsLocale; source: DocsSource };

function docsPageResult({ slug, query, locale, source }: GetDocsPageInput, preferredAnchor?: string) {
  const page = getDocsPageRaw(slug, locale, source);

  if (!page) {
    const validSlugs = listDocsSlugs(locale, source).join(", ");
    return mcpMessageFailure(`Unknown ${source} page "${slug}" for locale "${locale}". Valid slugs: ${validSlugs}`);
  }

  if (query) {
    const excerpt = relevantDocsExcerpt({ source, locale, slug: page.slug }, query, preferredAnchor);
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

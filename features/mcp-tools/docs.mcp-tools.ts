import { z } from "zod";

import type { ContentLocale } from "@/i18n/locale-registry";

import rawManifest from "@/generated/raw-docs-manifest.json";

import { mcpMessageFailure } from "./utils";

import { env } from "@/env";
import { getMcpInstallSnippet, type McpTool } from "@/features/docs/mcp-install-snippet";
import { CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

import {
  buildSectionIndex,
  docsStemmerForLocale,
  rankPages,
  scoreSectionForExcerpt,
  searchSections,
  sectionExcerpt,
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
  return getMcpInstallSnippet(tool as McpTool, "<your-api-key>", env.BASE_URL);
}

function pageMarkdown(source: DocsSource, locale: DocsLocale, slug: string, page: ManifestPage): string {
  const cacheKey = `${source}:${locale}:${slug}`;
  const cached = pageCache.get(cacheKey);
  if (cached !== undefined) return cached;
  const markdown = unwrapDocsComponents(stripFrontmatter(page.content), expandSnippet);
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
  return source === "docs"
    ? `${env.BASE_URL}/${locale}/docs/${slug}`
    : `${env.BASE_URL}/${locale}/docs/openapi/${slug}`;
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

export function relevantDocsExcerpt(
  page: { source: DocsSource; locale: DocsLocale; slug: string },
  query: string,
): string {
  const index = buildIndex(page.source, page.locale);
  const own = index.sections.filter((section) => section.slug === page.slug);
  const ranked = own
    .map((section) => ({ section, score: scoreSectionForExcerpt(index, section, query) }))
    .filter((hit) => hit.score > 0)
    .sort((left, right) => right.score - left.score || left.section.order - right.section.order);
  if (ranked.length === 0) {
    return own
      .map((section) => section.text)
      .join("\n\n")
      .slice(0, PAGE_EXCERPT_CHARS)
      .trim();
  }

  const stemmer = docsStemmerForLocale(page.locale);
  const primary = sectionExcerpt(ranked[0].section, query, PAGE_EXCERPT_CHARS, stemmer);
  const secondary = ranked[1]
    ? sectionExcerpt(ranked[1].section, query, Math.max(0, PAGE_EXCERPT_CHARS - primary.length), stemmer)
    : "";
  return [primary, secondary].filter((part) => part.length > 40).join("\n\n");
}

export function listDocsSlugs(locale: DocsLocale, source: DocsSource): string[] {
  return Object.keys(manifest[source]?.[locale] ?? {}).sort();
}

function compactDocsSearchText(results: DocsSearchHit[], total: number): string {
  if (results.length === 0) return "matches: none\ntotal=0\nhint: Try broader terms or source=all.";

  const best = results[0];
  const matches = results.map(({ slug, source, anchor }) => `${source}:${slug}#${anchor}`).join("\n");
  const prefix = `matches:\n${matches}\ntotal=${total}\nbest=${best.source}:${best.slug} ${best.title} > ${best.section}\nsnippet=`;
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

  const markdown = pageMarkdown(source, locale, normalized, page);

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
    "Returns a compact ranked page list with the best matching section per page (slug#anchor) and its snippet in text, plus up to 5 full {slug, source, title, url, section, anchor, snippet} matches as structured content. Follow up with get_docs_page for the best page, passing the same question as query.",
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
    `Required: slug (as returned by search_docs). Optional: locale (one of: ${docsLocaleList}; default ${DEFAULT_LOCALE}), source (one of: docs, api; default docs). ` +
    "Pass query with the exact detail you need to put a bounded relevant excerpt first and avoid repeated page reads; omit query only when you need the full page. " +
    "Unknown slugs return the full list of valid slugs. Use search_docs first when you don't know the slug.",
  annotations: { readOnlyHint: true, idempotentHint: true, destructiveHint: false, openWorldHint: false },
  outputSchema: GetDocsPageOutputSchema,
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

    if (query) {
      const excerpt = relevantDocsExcerpt({ source, locale, slug: page.slug }, query);
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
  },
};

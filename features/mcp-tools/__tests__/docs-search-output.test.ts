import type { RankableSection } from "@/core/retrieval/retrieval-context";
import type { DocsSection } from "../docs-sections";
import type { DocsChunkRepo, DocsSectionRow } from "../prisma-docs-chunk.repository";

import { describe, expect, it, vi } from "vitest";

import { CONTENT_LOCALES } from "@/i18n/locale-registry";

import { docsCorpusSections } from "../docs-manifest";
import { DOCS_RERANK_EXCERPT_CHARS, unifiedDocsPageResult, unifiedDocsSearchResult } from "../docs.mcp-tools";

const row = (section: DocsSection): DocsSectionRow => ({
  source: section.source,
  slug: section.slug,
  sectionOrder: section.order,
  chunkOrdinal: 0,
});

function repo(fullText: DocsSectionRow[]) {
  return {
    ensureCorpus: vi.fn(() => Promise.resolve()),
    fullTextSections: vi.fn(() => Promise.resolve(fullText)),
    semanticSections: vi.fn(() => Promise.resolve(null)),
    semanticIndexAvailable: vi.fn(() => Promise.resolve(false)),
    pendingEmbeddings: vi.fn(() => Promise.resolve([])),
    storeEmbeddings: vi.fn(() => Promise.resolve()),
  } satisfies DocsChunkRepo;
}

const deps = (
  rows: DocsSectionRow[],
  ranker?: (query: string, candidates: readonly RankableSection[]) => Promise<number[] | null>,
) => ({
  repo: repo(rows),
  embed: null,
  ranker,
});

const longest = (sections: DocsSection[], count: number) =>
  [...sections].sort((left, right) => right.text.length - left.text.length).slice(0, count);

const firstPerPage = (sections: DocsSection[]) =>
  sections.filter((section, index) => sections.findIndex((other) => other.slug === section.slug) === index);

describe("search_docs model-visible output", () => {
  it("answers an empty search with total=0 and a hint to broaden it", async () => {
    const result = await unifiedDocsSearchResult({ query: "zzqxvhjkwpl", locale: "en", source: "docs" }, deps([]));

    expect(result.text).toBe("matches: none\ntotal=0\nhint: Try broader terms or source=all.");
    expect(result.structuredContent).toEqual({ results: [], total: 0 });
  });

  it("bounds the compact text to 500 characters while structured content keeps every ranked page", async () => {
    const pages = firstPerPage(longest(docsCorpusSections("docs", "en"), 60)).slice(0, 5);
    const result = await unifiedDocsSearchResult(
      { query: "webhook", locale: "en", source: "docs" },
      deps(pages.map(row)),
    );
    const [best] = result.structuredContent.results;
    const heading = best.section.split(" > ").at(-1) ?? "";
    const snippet = result.text.slice(result.text.indexOf("\nsnippet=") + "\nsnippet=".length);

    expect(result.structuredContent.results).toHaveLength(pages.length);
    expect(result.text.length).toBeLessThanOrEqual(500);
    expect(result.text).toContain(`\nbest=${best.url}\n`);
    expect(result.text).toContain(`\ntotal=${result.structuredContent.total}\n`);
    expect(snippet.startsWith(`${heading}: `)).toBe(true);
    expect(snippet.length).toBeGreaterThan(heading.length + 40);
  });

  it("bounds the re-ranked excerpt to the full first section and short secondary sections", async () => {
    const chosen = firstPerPage(longest(docsCorpusSections("docs", "en"), 40)).slice(0, 3);
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      Promise.resolve(chosen.map((section) => candidates.findIndex((candidate) => candidate.section === section))),
    );
    const result = await unifiedDocsSearchResult(
      { query: "long sections", locale: "en", source: "docs" },
      deps(chosen.map(row), ranker),
    );
    const excerpt = result.text.slice(result.text.indexOf("\nexcerpt=\n") + "\nexcerpt=\n".length);
    const blocks = excerpt.split(/\n\n(?=## )/u);

    expect(blocks).toHaveLength(3);
    expect(blocks[0].length).toBeLessThanOrEqual(DOCS_RERANK_EXCERPT_CHARS);
    for (const block of blocks.slice(1)) expect(block.length).toBeLessThanOrEqual(400);
    expect(result.text.length).toBeLessThanOrEqual(
      result.text.indexOf("\nexcerpt=\n") + "\nexcerpt=\n".length + DOCS_RERANK_EXCERPT_CHARS + 2 * (400 + 2),
    );
  });

  it("marks each elided stretch of a snippet or an excerpt with exactly one ellipsis", async () => {
    for (const locale of CONTENT_LOCALES) {
      const sections = docsCorpusSections("docs", locale);
      for (let start = 0; start < sections.length; start += 5) {
        const batch = firstPerPage(sections.slice(start, start + 5));
        const result = await unifiedDocsSearchResult(
          { query: "anything", locale, source: "docs" },
          deps(batch.map(row)),
        );
        for (const hit of result.structuredContent.results) {
          expect(hit.snippet, `${locale} ${hit.slug}#${hit.anchor}`).not.toMatch(/…\s*…|…\.\.\.|\.\.\.…/u);
          expect(
            hit.snippet
              .replace(/\*\*[^*]+\*\*/gu, "")
              .replace(/^[^:]+: /u, "")
              .replace(/[…\s]/gu, ""),
          ).not.toBe("");
        }
      }
    }
    for (const [slug, query] of [
      ["app-records", "board view group by field"],
      ["api-keys", "rotate an api key"],
      ["concepts", "weighted pipeline value"],
    ] as const) {
      const own = docsCorpusSections("docs", "en").filter((section) => section.slug === slug);
      const page = await unifiedDocsPageResult(
        { slug, query, locale: "en", source: "docs" },
        deps(own.slice(0, 3).map(row)),
      );
      expect((page as { text: string }).text, query).not.toMatch(/…\s*\n\s*…|……/u);
    }
  });

  it("searches the German corpus and links German pages when locale is de", async () => {
    const german = firstPerPage(docsCorpusSections("docs", "de")).slice(0, 3);
    const result = await unifiedDocsSearchResult(
      { query: "Webhook", locale: "de", source: "docs" },
      deps(german.map(row)),
    );

    expect(result.structuredContent.results.map(({ slug }) => slug)).toEqual(german.map(({ slug }) => slug));
    expect(result.structuredContent.results.every(({ url }) => url.includes("/de/docs/"))).toBe(true);
    expect(result.structuredContent.results.map(({ section }) => section)).toEqual(
      german.map(({ headingPath }) => headingPath.join(" > ")),
    );
  });

  it("finds REST operations with source=api, links the OpenAPI reference, and scopes the search to it", async () => {
    const operations = firstPerPage(docsCorpusSections("api", "en")).slice(0, 3);
    const chunks = repo(operations.map(row));
    const ranker = vi.fn(() => Promise.resolve([0]));
    const result = await unifiedDocsSearchResult(
      { query: "contact", locale: "en", source: "api" },
      { repo: chunks, embed: null, ranker },
    );

    expect(operations.length).toBeGreaterThan(0);
    expect(
      result.structuredContent.results.every(
        ({ source, url }) => source === "api" && url.includes("/en/docs/openapi/"),
      ),
    ).toBe(true);
    expect(chunks.fullTextSections).toHaveBeenCalledWith(
      expect.objectContaining({ locale: "en", sources: ["api"] }),
      expect.anything(),
      expect.any(Number),
    );
    expect(ranker).not.toHaveBeenCalled();
  });
});

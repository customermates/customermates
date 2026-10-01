import type { DocsSection } from "../docs-sections";
import type { DocsCorpus } from "@/features/mcp-tools/docs-corpus";
import type { RankableSection } from "@/core/retrieval/retrieval-context";
import type { DocsChunkRepo } from "@/features/mcp-tools/docs-chunk.repo";
import type { DocsFullTextRow, DocsSemanticRow } from "../prisma-docs-chunk.repository";

import { describe, expect, it, vi } from "vitest";

import { collectRetrievalTimings } from "@/core/retrieval/retrieval-context";

import { docsCorpus } from "../docs-corpus";
import { docsCorpusSections } from "../docs-manifest";
import { unifiedDocsPageResult, unifiedDocsSearchResult } from "../docs.mcp-tools";

const webhooks = docsCorpusSections("docs", "en").filter((section) => section.slug === "webhooks");
const assistant = docsCorpusSections("docs", "en").filter((section) => section.slug === "app-assistant");
const signature = webhooks.find((section) => section.anchor === "how-do-i-verify-the-signature");
if (!signature) throw new Error("The webhooks page lost its signature section.");

const row = (
  section: Pick<DocsSection, "source" | "slug" | "order" | "anchor">,
  chunkOrdinal = 0,
): DocsFullTextRow & DocsSemanticRow => ({
  source: section.source,
  slug: section.slug,
  sectionOrder: section.order,
  chunkOrdinal,
  anchor: section.anchor,
  coverage: 1,
  similarity: 0.8,
});

function repo(fullText: DocsFullTextRow[], semantic: DocsSemanticRow[] | null = null) {
  return {
    ensureCorpus: vi.fn(() => Promise.resolve()),
    storedBuild: vi.fn((corpus: DocsCorpus) => Promise.resolve({ buildHash: corpus.buildHash, current: true })),
    fullTextSections: vi.fn((_scope: { slug?: string }) => Promise.resolve(fullText)),
    semanticSections: vi.fn(() => Promise.resolve(semantic)),
    semanticIndexAvailable: vi.fn(() => Promise.resolve(true)),
    semanticIndexComplete: vi.fn(() => Promise.resolve(true)),
    pendingEmbeddings: vi.fn(() => Promise.resolve([])),
    storeEmbeddings: vi.fn(() => Promise.resolve()),
  } satisfies DocsChunkRepo;
}

const INPUT = { query: "check that a webhook came from you", locale: "en" as const, source: "docs" as const };

describe("unified documentation search", () => {
  it.each(["api", "all"] as const)("applies the relevance and Jev abstention stages to %s", async (source) => {
    const section = docsCorpusSections("api", "en")[0];
    if (!section) throw new Error("REST reference corpus is empty");
    const chunks = repo([{ ...row(section), coverage: 0.2 }], [{ ...row(section), similarity: 0.7 }]);
    const ranker = vi.fn(() => Promise.resolve({ order: [0], abstained: true }));
    const result = await unifiedDocsSearchResult(
      { ...INPUT, source },
      { repo: chunks, embed: () => Promise.resolve({ vector: [1], model: "m" }), ranker },
    );
    expect(ranker).toHaveBeenCalledTimes(1);
    expect(result.structuredContent.results).toEqual([]);
  });

  it("fuses full-text and semantic sections, keeps the best section per page, and schedules indexing", async () => {
    const chunks = repo([row(webhooks[0]), row(assistant[0])], [row(signature), row(assistant[1])]);
    const scheduleIndexing = vi.fn(() => Promise.resolve());

    const { value, timings } = await collectRetrievalTimings(() =>
      unifiedDocsSearchResult(INPUT, {
        repo: chunks,
        embed: () => Promise.resolve({ vector: [1], model: "m" }),
        ranker: undefined,
        scheduleIndexing,
      }),
    );

    expect(chunks.storedBuild).toHaveBeenCalledWith(docsCorpus());
    expect(chunks.ensureCorpus).not.toHaveBeenCalled();
    expect(scheduleIndexing).toHaveBeenCalledWith(docsCorpus().buildHash, true);
    expect(value.structuredContent.results.map(({ slug }) => slug)).toEqual(["webhooks", "app-assistant"]);
    expect(value.text).not.toContain("\nexcerpt=\n");
    expect(timings).toEqual([expect.objectContaining({ corpus: "docs", embedding: "used", rerank: "unavailable" })]);
  });

  it("puts the re-ranked section first with its excerpt, offering complete sections of the top pages", async () => {
    let offered: readonly RankableSection[] = [];
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) => {
      offered = candidates;
      const choice = candidates.find((candidate) => candidate.section === signature);
      return Promise.resolve(choice ? { order: [choice.id], abstained: false } : null);
    });

    const result = await unifiedDocsSearchResult(INPUT, {
      repo: repo([row(assistant[0]), row(webhooks[0])]),
      embed: null,
      ranker,
    });

    expect(
      offered.filter((candidate) => candidate.section === assistant[0] || candidate.section === webhooks[0]),
    ).toHaveLength(2);
    expect(offered.find((candidate) => candidate.section === signature)?.section.text).toBe(signature.text);
    expect(result.structuredContent.results[0]).toMatchObject({ slug: "webhooks", anchor: signature.anchor });
    expect(result.text).toContain(`\nexcerpt=\n## ${signature.headingPath.join(" > ")}\n`);
  });

  it("fills unused ranking capacity with siblings of other fused parent pages", async () => {
    const sections = docsCorpusSections("docs", "en");
    const parents = [
      "app-records",
      "app-search",
      "concepts",
      "app-profile",
      "app-inbox",
      "self-hosting",
      "app-company",
    ].map((slug) => {
      const section = sections.find((value) => value.slug === slug);
      if (!section) throw new Error(`Missing fixture page ${slug}`);
      return section;
    });
    const expected = sections.find(
      (section) => section.slug === "app-company" && section.anchor === "how-does-the-role-editor-work",
    );
    if (!expected) throw new Error("Missing role editor fixture.");
    let offered: readonly RankableSection[] = [];
    const ranker = (_query: string, candidates: readonly RankableSection[]) => {
      offered = candidates;
      const candidate = candidates.find(({ section }) => section === expected);
      return Promise.resolve(candidate ? { order: [candidate.id], abstained: false } : null);
    };
    const result = await unifiedDocsSearchResult(
      { ...INPUT, query: "record access" },
      { repo: repo(parents.map((section) => row(section))), embed: null, ranker },
    );
    expect(offered.slice(0, parents.length).map(({ section }) => section)).toEqual(parents);
    expect(offered.length).toBeLessThanOrEqual(120);
    expect(offered.find(({ section }) => section === expected)?.section.text).toBe(expected.text);
    expect(result.structuredContent.results[0]).toMatchObject({ slug: "app-company", anchor: expected.anchor });
  });

  it("returns no pages below the relevance floor, and lets the re-rank reject a loose match", async () => {
    const embed = () => Promise.resolve({ vector: [1], model: "m" });
    const loose = (coverage: number, similarity: number) =>
      repo([{ ...row(webhooks[0]), coverage }], [{ ...row(signature), similarity }]);
    const abstaining = vi.fn(() => Promise.resolve({ order: [0], abstained: true }));

    const unrelated = await unifiedDocsSearchResult(INPUT, { repo: loose(0.2, 0.55), embed, ranker: abstaining });
    expect(unrelated.structuredContent).toEqual({ results: [], total: 0 });
    expect(unrelated.text).toContain("hint: ");
    expect(abstaining).not.toHaveBeenCalled();

    const rejected = await unifiedDocsSearchResult(INPUT, { repo: loose(0.2, 0.7), embed, ranker: abstaining });
    expect(rejected.structuredContent).toEqual({ results: [], total: 0 });
    expect(abstaining).toHaveBeenCalledTimes(1);

    const lexical = await unifiedDocsSearchResult(INPUT, { repo: loose(1, 0.55), embed, ranker: abstaining });
    expect(lexical.structuredContent.results.length).toBeGreaterThan(0);

    const unjudged = await unifiedDocsSearchResult(INPUT, { repo: loose(0.2, 0.55), embed: null, ranker: undefined });
    expect(unjudged.structuredContent.results.length).toBeGreaterThan(0);

    const indexing = loose(0.2, 0.55);
    indexing.semanticIndexComplete.mockResolvedValue(false);
    const partial = await unifiedDocsSearchResult(INPUT, { repo: indexing, embed, ranker: undefined });
    expect(partial.structuredContent.results.length).toBeGreaterThan(0);
  });

  it("keeps the fused order when the re-rank fails and does not re-rank an empty REST result", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("timeout")));
    const failed = await unifiedDocsSearchResult(INPUT, {
      repo: repo([row(assistant[0]), row(webhooks[0])]),
      embed: null,
      ranker: failing,
    });
    expect(failed.structuredContent.results.map(({ slug }) => slug)).toEqual(["app-assistant", "webhooks"]);
    expect(failed.text).not.toContain("\nexcerpt=\n");

    const api = vi.fn(() => Promise.resolve({ order: [0], abstained: false }));
    await unifiedDocsSearchResult({ ...INPUT, source: "api" }, { repo: repo([]), embed: null, ranker: api });
    expect(api).not.toHaveBeenCalled();
  });

  it("returns the section get_docs_page's re-rank prefers, and the page head when nothing matches", async () => {
    const last = webhooks.at(-1);
    if (!last) throw new Error("expected webhook sections");
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      Promise.resolve({ order: [candidates.findIndex((candidate) => candidate.section === last)], abstained: true }),
    );
    const page = { slug: "webhooks", query: "which events exist", locale: "en" as const, source: "docs" as const };

    const ranked = await unifiedDocsPageResult(page, { repo: repo([row(signature)]), embed: null, ranker });
    expect(typeof ranked === "object" && "structuredContent" in ranked && ranked.structuredContent).toMatchObject({
      excerpt: true,
    });
    expect((ranked as { text: string }).text.startsWith(`## ${last.headingPath.at(-1)}`)).toBe(true);

    const named = await unifiedDocsPageResult(page, { repo: repo([]), embed: null, ranker: undefined });
    expect((named as { text: string }).text.startsWith("## Which events exist?")).toBe(true);

    const empty = await unifiedDocsPageResult(
      { ...page, query: "zzqxv" },
      { repo: repo([]), embed: null, ranker: undefined },
    );
    expect((empty as { text: string }).text.startsWith(webhooks[0].text.slice(0, 40))).toBe(true);
  });

  it("searches in memory without seeding, and asks for the build to be indexed, while no documentation build is stored", async () => {
    const chunks = repo([row(webhooks[0])]);
    chunks.storedBuild.mockResolvedValue(null as never);
    const scheduleIndexing = vi.fn(() => Promise.resolve());

    const result = await unifiedDocsSearchResult(
      { query: "webhook signature", locale: "en", source: "docs" },
      { repo: chunks, embed: () => Promise.resolve({ vector: [1], model: "m" }), ranker: undefined, scheduleIndexing },
    );

    expect(result.structuredContent.results[0]).toMatchObject({ slug: "webhooks" });
    expect(chunks.fullTextSections).not.toHaveBeenCalled();
    expect(chunks.semanticSections).not.toHaveBeenCalled();
    expect(chunks.ensureCorpus).not.toHaveBeenCalled();
    expect(scheduleIndexing).toHaveBeenCalledWith(docsCorpus().buildHash, false);
  });

  it("uses the same unquoted compound alternatives while the local index is unavailable", async () => {
    const chunks = repo([]);
    chunks.storedBuild.mockResolvedValue(null as never);
    const dependencies = { repo: chunks, embed: null, ranker: undefined };
    const unquoted = await unifiedDocsSearchResult(
      { query: "custom-role", locale: "en", source: "docs" },
      dependencies,
    );
    expect(unquoted.structuredContent.results.some(({ slug }) => slug === "app-company")).toBe(true);
    const quoted = await unifiedDocsSearchResult(
      { query: '"custom-role"', locale: "en", source: "docs" },
      dependencies,
    );
    expect(quoted.structuredContent.results).toEqual([]);
  });

  it("reads the previous build's rows by anchor while the current build is being indexed", async () => {
    const moved = { ...row(signature), sectionOrder: signature.order + 40 };
    const vanished = { ...row(webhooks[0]), anchor: "a-section-this-build-removed" };
    const chunks = repo([vanished, moved]);
    chunks.storedBuild.mockResolvedValue({ buildHash: "previous-build", current: false } as never);
    const scheduleIndexing = vi.fn(() => Promise.resolve());

    const result = await unifiedDocsSearchResult(INPUT, {
      repo: chunks,
      embed: null,
      ranker: undefined,
      scheduleIndexing,
    });

    expect(chunks.fullTextSections).toHaveBeenCalledWith(
      expect.objectContaining({ buildHash: "previous-build" }),
      expect.anything(),
      expect.any(Number),
    );
    expect(result.structuredContent.results.map(({ slug, anchor }) => `${slug}#${anchor}`)).toEqual([
      `webhooks#${signature.anchor}`,
    ]);
    expect(scheduleIndexing).toHaveBeenCalledWith(docsCorpus().buildHash, false);
  });
});

describe("search and page section coherence", () => {
  it("uses the same global candidate set and chosen section for a page read instead of reranking only that page", async () => {
    const sections = docsCorpusSections("docs", "en");
    const overview = sections.find(
      (section) => section.slug === "app-company" && section.anchor === "what-lives-on-the-company-screen",
    );
    const destination = sections.find((section) => section.slug === "app-company" && section.anchor === "webhooks-tab");
    const unrelated = sections.find((section) => section.slug === "app-search");
    if (!overview || !destination || !unrelated) throw new Error("Missing section coherence fixtures.");
    const captured: (readonly RankableSection[])[] = [];
    const ranker = (_query: string, candidates: readonly RankableSection[]) => {
      captured.push(candidates);
      const global = candidates.some(({ section }) => section === unrelated);
      const chosen = candidates.find(({ section }) => section === (global ? overview : destination));
      return Promise.resolve(chosen ? { order: [chosen.id], abstained: false } : null);
    };
    const deps = { repo: repo([row(overview), row(destination), row(unrelated)]), embed: null, ranker };
    const query = "webhooks page URL";
    const result = await unifiedDocsSearchResult({ query, locale: "en", source: "docs" }, deps);
    const page = await unifiedDocsPageResult({ slug: "app-company", query, locale: "en", source: "docs" }, deps);
    expect(result.structuredContent.results[0]).toMatchObject({ slug: "app-company", anchor: overview.anchor });
    expect((page as { structuredContent: { markdown: string } }).structuredContent.markdown.split("\n")[0]).toContain(
      overview.headingPath.at(-1),
    );
    expect(captured).toHaveLength(2);
    expect(captured[1]).toEqual(captured[0]);
    expect(deps.repo.storedBuild).toHaveBeenCalledTimes(2);
  });

  it("falls back to the requested page when the global result names only another page", async () => {
    const chunks = repo([row(assistant[0])]);
    chunks.fullTextSections.mockImplementation((scope) =>
      Promise.resolve(scope.slug === "webhooks" ? [row(signature)] : [row(assistant[0])]),
    );
    const page = await unifiedDocsPageResult(
      { slug: "webhooks", query: "signature authenticity", locale: "en", source: "docs" },
      { repo: chunks, embed: null, ranker: undefined },
    );
    expect((page as { structuredContent: { markdown: string } }).structuredContent.markdown).toContain(
      signature.headingPath.at(-1),
    );
    expect(chunks.fullTextSections).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "webhooks" }),
      expect.anything(),
      expect.any(Number),
    );
  });
});

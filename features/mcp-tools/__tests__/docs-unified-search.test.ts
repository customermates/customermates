import type { RankableSection } from "@/core/retrieval/retrieval-context";
import type { DocsChunkRepo, DocsSectionRow } from "../prisma-docs-chunk.repository";

import { describe, expect, it, vi } from "vitest";

import { collectRetrievalTimings } from "@/core/retrieval/retrieval-context";

import { docsCorpus } from "../docs-corpus";
import { docsCorpusSections } from "../docs-manifest";
import { unifiedDocsPageResult, unifiedDocsSearchResult } from "../docs.mcp-tools";

const webhooks = docsCorpusSections("docs", "en").filter((section) => section.slug === "webhooks");
const assistant = docsCorpusSections("docs", "en").filter((section) => section.slug === "app-assistant");
const signature = webhooks.find((section) => section.anchor === "how-do-i-verify-the-signature");
if (!signature) throw new Error("The webhooks page lost its signature section.");

const row = (section: { source: string; slug: string; order: number }, chunkOrdinal = 0): DocsSectionRow => ({
  source: section.source,
  slug: section.slug,
  sectionOrder: section.order,
  chunkOrdinal,
});

function repo(fullText: DocsSectionRow[], semantic: DocsSectionRow[] | null = null) {
  return {
    ensureCorpus: vi.fn(() => Promise.resolve()),
    fullTextSections: vi.fn(() => Promise.resolve(fullText)),
    semanticSections: vi.fn(() => Promise.resolve(semantic)),
    semanticIndexAvailable: vi.fn(() => Promise.resolve(true)),
    pendingEmbeddings: vi.fn(() => Promise.resolve([])),
    storeEmbeddings: vi.fn(() => Promise.resolve()),
  } satisfies DocsChunkRepo;
}

const INPUT = { query: "check that a webhook came from you", locale: "en" as const, source: "docs" as const };

describe("unified documentation search", () => {
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

    expect(chunks.ensureCorpus).toHaveBeenCalledWith(docsCorpus());
    expect(scheduleIndexing).toHaveBeenCalledWith(docsCorpus().buildHash);
    expect(value.structuredContent.results.map(({ slug }) => slug)).toEqual(["webhooks", "app-assistant"]);
    expect(value.text).not.toContain("\nexcerpt=\n");
    expect(timings).toEqual([
      expect.objectContaining({ corpus: "docs", pipeline: "unified", embedding: "used", rerank: "unavailable" }),
    ]);
  });

  it("puts the re-ranked section first with its excerpt, offering title-only sections of the top pages", async () => {
    let offered: readonly RankableSection[] = [];
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) => {
      offered = candidates;
      const choice = candidates.find((candidate) => candidate.section === signature);
      return Promise.resolve(choice ? [choice.id] : null);
    });

    const result = await unifiedDocsSearchResult(INPUT, {
      repo: repo([row(assistant[0]), row(webhooks[0])]),
      embed: null,
      ranker,
    });

    expect(offered.filter((candidate) => !candidate.titleOnly)).toHaveLength(2);
    expect(offered.some((candidate) => candidate.titleOnly && candidate.section === signature)).toBe(true);
    expect(result.structuredContent.results[0]).toMatchObject({ slug: "webhooks", anchor: signature.anchor });
    expect(result.text).toContain(`\nexcerpt=\n## ${signature.headingPath.join(" > ")}\n`);
  });

  it("keeps the fused order when the re-rank fails and never re-ranks the REST reference", async () => {
    const failing = vi.fn(() => Promise.reject(new Error("timeout")));
    const failed = await unifiedDocsSearchResult(INPUT, {
      repo: repo([row(assistant[0]), row(webhooks[0])]),
      embed: null,
      ranker: failing,
    });
    expect(failed.structuredContent.results.map(({ slug }) => slug)).toEqual(["app-assistant", "webhooks"]);
    expect(failed.text).not.toContain("\nexcerpt=\n");

    const api = vi.fn(() => Promise.resolve([0]));
    await unifiedDocsSearchResult({ ...INPUT, source: "api" }, { repo: repo([]), embed: null, ranker: api });
    expect(api).not.toHaveBeenCalled();
  });

  it("returns the section get_docs_page's re-rank prefers, and the page head when nothing matches", async () => {
    const last = webhooks.at(-1);
    if (!last) throw new Error("expected webhook sections");
    const ranker = vi.fn((_query: string, candidates: readonly RankableSection[]) =>
      Promise.resolve([candidates.findIndex((candidate) => candidate.section === last)]),
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
});

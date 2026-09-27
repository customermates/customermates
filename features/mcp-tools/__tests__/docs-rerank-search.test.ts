import { describe, expect, it, vi } from "vitest";

import {
  DOCS_RERANK_CANDIDATES,
  DOCS_RERANK_EXCERPT_CHARS,
  docsRerankExcerpt,
  docsSectionCandidates,
  searchDocs,
  searchDocsRaw,
  searchDocsTool,
  type DocsRerankCandidate,
} from "../docs.mcp-tools";

const QUERY = "how do I check that a webhook call really came from you";
const INPUT = { query: QUERY, locale: "en" as const, source: "docs" as const };

function keywordResult() {
  return searchDocsTool.execute(INPUT);
}

function pickFrom(predicate: (candidate: DocsRerankCandidate) => boolean) {
  return vi.fn((_query: string, candidates: readonly DocsRerankCandidate[]) =>
    Promise.resolve(candidates.find(predicate)?.id ?? null),
  );
}

describe("docs search re-rank", () => {
  it("offers the keyword top sections as candidates, several per page", () => {
    const candidates = docsSectionCandidates(QUERY, "en", "docs");

    expect(candidates.length).toBeGreaterThan(1);
    expect(candidates.length).toBeLessThanOrEqual(DOCS_RERANK_CANDIDATES);
    expect(new Set(candidates.map((candidate) => candidate.section.slug)).size).toBeLessThan(candidates.length);
  });

  it("returns the chosen section by anchor as the excerpt and puts its page first", async () => {
    const keyword = searchDocsRaw(QUERY, "en", "docs");
    const target = docsSectionCandidates(QUERY, "en", "docs").find(
      (candidate) => candidate.section.slug !== keyword.results[0].slug,
    );
    if (!target) throw new Error("expected a candidate on another page");
    const rerank = pickFrom((candidate) => candidate.id === target.id);

    const result = await searchDocs(INPUT, rerank);

    expect(rerank).toHaveBeenCalledWith(QUERY, docsSectionCandidates(QUERY, "en", "docs"));
    expect(result.structuredContent.results[0]).toMatchObject({
      slug: target.section.slug,
      anchor: target.section.anchor,
      section: target.section.headingPath.join(" > "),
    });
    expect(result.structuredContent.results.filter((hit) => hit.slug === target.section.slug)).toHaveLength(1);
    expect(result.structuredContent.results.length).toBeLessThanOrEqual(5);
    expect(result.text).toContain(`\nbest=${result.structuredContent.results[0].url}\nexcerpt=\n`);
    expect(result.text.endsWith(docsRerankExcerpt(target.section))).toBe(true);
    expect(docsRerankExcerpt(target.section).length).toBeLessThanOrEqual(DOCS_RERANK_EXCERPT_CHARS);
    expect(docsRerankExcerpt(target.section).startsWith(`## ${target.section.headingPath.join(" > ")}\n`)).toBe(true);
  });

  it.each([
    ["no choice", vi.fn(() => Promise.resolve(null))],
    ["an unknown candidate", vi.fn(() => Promise.resolve(-1))],
    ["a failure", vi.fn(() => Promise.reject(new Error("timeout")))],
  ])("keeps today's keyword output on %s", async (_label, rerank) => {
    expect(await searchDocs(INPUT, rerank)).toEqual(keywordResult());
    expect(rerank).toHaveBeenCalledTimes(1);
  });

  it("leaves the REST reference and the mixed search to the keyword ranker", async () => {
    const rerank = vi.fn(() => Promise.resolve(0));

    expect(await searchDocs({ ...INPUT, source: "api" }, rerank)).toEqual(
      searchDocsTool.execute({ ...INPUT, source: "api" }),
    );
    expect(await searchDocs({ ...INPUT, source: "all" }, rerank)).toEqual(
      searchDocsTool.execute({ ...INPUT, source: "all" }),
    );
    expect(rerank).not.toHaveBeenCalled();
  });

  it("keeps the MCP tool synchronous and unranked for external clients", () => {
    const result = searchDocsTool.execute(INPUT);

    expect(result).not.toBeInstanceOf(Promise);
    expect(result.text).not.toContain("\nexcerpt=\n");
  });
});

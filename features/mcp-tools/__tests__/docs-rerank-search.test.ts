import { describe, expect, it, vi } from "vitest";

import {
  DOCS_RERANK_CANDIDATES,
  DOCS_RERANK_EXCERPT_CHARS,
  docsRankCandidates,
  docsRerankExcerpt,
  searchDocsRanked,
  searchDocsRaw,
  searchDocsTool,
  type DocsRankCandidate,
} from "../docs.mcp-tools";

const QUERY = "how do I check that a webhook call really came from you";
const INPUT = { query: QUERY, locale: "en" as const, source: "docs" as const };

function keywordResult() {
  return searchDocsTool.execute(INPUT);
}

function pickFrom(predicate: (candidate: DocsRankCandidate) => boolean) {
  return vi.fn((_query: string, candidates: readonly DocsRankCandidate[]) => {
    const chosen = candidates.find(predicate);
    return Promise.resolve(chosen ? [chosen.id] : null);
  });
}

describe("docs search re-rank", () => {
  it("offers the keyword top sections with excerpts first, several per page", () => {
    const lexical = docsRankCandidates(QUERY, "en").filter((candidate) => !candidate.titleOnly);

    expect(lexical.length).toBeGreaterThan(1);
    expect(lexical.length).toBeLessThanOrEqual(DOCS_RERANK_CANDIDATES);
    expect(new Set(lexical.map((candidate) => candidate.section.slug)).size).toBeLessThan(lexical.length);
  });

  it("returns the chosen section by anchor as the excerpt and puts its page first", async () => {
    const keyword = searchDocsRaw(QUERY, "en", "docs");
    const target = docsRankCandidates(QUERY, "en").find(
      (candidate) => !candidate.titleOnly && candidate.section.slug !== keyword.results[0].slug,
    );
    if (!target) throw new Error("expected a candidate on another page");
    const rank = pickFrom((candidate) => candidate.id === target.id);

    const result = await searchDocsRanked(INPUT, rank);

    expect(rank).toHaveBeenCalledWith(QUERY, docsRankCandidates(QUERY, "en"));
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
    ["an unknown candidate", vi.fn(() => Promise.resolve([-1]))],
    ["a failure", vi.fn(() => Promise.reject(new Error("timeout")))],
  ])("keeps today's keyword output on %s", async (_label, rank) => {
    expect(await searchDocsRanked(INPUT, rank)).toEqual(keywordResult());
    expect(rank).toHaveBeenCalledTimes(1);
  });

  it("leaves the REST reference and the mixed search to the keyword ranker", async () => {
    const rank = vi.fn(() => Promise.resolve([0]));

    expect(await searchDocsRanked({ ...INPUT, source: "api" }, rank)).toEqual(
      searchDocsTool.execute({ ...INPUT, source: "api" }),
    );
    expect(await searchDocsRanked({ ...INPUT, source: "all" }, rank)).toEqual(
      searchDocsTool.execute({ ...INPUT, source: "all" }),
    );
    expect(rank).not.toHaveBeenCalled();
  });

  it("keeps the MCP tool synchronous and unranked for external clients", () => {
    const result = searchDocsTool.execute(INPUT);

    expect(result).not.toBeInstanceOf(Promise);
    expect(result.text).not.toContain("\nexcerpt=\n");
  });
});

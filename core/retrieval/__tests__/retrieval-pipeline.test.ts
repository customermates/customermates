import type { RankableSection } from "../retrieval-context";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fullTextUnits } from "../full-text-query";
import { collectRetrievalTimings, currentSectionRanker, runWithSectionRanking } from "../retrieval-context";
import { fuseFullTextAndSemantic, fuseRankings, rerankSections, RetrievalStopwatch } from "../retrieval-pipeline";
import { selectRetrievalPipeline } from "../retrieval-selection";

afterEach(() => {
  vi.useRealTimers();
});

const candidate = (id: number): RankableSection => ({
  id,
  section: { pageTitle: `Page ${id}`, headingPath: [`Section ${id}`], text: `Text ${id}` },
  titleOnly: false,
});

describe("retrieval pipeline selection", () => {
  it("runs the unified pipeline everywhere except an explicit local benchmark override", () => {
    expect(selectRetrievalPipeline({})).toBe("unified");
    expect(selectRetrievalPipeline({ AGENT_BENCHMARK_RETRIEVAL: "legacy" })).toBe("unified");
    expect(selectRetrievalPipeline({ LOCAL_AGENT_BENCHMARK: "true" })).toBe("unified");
    expect(selectRetrievalPipeline({ LOCAL_AGENT_BENCHMARK: "true", AGENT_BENCHMARK_RETRIEVAL: "legacy" })).toBe(
      "legacy",
    );
    expect(
      selectRetrievalPipeline({ LOCAL_AGENT_BENCHMARK: "true", AGENT_BENCHMARK_RETRIEVAL: "legacy", VERCEL: "1" }),
    ).toBe("unified");
    expect(
      selectRetrievalPipeline({
        LOCAL_AGENT_BENCHMARK: "true",
        AGENT_BENCHMARK_RETRIEVAL: "legacy",
        VERCEL_ENV: "production",
      }),
    ).toBe("unified");
  });
});

describe("reciprocal-rank fusion", () => {
  it("pins identifier matches first and fuses the full-text and semantic lists", () => {
    expect(
      fuseRankings({
        pinned: ["pinned"],
        lists: [
          ["a", "b", "pinned", "c"],
          ["c", "b", "d"],
        ],
      }),
    ).toEqual(["pinned", "b", "c", "a", "d"]);
  });

  it("keeps the full-text order when no semantic list exists", () => {
    expect(fuseRankings({ lists: [["x", "y", "z"]] })).toEqual(["x", "y", "z"]);
  });
});

describe("full-text query units", () => {
  it("keeps phrases, marks a trailing word as a prefix and splits scripts without spaces into substrings", () => {
    expect(fullTextUnits('"office hours" onboard')).toEqual([
      { text: "office hours", phrase: true, prefix: false, substring: false },
      { text: "onboard", phrase: false, prefix: true, substring: false },
    ]);
    expect(fullTextUnits("onboard?")).toEqual([{ text: "onboard", phrase: false, prefix: false, substring: false }]);
    expect(fullTextUnits("退款申请").every((unit) => unit.substring)).toBe(true);
  });

  it("keeps the most distinctive words of a very long request", () => {
    const units = fullTextUnits(`${Array.from({ length: 40 }, (_, index) => `a${index}`).join(" ")} zephyr escalation`);
    expect(units).toHaveLength(32);
    expect(units.map((unit) => unit.text)).toEqual(expect.arrayContaining(["zephyr", "escalation"]));
  });
});

describe("full-text and semantic retrieval", () => {
  it("starts the full-text search and the query embedding together and fuses both", async () => {
    const started: string[] = [];
    let releaseFullText: (value: { keys: string[] }) => void = () => undefined;
    const fullText = vi.fn(() => {
      started.push("fullText");
      return new Promise<{ keys: string[] }>((resolve) => {
        releaseFullText = resolve;
      });
    });
    const embed = vi.fn(() => {
      started.push("embed");
      return Promise.resolve({ vector: [1, 0], model: "test" });
    });
    const semantic = vi.fn(() => Promise.resolve(["b", "c"]));
    const { value, timings } = await collectRetrievalTimings(async () => {
      const stopwatch = new RetrievalStopwatch("docs", "unified");
      const pending = fuseFullTextAndSemantic({ query: "q", stopwatch, fullText, embed, semantic });
      await Promise.resolve();
      expect(started.toSorted()).toEqual(["embed", "fullText"]);
      releaseFullText({ keys: ["a", "b"] });
      const fused = await pending;
      stopwatch.finish();
      return fused;
    });

    expect(value.ranked).toEqual(["b", "a", "c"]);
    expect(value.vector).toEqual({ vector: [1, 0], model: "test" });
    expect(timings).toEqual([expect.objectContaining({ corpus: "docs", pipeline: "unified", embedding: "used" })]);
  });

  it("falls back to full-text order when the embedding is slow, fails, or the index is unavailable", async () => {
    vi.useFakeTimers();
    const fullText = () => Promise.resolve({ keys: ["a", "b"] });
    const semantic = vi.fn(() => Promise.resolve(["z"]));
    const slow = new RetrievalStopwatch("wiki", "unified");
    const slowRun = fuseFullTextAndSemantic({
      query: "q",
      stopwatch: slow,
      fullText,
      embed: () => new Promise(() => undefined),
      semantic,
      embeddingWaitMs: 50,
    });
    await vi.advanceTimersByTimeAsync(60);
    expect((await slowRun).ranked).toEqual(["a", "b"]);
    expect(slow.embedding).toBe("timeout");
    vi.useRealTimers();

    const failing = new RetrievalStopwatch("wiki", "unified");
    const failed = await fuseFullTextAndSemantic({
      query: "q",
      stopwatch: failing,
      fullText,
      embed: () => Promise.reject(new Error("gateway")),
      semantic,
    });
    expect(failed.ranked).toEqual(["a", "b"]);
    expect(failing.embedding).toBe("unavailable");

    const noIndex = new RetrievalStopwatch("docs", "unified");
    const withoutIndex = await fuseFullTextAndSemantic({
      query: "q",
      stopwatch: noIndex,
      fullText,
      embed: () => Promise.resolve({ vector: [1], model: "m" }),
      semantic: () => Promise.resolve(null),
    });
    expect(withoutIndex).toMatchObject({ ranked: ["a", "b"], vector: null });
    expect(noIndex.embedding).toBe("unavailable");

    const none = new RetrievalStopwatch("docs", "unified");
    expect(
      (await fuseFullTextAndSemantic({ query: "q", stopwatch: none, fullText, embed: null, semantic })).ranked,
    ).toEqual(["a", "b"]);
    expect(none.embedding).toBe("none");
    expect(semantic).not.toHaveBeenCalled();
  });
});

describe("section re-rank", () => {
  it("returns only offered ids and falls back on a missing ranker, a failure, or an unknown choice", async () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const stopwatch = new RetrievalStopwatch("wiki", "unified");

    expect(
      await rerankSections({ query: "q", stopwatch, candidates, ranker: () => Promise.resolve([3, 99, 3, 1]) }),
    ).toEqual([3, 1]);
    expect(stopwatch.rerank).toBe("used");
    expect(await rerankSections({ query: "q", stopwatch, candidates, ranker: undefined })).toBeNull();
    expect(stopwatch.rerank).toBe("unavailable");
    expect(
      await rerankSections({ query: "q", stopwatch, candidates, ranker: () => Promise.reject(new Error("504")) }),
    ).toBeNull();
    expect(stopwatch.rerank).toBe("failed");
    expect(await rerankSections({ query: "q", stopwatch, candidates, ranker: () => Promise.resolve([42]) })).toBeNull();
    expect(stopwatch.rerank).toBe("failed");
  });

  it("exposes the request's section rankers only inside their scope", async () => {
    const ranker = vi.fn(() => Promise.resolve(null));
    expect(currentSectionRanker("docs")).toBeUndefined();
    const seen = await runWithSectionRanking(
      (corpus) => (corpus === "wiki" ? ranker : undefined),
      () => Promise.resolve([currentSectionRanker("wiki"), currentSectionRanker("docs")]),
    );
    expect(seen).toEqual([ranker, undefined]);
    expect(currentSectionRanker("wiki")).toBeUndefined();
  });
});

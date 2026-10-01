import type { RankableSection } from "../retrieval-context";

import { afterEach, describe, expect, it, vi } from "vitest";

import { fullTextUnits, fullTextUnitsCte, replaceQueryWords, typoCandidates } from "../full-text-query";
import { collectRetrievalTimings, currentSectionRanker, runWithSectionRanking } from "../retrieval-context";
import {
  fuseFullTextAndSemantic,
  fuseRankings,
  keepsResults,
  relevanceVerdict,
  rerankSections,
  RETRIEVAL_EMBEDDING_WAIT_MS,
  RETRIEVAL_RELEVANCE_FLOOR,
} from "../retrieval-pipeline";
import { QueryEmbeddingWait } from "@/core/retrieval/query-embedding-wait";
import { RetrievalStopwatch } from "@/core/retrieval/retrieval-stopwatch";

afterEach(() => {
  vi.useRealTimers();
});

const candidate = (id: number): RankableSection => ({
  id,
  section: { pageTitle: `Page ${id}`, headingPath: [`Section ${id}`], text: `Text ${id}` },
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
    let releaseFullText: (value: { keys: string[]; coverage: number }) => void = () => undefined;
    const fullText = vi.fn(() => {
      started.push("fullText");
      return new Promise<{ keys: string[]; coverage: number }>((resolve) => {
        releaseFullText = resolve;
      });
    });
    const embed = vi.fn(() => {
      started.push("embed");
      return Promise.resolve({ vector: [1, 0], model: "test" });
    });
    const semantic = vi.fn(() => Promise.resolve({ keys: ["b", "c"], similarity: 0.8 }));
    const { value, timings } = await collectRetrievalTimings(async () => {
      const stopwatch = new RetrievalStopwatch("docs");
      const pending = fuseFullTextAndSemantic({ query: "q", stopwatch, fullText, embed, semantic });
      await Promise.resolve();
      expect(started.toSorted()).toEqual(["embed", "fullText"]);
      releaseFullText({ keys: ["a", "b"], coverage: 1 });
      const fused = await pending;
      stopwatch.finish();
      return fused;
    });

    expect(value.ranked).toEqual(["b", "a", "c"]);
    expect(value.vector).toEqual({ vector: [1, 0], model: "test" });
    expect(timings).toEqual([expect.objectContaining({ corpus: "docs", embedding: "used" })]);
  });

  it("falls back to full-text order when the embedding is slow, fails, or the index is unavailable", async () => {
    vi.useFakeTimers();
    const fullText = () => Promise.resolve({ keys: ["a", "b"], coverage: 1 });
    const semantic = vi.fn(() => Promise.resolve({ keys: ["z"], similarity: 0.8 }));
    const slow = new RetrievalStopwatch("wiki");
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

    const failing = new RetrievalStopwatch("wiki");
    const failed = await fuseFullTextAndSemantic({
      query: "q",
      stopwatch: failing,
      fullText,
      embed: () => Promise.reject(new Error("gateway")),
      semantic,
    });
    expect(failed.ranked).toEqual(["a", "b"]);
    expect(failing.embedding).toBe("unavailable");

    const noIndex = new RetrievalStopwatch("docs");
    const withoutIndex = await fuseFullTextAndSemantic({
      query: "q",
      stopwatch: noIndex,
      fullText,
      embed: () => Promise.resolve({ vector: [1], model: "m" }),
      semantic: () => Promise.resolve(null),
    });
    expect(withoutIndex).toMatchObject({ ranked: ["a", "b"], vector: null });
    expect(noIndex.embedding).toBe("unavailable");

    const none = new RetrievalStopwatch("docs");
    expect(
      (await fuseFullTextAndSemantic({ query: "q", stopwatch: none, fullText, embed: null, semantic })).ranked,
    ).toEqual(["a", "b"]);
    expect(none.embedding).toBe("none");
    expect(semantic).not.toHaveBeenCalled();
  });
});

describe("query embedding wait", () => {
  it("abandons an embedding still in flight at the deadline and waits for one the embedder already claimed", async () => {
    vi.useFakeTimers();
    const fullText = () => Promise.resolve({ keys: ["a", "b"], coverage: 1 });
    const semantic = vi.fn(() => Promise.resolve({ keys: ["z"], similarity: 0.8 }));
    const claims: boolean[] = [];
    const embedAfter = (claimAt: number, resolveAt: number) => (_query: string, wait?: QueryEmbeddingWait) =>
      new Promise<{ vector: number[]; model: string }>((resolve) => {
        setTimeout(() => claims.push(wait?.claim() ?? true), claimAt);
        setTimeout(() => resolve({ vector: [1], model: "m" }), resolveAt);
      });

    const late = new RetrievalStopwatch("wiki");
    const lateRun = fuseFullTextAndSemantic({
      query: "q",
      stopwatch: late,
      fullText,
      embed: embedAfter(100, 100),
      semantic,
      embeddingWaitMs: 50,
    });
    await vi.advanceTimersByTimeAsync(120);
    await expect(lateRun).resolves.toMatchObject({ ranked: ["a", "b"], vector: null });
    expect(late.embedding).toBe("timeout");

    const claimed = new RetrievalStopwatch("wiki");
    const claimedRun = fuseFullTextAndSemantic({
      query: "q",
      stopwatch: claimed,
      fullText,
      embed: embedAfter(40, 90),
      semantic,
      embeddingWaitMs: 50,
    });
    await vi.advanceTimersByTimeAsync(100);
    await expect(claimedRun).resolves.toMatchObject({ ranked: ["a", "z", "b"], vector: { vector: [1], model: "m" } });
    expect(claimed.embedding).toBe("used");
    expect(claims).toEqual([false, true]);
  });

  it("waits 1,100 ms for the query embedding by default", async () => {
    vi.useFakeTimers();
    const fullText = () => Promise.resolve({ keys: ["a", "b"], coverage: 1 });
    const semantic = () => Promise.resolve({ keys: ["z"], similarity: 0.8 });
    const arriving = (ms: number) => () =>
      new Promise<{ vector: number[]; model: string }>((resolve) => {
        setTimeout(() => resolve({ vector: [1], model: "m" }), ms);
      });

    expect(RETRIEVAL_EMBEDDING_WAIT_MS).toBe(1_100);
    const inTime = new RetrievalStopwatch("docs");
    const inTimeRun = fuseFullTextAndSemantic({
      query: "q",
      stopwatch: inTime,
      fullText,
      embed: arriving(1_000),
      semantic,
    });
    await vi.advanceTimersByTimeAsync(1_050);
    await expect(inTimeRun).resolves.toMatchObject({ ranked: ["a", "z", "b"] });
    expect(inTime.embedding).toBe("used");

    const late = new RetrievalStopwatch("wiki");
    const lateRun = fuseFullTextAndSemantic({
      query: "q",
      stopwatch: late,
      fullText,
      embed: arriving(1_200),
      semantic,
    });
    await vi.advanceTimersByTimeAsync(1_250);
    await expect(lateRun).resolves.toMatchObject({ ranked: ["a", "b"], vector: null });
    expect(late.embedding).toBe("timeout");
  });

  it("lets exactly one of claim and abandon win", () => {
    const claimedFirst = new QueryEmbeddingWait();
    expect(claimedFirst.claim()).toBe(true);
    expect(claimedFirst.abandon()).toBe(false);
    expect(claimedFirst.claim()).toBe(true);

    const abandonedFirst = new QueryEmbeddingWait();
    expect(abandonedFirst.abandon()).toBe(true);
    expect(abandonedFirst.claim()).toBe(false);
    expect(abandonedFirst.abandon()).toBe(true);
  });
});

describe("relevance floor", () => {
  const evidence = (coverage: number, similarity: number | null, pinned = 0) => ({ pinned, coverage, similarity });

  it("judges relevance only when the query embedding arrived", () => {
    expect(RETRIEVAL_RELEVANCE_FLOOR).toEqual({ coverage: 0.9, similarity: 0.6 });
    expect(relevanceVerdict(evidence(0.1, null))).toBe("kept");
    expect(relevanceVerdict(evidence(0.1, 0.55))).toBe("dropped");
    expect(relevanceVerdict(evidence(0.1, 0.55), null)).toBe("kept");
  });

  it("keeps a query whose words all match, an identifier match, or a close meaning, and lets the re-rank decide the last", () => {
    expect(relevanceVerdict(evidence(0.95, 0.4))).toBe("kept");
    expect(relevanceVerdict(evidence(0.1, 0.4, 1))).toBe("kept");
    expect(relevanceVerdict(evidence(0.5, 0.65))).toBe("rerank");

    expect(keepsResults("kept", { order: [1], abstained: true })).toBe(true);
    expect(keepsResults("dropped", null)).toBe(false);
    expect(keepsResults("rerank", { order: [1], abstained: true })).toBe(false);
    expect(keepsResults("rerank", { order: [1], abstained: false })).toBe(true);
    expect(keepsResults("rerank", null)).toBe(true);
  });

  it("returns no ranked keys below the floor", async () => {
    const run = (coverage: number, similarity: number, pinned: string[] = []) =>
      fuseFullTextAndSemantic({
        query: "q",
        stopwatch: new RetrievalStopwatch("wiki"),
        fullText: () => Promise.resolve({ keys: ["a"], pinned, coverage }),
        embed: () => Promise.resolve({ vector: [1], model: "m" }),
        semantic: () => Promise.resolve({ keys: ["b"], similarity }),
      });

    await expect(run(0.2, 0.55)).resolves.toMatchObject({ ranked: [], relevance: "dropped" });
    await expect(run(0.2, 0.55, ["p"])).resolves.toMatchObject({ ranked: ["p", "a", "b"], relevance: "kept" });
    await expect(run(0.2, 0.7)).resolves.toMatchObject({ ranked: ["a", "b"], relevance: "rerank" });
  });
});

describe("section re-rank", () => {
  it("judges one candidate only when the relevance floor needs a decision and never calls with none", async () => {
    const ranker = vi.fn(() => Promise.resolve({ order: [1], abstained: true }));
    const args = { query: "q", stopwatch: new RetrievalStopwatch("wiki"), ranker };

    expect(await rerankSections({ ...args, candidates: [], relevance: "rerank" })).toBeNull();
    expect(await rerankSections({ ...args, candidates: [candidate(1)], relevance: "kept" })).toBeNull();
    expect(ranker).not.toHaveBeenCalled();
    expect(await rerankSections({ ...args, candidates: [candidate(1)], relevance: "rerank" })).toEqual({
      order: [1],
      abstained: true,
    });
    expect(ranker).toHaveBeenCalledOnce();
  });

  it("returns only offered ids and falls back on a missing ranker, a failure, or an unknown choice", async () => {
    const candidates = [candidate(1), candidate(2), candidate(3)];
    const stopwatch = new RetrievalStopwatch("wiki");

    expect(
      await rerankSections({
        query: "q",
        stopwatch,
        candidates,
        ranker: () => Promise.resolve({ order: [3, 99, 3, 1], abstained: false }),
      }),
    ).toEqual({ order: [3, 1], abstained: false });
    expect(stopwatch.rerank).toBe("used");
    expect(
      await rerankSections({
        query: "q",
        stopwatch,
        candidates,
        ranker: () => Promise.resolve({ order: [2], abstained: true }),
      }),
    ).toEqual({ order: [2], abstained: true });
    expect(await rerankSections({ query: "q", stopwatch, candidates, ranker: undefined })).toBeNull();
    expect(stopwatch.rerank).toBe("unavailable");
    expect(
      await rerankSections({ query: "q", stopwatch, candidates, ranker: () => Promise.reject(new Error("504")) }),
    ).toBeNull();
    expect(stopwatch.rerank).toBe("failed");
    expect(
      await rerankSections({
        query: "q",
        stopwatch,
        candidates,
        ranker: () => Promise.resolve({ order: [42], abstained: false }),
      }),
    ).toBeNull();
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

describe("query words", () => {
  it("finds words with Intl.Segmenter, keeps joined forms and combining marks whole, and drops query syntax", () => {
    const words = (query: string) => fullTextUnits(query).map((unit) => unit.text);

    expect(words("e-mail don't v4.12.3 OPS-1182 a--b")).toEqual(["e-mail", "don't", "v4.12.3", "ops-1182", "a", "b"]);
    expect(words("नमस्ते दुनिया")).toEqual(["नमस्ते", "दुनिया"]);
    expect(words("refund:* & !policy | (a <-> b)")).toEqual(["refund", "policy", "a", "b"]);
    expect(words("Café naïve foo_bar")).toEqual(["café", "naïve", "foo_bar"]);
  });
});

describe("typo candidates", () => {
  it("offers only alphabetic single words of four or more letters that matched no page", () => {
    const units = fullTextUnits('refnud "expense policy" glosary e-mail 2026 abc 退款 policy');

    expect(typoCandidates(units, new Set())).toEqual(["refnud", "glosary", "policy"]);
    const policy = units.findIndex((unit) => unit.text === "policy") + 1;
    expect(typoCandidates(units, new Set([policy]))).toEqual(["refnud", "glosary"]);
  });

  it("replaces whole query words with their corrections and leaves the rest of the query as typed", () => {
    const corrections = new Map([
      ["refnud", "refund"],
      ["pol", "x"],
    ]);

    expect(replaceQueryWords("Refnud Policy, refnuds", corrections)).toBe("refund policy, refnuds");
  });
});

describe("alphabetic compound search queries", () => {
  it("allows a hyphenated word to match its separate component words in the same query unit", () => {
    const sql = fullTextUnitsCte({ units: fullTextUnits("Policies-Seite"), configs: ["german"], stopConfig: "german" });
    expect(sql.values).toContain("policies-seite");
    expect(sql.values).toContain("policies seite");
    expect(fullTextUnits("Policies-Seite")).toHaveLength(1);
  });

  it("keeps the existing strict quoted-unit precedence for a repeated mixed compound", () => {
    for (const query of ['"support-response" support-response', 'support-response "support-response"']) {
      const units = fullTextUnits(query);
      expect(units).toEqual([{ text: "support-response", phrase: false, prefix: false, substring: false }]);
      const sql = fullTextUnitsCte({ units, configs: ["english"], stopConfig: "english" });
      expect(sql.values).not.toContain("support response");
    }
  });

  it("preserves quoted phrases and numeric or underscored identifiers", () => {
    for (const query of ['"Account Policies-Seite"', "OPS-1182", "list_records"]) {
      const sql = fullTextUnitsCte({ units: fullTextUnits(query), configs: ["english"], stopConfig: "english" });
      expect(sql.values).not.toContain("policies seite");
      expect(sql.values).not.toContain("ops 1182");
      expect(sql.values).not.toContain("list records");
    }
  });
});

import { describe, expect, it } from "vitest";

import { buildAgentTurnClassifierTrace, isAgentTurnClassifierTrace } from "../agent-classifier-trace";

describe("agent turn classifier trace", () => {
  it("includes semantic review costs and unavailable attempts without storing content or changing older trace shapes", () => {
    const trace = buildAgentTurnClassifierTrace([
      { use: "wiki_synthesis_review", model: "jev", costMicrocents: 600, measured: true, answered: true },
      { use: "wiki_synthesis_review", model: "jev", costMicrocents: 700, measured: false, answered: false },
    ]);
    expect(trace).toEqual({
      auxiliaryCostMicrocents: 1300,
      auxiliaryMeasured: false,
      docsRerank: null,
      wikiSynthesisReview: { model: "jev", calls: 2, answered: 1, costMicrocents: 1300, measured: false },
    });
    expect(isAgentTurnClassifierTrace(trace)).toBe(true);
    expect(isAgentTurnClassifierTrace({ ...trace, wikiSynthesisReview: "claim text" })).toBe(false);
    expect(isAgentTurnClassifierTrace({ auxiliaryCostMicrocents: 0, auxiliaryMeasured: true, docsRerank: null })).toBe(
      true,
    );
  });
  it("records docs re-rank calls with their summed cost and nothing else, never text", () => {
    const trace = buildAgentTurnClassifierTrace([
      { use: "docs_rerank", model: "jev", costMicrocents: 1_600, measured: true, answered: true },
      { use: "docs_rerank", model: "jev", costMicrocents: 900, measured: false, answered: false },
    ]);

    expect(trace).toEqual({
      auxiliaryCostMicrocents: 2_500,
      auxiliaryMeasured: false,
      docsRerank: { model: "jev", calls: 2, answered: 1, costMicrocents: 2_500, measured: false },
    });
    expect(isAgentTurnClassifierTrace(trace)).toBe(true);
  });

  it("stores no trace for a turn without a classifier call", () => {
    expect(buildAgentTurnClassifierTrace([])).toBeNull();
  });

  it("rejects a negative cost and a docs re-rank entry that is not an object", () => {
    const trace = { auxiliaryCostMicrocents: 0, auxiliaryMeasured: true, docsRerank: null };
    expect(isAgentTurnClassifierTrace({ ...trace, auxiliaryCostMicrocents: -1 })).toBe(false);
    expect(isAgentTurnClassifierTrace({ ...trace, docsRerank: "jev" })).toBe(false);
  });

  it("records Wiki re-rank calls and bounded retrieval timings, and stores a trace for timings alone", () => {
    const timing = {
      corpus: "docs" as const,
      totalMs: 412,
      fullTextMs: 9,
      embedding: "used" as const,
      embeddingMs: 230,
      semanticMs: 6,
      rerank: "used" as const,
      rerankMs: 160,
    };
    const trace = buildAgentTurnClassifierTrace(
      [{ use: "wiki_rerank", model: "jev", costMicrocents: 700, measured: true, answered: true }],
      Array.from({ length: 40 }, () => timing),
    );

    expect(trace).toMatchObject({
      auxiliaryCostMicrocents: 700,
      docsRerank: null,
      wikiRerank: { model: "jev", calls: 1, answered: 1, costMicrocents: 700, measured: true },
    });
    expect(trace?.retrieval).toHaveLength(32);
    expect(isAgentTurnClassifierTrace(trace)).toBe(true);
    expect(buildAgentTurnClassifierTrace([], [timing])).toEqual({
      auxiliaryCostMicrocents: 0,
      auxiliaryMeasured: true,
      docsRerank: null,
      retrieval: [timing],
    });
    expect(isAgentTurnClassifierTrace({ ...trace, retrieval: "fast" })).toBe(false);
  });
});

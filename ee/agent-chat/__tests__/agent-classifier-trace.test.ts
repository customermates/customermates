import { describe, expect, it } from "vitest";

import { buildAgentTurnClassifierTrace, isAgentTurnClassifierTrace } from "../agent-classifier-trace";

describe("agent turn classifier trace", () => {
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

  it("accepts traces stored before the removed toolset and guard fields went away, and rejects a bad cost", () => {
    const legacy = { auxiliaryCostMicrocents: 0, auxiliaryMeasured: true, toolsetPreload: null, docsRerank: null };
    expect(isAgentTurnClassifierTrace(legacy)).toBe(true);
    expect(isAgentTurnClassifierTrace({ ...legacy, auxiliaryCostMicrocents: -1 })).toBe(false);
    expect(isAgentTurnClassifierTrace({ ...legacy, docsRerank: "jev" })).toBe(false);
  });
});

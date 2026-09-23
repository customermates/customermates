import { describe, expect, it } from "vitest";

import { MODEL_CATALOG, isAgentModelKey, loadBenchmarkModelOverlay, resolveAgentModel } from "../model-catalog";

const entry = {
  key: "bench:flash-lite-low",
  modelId: "google/gemini-3.5-flash-lite",
  servingProvider: "vertex",
  inferenceRegion: "eu",
  maxOutputTokens: 8192,
  maxContextTokens: 66_000,
  maxToolResultChars: 6000,
  thinkingLevel: "low",
};

describe("benchmark model overlay", () => {
  it("is empty unless the local benchmark flag is set", () => {
    expect(loadBenchmarkModelOverlay({ AGENT_BENCHMARK_ARMS: JSON.stringify([entry]) })).toEqual({});
    expect(loadBenchmarkModelOverlay({ LOCAL_AGENT_BENCHMARK: "true" })).toEqual({});
  });

  it("fails closed in any deployment environment", () => {
    expect(() =>
      loadBenchmarkModelOverlay({ LOCAL_AGENT_BENCHMARK: "true", VERCEL: "1", AGENT_BENCHMARK_ARMS: "[]" }),
    ).toThrow(/deployment environment/);
  });

  it("parses entries and keeps their reasoning settings", () => {
    const overlay = loadBenchmarkModelOverlay({
      LOCAL_AGENT_BENCHMARK: "true",
      AGENT_BENCHMARK_ARMS: JSON.stringify([
        entry,
        {
          ...entry,
          key: "bench:nano",
          modelId: "openai/gpt-5-nano",
          servingProvider: "azure",
          inferenceRegion: null,
          thinkingLevel: undefined,
          reasoningEffort: "low",
        },
      ]),
    });

    expect(overlay["bench:flash-lite-low"]).toEqual(
      expect.objectContaining({ modelId: entry.modelId, thinkingLevel: "low" }),
    );
    expect(overlay["bench:nano"]).toEqual(
      expect.objectContaining({ modelId: "openai/gpt-5-nano", reasoningEffort: "low" }),
    );
  });

  it("rejects malformed keys, unpinned models and duplicates", () => {
    const load = (arms: unknown) =>
      loadBenchmarkModelOverlay({ LOCAL_AGENT_BENCHMARK: "true", AGENT_BENCHMARK_ARMS: JSON.stringify(arms) });

    expect(() => load([{ ...entry, key: "flash" }])).toThrow();
    expect(() => load([{ ...entry, modelId: "vendor/unpinned-model" }])).toThrow(/No pinned pricing/);
    expect(() => load([entry, entry])).toThrow(/Duplicate/);
    expect(() => loadBenchmarkModelOverlay({ LOCAL_AGENT_BENCHMARK: "true", AGENT_BENCHMARK_ARMS: "{" })).toThrow(
      /JSON array/,
    );
  });

  it("keeps the shipped catalog keys authoritative", () => {
    expect(isAgentModelKey("balanced")).toBe(true);
    expect(isAgentModelKey("bench:not-loaded")).toBe(false);
    expect(resolveAgentModel()).toBe(MODEL_CATALOG.balanced);
    expect(resolveAgentModel("fast")).toBe(MODEL_CATALOG.fast);
    expect(() => resolveAgentModel("bench:not-loaded")).toThrow(/Unknown agent model/);
  });
});

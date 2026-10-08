import { describe, expect, it } from "vitest";

import {
  AGENT_MODELS,
  SHIPPED_AGENT_MODEL_KEY,
  agentModelWorstCasePromptTokens,
  isAgentModelKey,
  isAgentModelWithinBudgetEnvelope,
  resolveAgentModel,
} from "../model-catalog";
import { assertServableEntry } from "../agent-model";
import { lowestModelPromptTierBoundary } from "../model-pricing";
import { loadBenchmarkModelOverlay } from "../benchmark-model-registry";

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

describe("shipped agent models", () => {
  it("keeps every purpose entry servable inside its pricing envelope", () => {
    for (const [purpose, model] of Object.entries(AGENT_MODELS)) {
      expect(() => assertServableEntry(purpose, model)).not.toThrow();
      expect(isAgentModelWithinBudgetEnvelope(model), purpose).toBe(true);
    }
  });

  it("resolves the persisted shipped key to the entry for the turn purpose", () => {
    expect(SHIPPED_AGENT_MODEL_KEY).toBe("balanced");
    expect(resolveAgentModel()).toBe(AGENT_MODELS.chat);
    expect(resolveAgentModel(null)).toBe(AGENT_MODELS.chat);
    expect(resolveAgentModel("balanced", "chat")).toBe(AGENT_MODELS.chat);
    expect(resolveAgentModel(null, "routine")).toBe(AGENT_MODELS.routine);
    expect(resolveAgentModel("balanced", "routine")).toBe(AGENT_MODELS.routine);
  });

  it("uses low effort for chat and medium effort for routines and Knowledge Base synthesis", () => {
    expect(AGENT_MODELS.chat.reasoningEffort).toBe("low");
    expect(AGENT_MODELS.routine.reasoningEffort).toBe("medium");
    expect(AGENT_MODELS.wikiSynthesis.reasoningEffort).toBe("medium");
    for (const model of Object.values(AGENT_MODELS)) expect(model).not.toHaveProperty("thinkingLevel");
  });

  it("pins every entry to Claude Haiku on Vertex Anthropic in the EU", () => {
    for (const model of Object.values(AGENT_MODELS)) {
      expect(model).toMatchObject({
        modelId: "anthropic/claude-haiku-5.5",
        servingProvider: "vertexAnthropic",
        inferenceRegion: "eu",
      });
    }
  });

  it("keeps the Haiku worst-case prompt below its first pricing tier boundary", () => {
    const boundary = lowestModelPromptTierBoundary(
      AGENT_MODELS.chat.modelId,
      AGENT_MODELS.chat.servingProvider,
      AGENT_MODELS.chat.inferenceRegion,
    );
    expect(boundary).toBe(100_001);
    for (const model of Object.values(AGENT_MODELS)) {
      expect(model.maxContextTokens).toBe(65_000);
      expect(agentModelWorstCasePromptTokens(model)).toBe(100_000);
      expect(agentModelWorstCasePromptTokens(model)).toBeLessThan(boundary ?? 0);
    }
    expect(isAgentModelWithinBudgetEnvelope({ ...AGENT_MODELS.chat, maxContextTokens: 65_001 })).toBe(false);
  });
});

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
    expect(resolveAgentModel()).toBe(AGENT_MODELS.chat);
    expect(isAgentModelKey("fast")).toBe(false);
    expect(() => resolveAgentModel("fast")).toThrow(/Unknown agent model/);
    expect(() => resolveAgentModel("bench:not-loaded")).toThrow(/Unknown agent model/);
  });
});

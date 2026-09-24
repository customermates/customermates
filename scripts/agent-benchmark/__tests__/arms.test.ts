import { describe, expect, it } from "vitest";

import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";

import { MODEL_CATALOG, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";

import {
  armById,
  armModelKey,
  benchmarkArmsOverlayJson,
  benchmarkModelEntries,
  BENCHMARK_ARMS,
  defaultBenchmarkArmIds,
} from "../arms";

function modelEntry(arm: ReturnType<typeof armById>): AgentModelEntry {
  return {
    modelId: arm.modelId,
    servingProvider: arm.servingProvider,
    inferenceRegion: arm.inferenceRegion,
    maxOutputTokens: arm.maxOutputTokens,
    maxContextTokens: arm.maxContextTokens,
    maxToolResultChars: arm.maxToolResultChars,
    ...(arm.reasoningEffort ? { reasoningEffort: arm.reasoningEffort } : {}),
    ...(arm.thinkingLevel ? { thinkingLevel: arm.thinkingLevel } : {}),
  };
}

describe("benchmark arms", () => {
  it("uses the production model catalog entry as the shipped control", () => {
    const shipped = armById("shipped");

    expect(modelEntry(shipped)).toEqual(MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY]);
    expect(armModelKey(shipped)).toBe(SHIPPED_AGENT_MODEL_KEY);
    expect(benchmarkModelEntries([shipped])).toEqual([]);
    expect(JSON.parse(benchmarkArmsOverlayJson([shipped]))).toEqual([]);
  });

  it("defaults runs to the single shipped control", () => {
    expect(defaultBenchmarkArmIds()).toEqual(["shipped"]);
  });

  it("keeps every current arm configuration distinct", () => {
    const fingerprints = BENCHMARK_ARMS.map((arm) => JSON.stringify(modelEntry(arm)));
    expect(new Set(fingerprints).size).toBe(fingerprints.length);
  });

  it("keeps explicit experimental arms in the local benchmark overlay", () => {
    const experimental = armById("flash-lite-medium");

    expect(armModelKey(experimental)).toBe("bench:flash-lite-medium");
    expect(benchmarkModelEntries([experimental])).toEqual([
      expect.objectContaining({ key: "bench:flash-lite-medium", thinkingLevel: "medium", maxOutputTokens: 8192 }),
    ]);
  });
});

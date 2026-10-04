import { describe, expect, it } from "vitest";

import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";

import { SHIPPED_AGENT_MODEL, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";
import { agentModelWorstCasePromptTokens, assertServableEntry } from "@/ee/agent-chat/agent-model";
import { loadBenchmarkModelOverlay } from "@/ee/agent-chat/benchmark-model-registry";
import { modelContextLength } from "@/ee/agent-chat/model-pricing";

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

    expect(modelEntry(shipped)).toEqual(SHIPPED_AGENT_MODEL);
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

  it("adds OVHcloud AI Endpoints arms as servable EU entries in the overlay", () => {
    const ovhArms = BENCHMARK_ARMS.filter((arm) => arm.servingProvider === "ovh");

    expect(ovhArms.map((arm) => arm.modelId).sort()).toEqual([
      "ovh/Mistral-Small-3.2-24B-Instruct-2506",
      "ovh/Qwen3-Coder-30B-A3B-Instruct",
      "ovh/Qwen3.5-397B-A17B",
      "ovh/Qwen3.8-27B",
      "ovh/gpt-oss-120b",
    ]);
    for (const arm of ovhArms) {
      expect(arm).toMatchObject({ family: "ovh", inferenceRegion: "eu" });
      expect(arm.thinkingLevel).toBeUndefined();
      expect(() => assertServableEntry(arm.id, modelEntry(arm))).not.toThrow();
      expect(agentModelWorstCasePromptTokens(modelEntry(arm)) + arm.maxOutputTokens).toBeLessThan(
        modelContextLength(arm.modelId, "ovh", "eu"),
      );
    }
    expect(armById("ovh-gpt-oss-120b-low").reasoningEffort).toBe("low");
    expect(
      loadBenchmarkModelOverlay({ LOCAL_AGENT_BENCHMARK: "true", AGENT_BENCHMARK_ARMS: benchmarkArmsOverlayJson(ovhArms) }),
    ).toHaveProperty("bench:ovh-qwen38-27b", expect.objectContaining({ servingProvider: "ovh" }));
  });
});

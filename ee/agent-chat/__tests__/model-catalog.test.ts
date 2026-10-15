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

  it("uses low effort for chat, medium for routines and no thinking for every structured purpose", () => {
    expect(AGENT_MODELS.chat.reasoningEffort).toBe("low");
    expect(AGENT_MODELS.routine.reasoningEffort).toBe("medium");
    for (const purpose of ["wikiSynthesis", "wikiSummary", "setupDrafting", "setupPlanning"] as const)
      expect(AGENT_MODELS[purpose].reasoningEffort, purpose).toBe("none");
    expect(AGENT_MODELS.wikiSummary).toMatchObject({ maxOutputTokens: 512 });
  });

  it("pins every entry to Claude on Vertex Anthropic in the EU, Sonnet only for workspace-setup planning", () => {
    for (const [purpose, model] of Object.entries(AGENT_MODELS)) {
      expect(model).toMatchObject({
        modelId: purpose === "setupPlanning" ? "anthropic/claude-sonnet-5.5" : "anthropic/claude-haiku-5.5",
        servingProvider: "vertexAnthropic",
        inferenceRegion: "eu",
      });
    }
  });

  it("drafts workspace setup with Haiku and plans it with Sonnet without thinking, since Vertex leaves structured output unconstrained", () => {
    expect(AGENT_MODELS.setupDrafting).toMatchObject({ modelId: "anthropic/claude-haiku-5.5", reasoningEffort: "none" });
    expect(AGENT_MODELS.setupPlanning).toMatchObject({
      modelId: "anthropic/claude-sonnet-5.5",
      reasoningEffort: "none",
      maxOutputTokens: 16_384,
    });
  });

  it("gives only setup planning a longer timeout, for a plan part with up to 16K output tokens", () => {
    expect(AGENT_MODELS.setupPlanning.timeoutMs).toBe(180_000);
    for (const [purpose, model] of Object.entries(AGENT_MODELS))
      if (purpose !== "setupPlanning") expect(model, purpose).not.toHaveProperty("timeoutMs");
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

describe("agent model keys", () => {
  it("accepts only the shipped key and refuses to resolve any other", () => {
    expect(isAgentModelKey("balanced")).toBe(true);
    expect(isAgentModelKey("fast")).toBe(false);
    expect(isAgentModelKey("bench:retired-arm")).toBe(false);
    expect(() => resolveAgentModel("fast")).toThrow(/Unknown agent model/);
    expect(() => resolveAgentModel("bench:retired-arm")).toThrow(/Unknown agent model/);
  });

  it("refuses an entry whose model has no pinned price", () => {
    expect(() => assertServableEntry("unpinned", { ...AGENT_MODELS.chat, modelId: "vendor/unpinned-model" })).toThrow(
      /No pinned pricing/,
    );
  });
});

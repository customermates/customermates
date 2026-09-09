import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_RESERVATION_ROUNDS_AHEAD,
  agentContextTokensToBytes,
  agentRoundWorstCaseCredits,
  isAgentContextWithinBudget,
  resolveAgentTurnBudget,
  serializedAgentContextBytes,
} from "../agent-budget-policy";
import { buildAgentProviderContext, isAgentStepContextWithinBudget } from "../agent-provider-context";
import { MODEL_CATALOG, agentModelWorstCasePromptTokens, isAgentModelWithinBudgetEnvelope } from "../model-catalog";
import { modelProviderContextLength, resolveModelPricing } from "../model-pricing";

const BALANCED = MODEL_CATALOG.balanced;
const FAST = MODEL_CATALOG.fast;

describe("agent turn credit budget", () => {
  it("pins every shipped model to the ZDR-compatible Azure provider", () => {
    expect([FAST.servingProvider, BALANCED.servingProvider]).toEqual(["azure", "azure"]);
  });

  it("gives every model its own full envelope, because affordability is no longer a smaller envelope", () => {
    for (const model of [FAST, BALANCED]) {
      const budget = resolveAgentTurnBudget({ model, availableCredits: 500 });

      expect(budget).toEqual(
        expect.objectContaining({
          modelSpec: model.modelId,
          servingProvider: model.servingProvider,
          maxOutputTokens: model.maxOutputTokens,
          maxContextTokens: model.maxContextTokens,
          maxContextBytes: agentContextTokensToBytes(model.maxContextTokens),
          webSearchEnabled: true,
        }),
      );
    }
  });

  it("reserves a few rounds ahead for ordinary chat", () => {
    const budget = resolveAgentTurnBudget({
      model: BALANCED,
      availableCredits: agentRoundWorstCaseCredits(BALANCED) - 1,
    });

    expect(budget?.webSearchEnabled).toBe(false);
    expect(budget?.reservedCredits).toBe((budget?.roundReserveCredits ?? 0) * AGENT_RESERVATION_ROUNDS_AHEAD);
  });

  it("reserves one web round initially because continuation extends before another provider round", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 500 });

    expect(budget?.webSearchEnabled).toBe(true);
    expect(budget?.reservedCredits).toBe(budget?.roundReserveCredits);
  });

  it("reserves more than token-only exposure because every round may perform one web search", () => {
    const promptTokens = agentModelWorstCasePromptTokens(BALANCED);
    const pricing = resolveModelPricing(BALANCED.modelId, promptTokens, BALANCED.servingProvider);
    const tokenOnlyCredits = Math.ceil(
      ((promptTokens * Math.max(pricing.inputPerMTok, pricing.cacheReadPerMTok, pricing.cacheWritePerMTok)) /
        1_000_000 +
        (BALANCED.maxOutputTokens * pricing.outputPerMTok) / 1_000_000) /
        0.01,
    );

    expect(agentRoundWorstCaseCredits(BALANCED)).toBeGreaterThan(tokenOnlyCredits);
  });

  it("reserves the full provider context because low search context is not an exact token cap", () => {
    expect(modelProviderContextLength(BALANCED.modelId, BALANCED.servingProvider)).toBe(1_050_000);
    expect(agentRoundWorstCaseCredits(BALANCED)).toBe(55);
    expect(agentRoundWorstCaseCredits(FAST)).toBe(4);
  });

  it("reserves strictly less for the cheaper model at the same envelope", () => {
    const fast = resolveAgentTurnBudget({ model: FAST, availableCredits: 500 });
    const balanced = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 500 });

    expect(fast?.reservedCredits).toBeLessThan(balanced?.reservedCredits ?? 0);
  });

  it("never reserves more than the user actually has left", () => {
    const perRound = agentRoundWorstCaseCredits(BALANCED);
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: perRound });

    expect(budget?.reservedCredits).toBe(perRound);
  });

  it("keeps low-credit chat available without exposing an unaffordable web search", () => {
    const perRound = agentRoundWorstCaseCredits(BALANCED);

    expect(resolveAgentTurnBudget({ model: BALANCED, availableCredits: perRound - 1 })).toMatchObject({
      webSearchEnabled: false,
    });
    expect(resolveAgentTurnBudget({ model: BALANCED, availableCredits: perRound })).toMatchObject({
      webSearchEnabled: true,
      roundReserveCredits: perRound,
    });
  });

  it("refuses a user with no credits at all", () => {
    expect(resolveAgentTurnBudget({ model: BALANCED, availableCredits: 0 })).toBeNull();
  });

  it("refuses a context the model's envelope cannot hold", () => {
    expect(
      resolveAgentTurnBudget({
        model: BALANCED,
        availableCredits: 500,
        requiredContextBytes: agentContextTokensToBytes(BALANCED.maxContextTokens) + 1,
      }),
    ).toBeNull();
  });

  it("keeps the full tool-result allowance, which the old ladder used to trim away", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 500 });

    expect(budget?.maxToolResultChars).toBe(BALANCED.maxToolResultChars);
  });

  it("measures the pricing-tier envelope in prompt tokens, per model", () => {
    expect(isAgentModelWithinBudgetEnvelope(FAST)).toBe(true);
    expect(isAgentModelWithinBudgetEnvelope(BALANCED)).toBe(true);
    expect(isAgentModelWithinBudgetEnvelope({ ...BALANCED, maxContextTokens: 400_000 })).toBe(false);
    expect(resolveAgentTurnBudget({ model: BALANCED, availableCredits: 0 })).toBeNull();
    expect(
      resolveAgentTurnBudget({ model: { ...BALANCED, maxContextTokens: 400_000 }, availableCredits: 500 }),
    ).toBeNull();
  });

  it("checks the serialized context against the per-turn dynamic bound", () => {
    expect(isAgentContextWithinBudget({ value: "small" }, 100)).toBe(true);
    expect(isAgentContextWithinBudget({ value: "x".repeat(200) }, 100)).toBe(false);
  });

  it("measures a step against the provider context plus that step's own messages", () => {
    const providerContext = buildAgentProviderContext(
      "system prompt",
      [{ role: "user", text: "hello" }],
      [{ name: "lookup", description: "Look up records.", inputSchema: { type: "object" } }],
    );
    expect(providerContext.messages).toEqual([{ role: "user", content: "hello" }]);

    const stepMessages = [
      ...providerContext.messages,
      { role: "assistant", content: [{ type: "text", text: "x".repeat(10_000) }] },
    ] as ModelMessage[];
    const maxContextBytes = 2_000;

    expect(serializedAgentContextBytes({ ...providerContext, messages: stepMessages })).toBeGreaterThan(
      maxContextBytes,
    );
    expect(isAgentStepContextWithinBudget(providerContext, stepMessages, maxContextBytes)).toBe(false);
    expect(isAgentStepContextWithinBudget(providerContext, providerContext.messages, maxContextBytes)).toBe(true);
  });
});

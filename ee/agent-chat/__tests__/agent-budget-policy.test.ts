import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_MIN_OUTPUT_TOKENS_PER_STEP,
  agentContextTokensToBytes,
  agentTurnWorstCaseUsd,
  isAgentContextWithinBudget,
  resolveAgentTurnBudget,
  serializedAgentContextBytes,
} from "../agent-budget-policy";
import { buildAgentProviderContext, isAgentStepContextWithinBudget } from "../agent-provider-context";
import { MODEL_CATALOG, isAgentModelWithinBudgetEnvelope } from "../model-catalog";

const BALANCED = MODEL_CATALOG.balanced;
const FAST = MODEL_CATALOG.fast;

describe("agent turn credit budget", () => {
  it("uses each model's own full envelope when the user has enough credits", () => {
    for (const model of [FAST, BALANCED]) {
      const budget = resolveAgentTurnBudget({ model, availableCredits: 500 });

      expect(budget).toEqual(
        expect.objectContaining({
          modelSpec: model.modelId,
          servingProvider: model.servingProvider,
          maxSteps: model.maxSteps,
          maxOutputTokens: model.maxOutputTokens,
          maxContextTokens: model.maxContextTokens,
          maxContextBytes: agentContextTokensToBytes(model.maxContextTokens),
        }),
      );
      expect(budget?.reservedCredits).toBe(Math.ceil(agentTurnWorstCaseUsd(model) / 0.01));
    }
  });

  it("reserves strictly less for the cheaper model at the same envelope", () => {
    const fast = resolveAgentTurnBudget({ model: FAST, availableCredits: 500 });
    const balanced = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 500 });

    expect(fast?.reservedCredits).toBeLessThan(balanced?.reservedCredits ?? 0);
  });

  it("shrinks the provider envelope to the user's remaining credits", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 3 });

    expect(budget).not.toBeNull();
    expect(budget?.reservedCredits).toBe(3);
    if (!budget) throw new Error("Expected a three-credit turn budget.");
    expect(agentTurnWorstCaseUsd(BALANCED, budget)).toBeLessThanOrEqual(0.03);
  });

  it("can safely admit a final one-credit request", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 1 });

    expect(budget).not.toBeNull();
    expect(budget?.reservedCredits).toBe(1);
    expect(budget?.maxSteps).toBeGreaterThanOrEqual(1);
    if (!budget) throw new Error("Expected a one-credit turn budget.");
    expect(agentTurnWorstCaseUsd(BALANCED, budget)).toBeLessThanOrEqual(0.01);
  });

  it("rejects a turn when its required workflow cannot fit the funded step count", () => {
    expect(
      resolveAgentTurnBudget({
        model: BALANCED,
        availableCredits: 1,
        requiredContextBytes: 90_000,
        minimumSteps: 4,
      }),
    ).toBeNull();
    expect(
      resolveAgentTurnBudget({
        model: BALANCED,
        availableCredits: 500,
        requiredContextBytes: 90_000,
        minimumSteps: 4,
      }),
    ).toEqual(expect.objectContaining({ maxSteps: BALANCED.maxSteps }));
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

  it("funds a long full-catalog workflow without starving tool-call output", () => {
    const budget = resolveAgentTurnBudget({
      model: BALANCED,
      availableCredits: 500,
      requiredContextBytes: 160_000,
      minimumSteps: 4,
    });

    expect(budget).toEqual(
      expect.objectContaining({
        maxSteps: BALANCED.maxSteps,
        maxContextTokens: BALANCED.maxContextTokens,
      }),
    );
    expect(budget?.maxOutputTokens).toBeGreaterThanOrEqual(800);
    expect(budget?.maxToolResultChars).toBeGreaterThanOrEqual(512);
  });

  it.each([20, 28, 34, 40])(
    "preserves useful model output before adding steps with %i credits remaining",
    (availableCredits) => {
      const budget = resolveAgentTurnBudget({
        model: BALANCED,
        availableCredits,
        requiredContextBytes: 160_000,
        minimumSteps: 4,
      });

      expect(budget).not.toBeNull();
      expect(budget?.maxOutputTokens).toBeGreaterThanOrEqual(AGENT_MIN_OUTPUT_TOKENS_PER_STEP);
    },
  );

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

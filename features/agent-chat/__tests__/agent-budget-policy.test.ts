import { describe, expect, it } from "vitest";

import {
  AGENT_MAX_CONTEXT_BYTES_PER_STEP,
  AGENT_MAX_OUTPUT_TOKENS_PER_STEP,
  AGENT_MAX_STEPS_PER_TURN,
  agentTurnWorstCaseUsd,
  isAgentContextWithinBudget,
  resolveAgentTurnBudget,
} from "../agent-budget-policy";

const MODEL = "openai:gpt-5.6-luna";

describe("agent turn credit budget", () => {
  it("uses the full safe envelope when the user has enough credits", () => {
    const budget = resolveAgentTurnBudget({
      availableCredits: 500,
      modelSpec: MODEL,
      configuredMaxSteps: 8,
      configuredMaxOutputTokens: 2048,
    });

    expect(budget).toEqual(
      expect.objectContaining({
        maxSteps: AGENT_MAX_STEPS_PER_TURN,
        maxOutputTokens: AGENT_MAX_OUTPUT_TOKENS_PER_STEP,
        maxContextBytes: AGENT_MAX_CONTEXT_BYTES_PER_STEP,
      }),
    );
    expect(budget?.reservedCredits).toBe(Math.ceil(agentTurnWorstCaseUsd(MODEL) / 0.01));
  });

  it("shrinks the provider envelope to the user's remaining credits", () => {
    const budget = resolveAgentTurnBudget({
      availableCredits: 3,
      modelSpec: MODEL,
      configuredMaxSteps: 8,
      configuredMaxOutputTokens: 2048,
    });

    expect(budget).not.toBeNull();
    expect(budget?.reservedCredits).toBe(3);
    if (!budget) throw new Error("Expected a three-credit turn budget.");
    expect(agentTurnWorstCaseUsd(MODEL, budget)).toBeLessThanOrEqual(0.03);
  });

  it("can safely admit a final one-credit request", () => {
    const budget = resolveAgentTurnBudget({
      availableCredits: 1,
      modelSpec: MODEL,
      configuredMaxSteps: 8,
      configuredMaxOutputTokens: 2048,
    });

    expect(budget).not.toBeNull();
    expect(budget?.reservedCredits).toBe(1);
    expect(budget?.maxSteps).toBe(1);
    if (!budget) throw new Error("Expected a one-credit turn budget.");
    expect(agentTurnWorstCaseUsd(MODEL, budget)).toBeLessThanOrEqual(0.01);
  });

  it("rejects no-credit and unapproved-model admissions", () => {
    expect(
      resolveAgentTurnBudget({
        availableCredits: 0,
        modelSpec: MODEL,
        configuredMaxSteps: 8,
        configuredMaxOutputTokens: 2048,
      }),
    ).toBeNull();
    expect(
      resolveAgentTurnBudget({
        availableCredits: 500,
        modelSpec: "openai:gpt-5.6-sol",
        configuredMaxSteps: 8,
        configuredMaxOutputTokens: 2048,
      }),
    ).toBeNull();
  });

  it("checks the serialized context against the per-turn dynamic bound", () => {
    expect(isAgentContextWithinBudget({ value: "small" }, 100)).toBe(true);
    expect(isAgentContextWithinBudget({ value: "x".repeat(200) }, 100)).toBe(false);
  });
});

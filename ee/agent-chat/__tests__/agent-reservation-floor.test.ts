import { describe, expect, it } from "vitest";

import { agentRoundWorstCaseCredits, resolveAgentTurnBudget } from "../agent-budget-policy";
import {
  AGENT_CONTEXT_BYTES_PER_TOKEN,
  AGENT_MIN_BYTES_PER_PROVIDER_TOKEN,
  MODEL_CATALOG,
  agentModelWorstCasePromptTokens,
} from "../model-catalog";

describe("reservation floor", () => {
  it("prices the worst case at two bytes per provider token, half the enforced envelope density", () => {
    expect(AGENT_MIN_BYTES_PER_PROVIDER_TOKEN).toBe(2);
    expect(AGENT_CONTEXT_BYTES_PER_TOKEN).toBe(3);
    const balanced = MODEL_CATALOG.balanced;
    expect(agentModelWorstCasePromptTokens(balanced)).toBe(Math.ceil((balanced.maxContextTokens * 3) / 2) + 2_500);
  });

  it("reserves at most four credits per round for the shipped model and admits a user holding that much", () => {
    const perRound = agentRoundWorstCaseCredits(MODEL_CATALOG.balanced);
    expect(perRound).toBeLessThanOrEqual(4);
    expect(perRound).toBeGreaterThanOrEqual(2);
    expect(resolveAgentTurnBudget({ model: MODEL_CATALOG.balanced, availableCredits: perRound })).not.toBeNull();
    expect(resolveAgentTurnBudget({ model: MODEL_CATALOG.balanced, availableCredits: perRound - 1 })).toBeNull();
  });
});

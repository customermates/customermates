import { describe, expect, it } from "vitest";

import {
  AGENT_RESERVATION_ROUNDS_AHEAD,
  agentRoundWorstCaseCredits,
  agentRoundWorstCaseCreditsForContextBytes,
  resolveAgentTurnBudget,
} from "../agent-budget-policy";
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

  it("prices admission for the round it is about to start, never above the envelope round", () => {
    const balanced = MODEL_CATALOG.balanced;
    const envelope = agentRoundWorstCaseCredits(balanced);
    const smallContext = 24_000;
    const smallRound = agentRoundWorstCaseCreditsForContextBytes(balanced, smallContext);
    expect(smallRound).toBeLessThanOrEqual(envelope);

    expect(
      resolveAgentTurnBudget({ model: balanced, availableCredits: smallRound, requiredContextBytes: smallContext }),
    ).not.toBeNull();

    const admitted = resolveAgentTurnBudget({
      model: balanced,
      availableCredits: 500,
      requiredContextBytes: smallContext,
    });
    expect(admitted?.roundReserveCredits).toBe(envelope);
    expect(admitted?.reservedCredits).toBe(smallRound * AGENT_RESERVATION_ROUNDS_AHEAD);
    expect(
      resolveAgentTurnBudget({ model: balanced, availableCredits: smallRound - 1, requiredContextBytes: smallContext }),
    ).toBeNull();
  });

  it("holds two rounds ahead and tops up round by round", () => {
    expect(AGENT_RESERVATION_ROUNDS_AHEAD).toBe(2);
  });

  it("reserves at most six credits per round for the shipped model and admits a user holding that much", () => {
    const perRound = agentRoundWorstCaseCredits(MODEL_CATALOG.balanced);
    expect(perRound).toBeLessThanOrEqual(6);
    expect(perRound).toBeGreaterThanOrEqual(2);
    expect(resolveAgentTurnBudget({ model: MODEL_CATALOG.balanced, availableCredits: perRound })).not.toBeNull();
    expect(resolveAgentTurnBudget({ model: MODEL_CATALOG.balanced, availableCredits: perRound - 1 })).toBeNull();
  });
});

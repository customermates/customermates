import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_RESERVATION_ROUNDS_AHEAD,
  AGENT_TOOL_RESULT_TRUNCATED_MARK,
  agentContextTokensToBytes,
  agentToolResultText,
  agentRoundWorstCaseCredits,
  isAgentContextWithinBudget,
  resolveAgentTurnBudget,
  serializedAgentContextBytes,
} from "../agent-budget-policy";
import { buildAgentProviderContext, isAgentStepContextWithinBudget } from "../agent-provider-context";
import { MODEL_CATALOG, isAgentModelWithinBudgetEnvelope } from "../model-catalog";

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
        }),
      );
    }
  });

  it("reserves a few rounds ahead rather than a whole worst-case turn", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 500 });
    const perRound = agentRoundWorstCaseCredits(BALANCED);

    expect(budget?.roundReserveCredits).toBe(perRound);
    expect(budget?.reservedCredits).toBe(perRound * AGENT_RESERVATION_ROUNDS_AHEAD);
  });

  it("reserves strictly less for the cheaper model at the same envelope", () => {
    const fast = resolveAgentTurnBudget({ model: FAST, availableCredits: 500 });
    const balanced = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 500 });

    expect(fast?.reservedCredits).toBeLessThan(balanced?.reservedCredits ?? 0);
  });

  it("never reserves more than the user actually has left", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 1 });

    expect(budget?.reservedCredits).toBe(1);
  });

  it("admits a user with a single credit left, who tops up as the turn proceeds", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 1 });

    expect(budget).not.toBeNull();
    expect(budget?.reservedCredits).toBeGreaterThanOrEqual(1);
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

describe("tool result truncation is never silent", () => {
  it("marks a cut result so the model cannot mistake it for the whole answer", () => {
    const full = "record ".repeat(2_000);
    const cut = agentToolResultText(full, 512);
    expect(cut.length).toBeLessThanOrEqual(512);
    expect(cut).toContain(AGENT_TOOL_RESULT_TRUNCATED_MARK);
    expect(cut).toContain(`of ${full.length} characters`);
  });

  it("leaves a result that fits completely untouched", () => {
    expect(agentToolResultText("23 open deals", 512)).toBe("23 open deals");
  });

  it("never exceeds the cap, including at the degenerate single-character budget", () => {
    for (const cap of [1, 2, 40, 120, 511, 512, 6_000])
      expect(agentToolResultText("y".repeat(50_000), cap).length, `cap ${cap}`).toBeLessThanOrEqual(cap);
  });

  it("tells the model how to recover rather than only that it failed", () => {
    const cut = agentToolResultText("z".repeat(10_000), 600);
    expect(cut).toMatch(/report partial data/);
    expect(cut).toMatch(/fewer ids, a smaller pageSize, or a narrower filter/);
  });
});

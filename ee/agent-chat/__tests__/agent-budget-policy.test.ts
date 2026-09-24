import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_RESERVATION_ROUNDS_AHEAD,
  AGENT_TOOL_RESULT_TRUNCATED_MARK,
  agentContextBytesToWorstCaseProviderTokens,
  agentContextTokensToBytes,
  agentToolResultText,
  agentRoundWorstCaseCredits,
  agentRoundWorstCaseCreditsForContextBytes,
  isAgentContextWithinBudget,
  resolveAgentTurnBudget,
  serializedAgentContextBytes,
} from "../agent-budget-policy";
import { buildAgentProviderContext, isAgentStepContextWithinBudget } from "../agent-provider-context";
import { MODEL_CATALOG, isAgentModelWithinBudgetEnvelope } from "../model-catalog";

const BALANCED = MODEL_CATALOG.balanced;
const FAST = MODEL_CATALOG.fast;

describe("agent turn credit budget", () => {
  it("pins every shipped model to its ZDR-compatible provider and configured inference region", () => {
    expect([
      { provider: FAST.servingProvider, region: FAST.inferenceRegion },
      { provider: BALANCED.servingProvider, region: BALANCED.inferenceRegion },
    ]).toEqual([
      { provider: "azure", region: null },
      { provider: "vertex", region: "eu" },
    ]);
  });

  it("gives every model its own full envelope, because affordability is no longer a smaller envelope", () => {
    for (const model of [FAST, BALANCED]) {
      const budget = resolveAgentTurnBudget({ model, availableCredits: 500 });

      expect(budget).toEqual(
        expect.objectContaining({
          modelSpec: model.modelId,
          servingProvider: model.servingProvider,
          inferenceRegion: model.inferenceRegion,
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
    const perRound = agentRoundWorstCaseCredits(BALANCED);
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: perRound });

    expect(budget?.reservedCredits).toBe(perRound);
  });

  it("refuses to start a provider round that cannot be fully reserved", () => {
    const perRound = agentRoundWorstCaseCredits(BALANCED);

    expect(resolveAgentTurnBudget({ model: BALANCED, availableCredits: perRound - 1 })).toBeNull();
    expect(resolveAgentTurnBudget({ model: BALANCED, availableCredits: perRound })).not.toBeNull();
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
    const tiered = {
      ...BALANCED,
      modelId: "openai/gpt-5.6-luna",
      servingProvider: "azure",
      inferenceRegion: null,
    };

    expect(isAgentModelWithinBudgetEnvelope(FAST)).toBe(true);
    expect(isAgentModelWithinBudgetEnvelope(BALANCED)).toBe(true);
    expect(isAgentModelWithinBudgetEnvelope({ ...tiered, maxContextTokens: 400_000 })).toBe(false);
    expect(resolveAgentTurnBudget({ model: BALANCED, availableCredits: 0 })).toBeNull();
    expect(
      resolveAgentTurnBudget({ model: { ...tiered, maxContextTokens: 400_000 }, availableCredits: 500 }),
    ).toBeNull();
  });

  it("checks the serialized context against the per-turn dynamic bound", () => {
    expect(isAgentContextWithinBudget({ value: "small" }, 100)).toBe(true);
    expect(isAgentContextWithinBudget({ value: "x".repeat(200) }, 100)).toBe(false);
  });

  it("prices every byte admitted from a dense serialized context within the reserved round", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableCredits: 500 });
    expect(budget).not.toBeNull();
    if (!budget) return;

    const denseContext = {
      messages: [{ role: "user", content: "!@#$%^&*()[]{}<>?/\\|~`".repeat(2_500) }],
    };
    const denseBytes = serializedAgentContextBytes(denseContext);
    expect(denseBytes).not.toBeNull();
    if (denseBytes === null) return;

    expect(isAgentContextWithinBudget(denseContext, budget.maxContextBytes)).toBe(true);
    const admittedTokenCeiling = agentContextBytesToWorstCaseProviderTokens(denseBytes);
    expect(admittedTokenCeiling).toBeLessThanOrEqual(BALANCED.maxContextTokens);
    expect(agentRoundWorstCaseCreditsForContextBytes(BALANCED, denseBytes)).toBeLessThanOrEqual(
      budget.roundReserveCredits,
    );
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

  it("counts tool schemas when a continuation is near the context boundary", () => {
    const messages = [{ role: "user", content: "x".repeat(900) }] as ModelMessage[];
    const withoutTools = buildAgentProviderContext("system", [], []);
    const withTools = buildAgentProviderContext(
      "system",
      [],
      [
        {
          name: "manage_records",
          description: "Create, update, and delete records.",
          inputSchema: {
            type: "object",
            properties: Object.fromEntries(
              Array.from({ length: 20 }, (_, index) => [`field_${index}`, { type: "string", description: "value" }]),
            ),
          },
        },
      ],
    );
    const messageOnlyBytes = serializedAgentContextBytes({ ...withoutTools, messages });
    const withToolsBytes = serializedAgentContextBytes({ ...withTools, messages });

    expect(messageOnlyBytes).not.toBeNull();
    expect(withToolsBytes).not.toBeNull();
    if (messageOnlyBytes === null || withToolsBytes === null) return;

    expect(withToolsBytes).toBeGreaterThan(messageOnlyBytes);
    expect(isAgentStepContextWithinBudget(withoutTools, messages, messageOnlyBytes)).toBe(true);
    expect(isAgentStepContextWithinBudget(withTools, messages, messageOnlyBytes)).toBe(false);
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

  const renewalRows = Array.from(
    { length: 300 },
    (_, index) => `  ${index + 1},Renewal-${String(index + 1).padStart(3, "0")},won,12000`,
  );
  const renewalPage = `items[300]{id,name,stage,totalValue}:\n${renewalRows.join("\n")}`;
  const keptPart = (cut: string) => cut.slice(0, cut.indexOf(`\n${AGENT_TOOL_RESULT_TRUNCATED_MARK}`));
  const reportedKept = (cut: string) => Number(/first (\d+) of \d+ characters/.exec(cut)?.[1]);

  it("cuts a multi-line result after its last complete line, never inside a row", () => {
    for (const cap of [512, 1_000, 6_000]) {
      const cut = agentToolResultText(renewalPage, cap);
      const kept = keptPart(cut);
      expect(cut.length, `cap ${cap}`).toBeLessThanOrEqual(cap);
      expect(renewalPage.startsWith(kept), `cap ${cap}`).toBe(true);
      expect(renewalPage[kept.length], `cap ${cap}`).toBe("\n");
      expect(renewalRows, `cap ${cap}`).toContain(kept.split("\n").at(-1));
    }
  });

  it("keeps the hard cut when the last line break would drop more than half of the budget", () => {
    const singleLine = "y".repeat(10_000);
    const shortHeadLine = `items[1]{note}:\n  ${"n".repeat(10_000)}`;
    for (const full of [singleLine, shortHeadLine]) {
      const cut = agentToolResultText(full, 600);
      const kept = keptPart(cut);
      expect(cut.length).toBeLessThanOrEqual(600);
      expect(full.startsWith(kept)).toBe(true);
      expect(kept.length).toBeGreaterThan(full.indexOf("\n") + 100);
      expect(cut).toContain(`first ${kept.length} of ${full.length} characters`);
    }
  });

  it("moves the cut to a line break exactly when that keeps at least half of the budget", () => {
    const withBreakAt = (at: number) => `${"a".repeat(at)}\n${"b".repeat(10_000 - at - 1)}`;
    const budgets = [600, 601].map((cap) => {
      const budget = keptPart(agentToolResultText("y".repeat(10_000), cap)).length;
      const half = Math.ceil(budget / 2);
      expect(keptPart(agentToolResultText(withBreakAt(half), cap)).length, `cap ${cap}`).toBe(half);
      expect(keptPart(agentToolResultText(withBreakAt(half - 1), cap)).length, `cap ${cap}`).toBe(budget);
      return budget;
    });
    expect(budgets[0] % 2).not.toBe(budgets[1] % 2);
  });

  it("reports the characters it actually kept and never exceeds the cap on multi-line results", () => {
    for (const cap of [1, 2, 40, 120, 300, 333, 511, 512, 1_000, 4_097, 6_000]) {
      const cut = agentToolResultText(renewalPage, cap);
      expect(cut.length, `cap ${cap}`).toBeLessThanOrEqual(cap);
      if (!cut.includes(AGENT_TOOL_RESULT_TRUNCATED_MARK)) continue;
      expect(reportedKept(cut), `cap ${cap}`).toBe(keptPart(cut).length);
    }
  });

  it("tells the model how to recover rather than only that it failed", () => {
    const cut = agentToolResultText("z".repeat(10_000), 600);
    expect(cut).toMatch(/re-run it with a smaller pageSize, about half, fewer ids, or a narrower filter/);
    expect(cut).toMatch(/Report partial data only once a smaller request has also been truncated/);
  });
});

describe("agent turn budget reasoning settings", () => {
  it("carries the entry's reasoning effort and thinking level into the turn budget", () => {
    const budget = resolveAgentTurnBudget({
      model: { ...BALANCED, reasoningEffort: "low", thinkingLevel: "medium" },
      availableCredits: 500,
    });

    expect(budget).toEqual(expect.objectContaining({ reasoningEffort: "low", thinkingLevel: "medium" }));
  });

  it("omits the reasoning keys entirely for a model without them", () => {
    const budget = resolveAgentTurnBudget({ model: MODEL_CATALOG.fast, availableCredits: 500 });

    expect(budget).not.toHaveProperty("reasoningEffort");
    expect(budget).not.toHaveProperty("thinkingLevel");
  });
});

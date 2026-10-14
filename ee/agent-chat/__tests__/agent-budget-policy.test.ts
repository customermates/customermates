import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_MAX_SERIALIZED_BYTES_PER_CHAR,
  AGENT_RESERVATION_ROUNDS_AHEAD,
  AGENT_TOOL_RESULT_ENVELOPE_BYTES,
  AGENT_TOOL_RESULT_TRUNCATED_MARK,
  agentContextBytesToWorstCaseProviderTokens,
  agentContextTokensToBytes,
  agentNextRoundContextBytes,
  agentPendingToolResultBytes,
  agentRoundReserveMicrocents,
  agentToolResultText,
  agentFundedRetryCount,
  agentWebSearchReserveMicrocents,
  agentRoundWorstCaseMicrocents,
  agentRoundWorstCaseMicrocentsForContextBytes,
  agentStepContext,
  isAgentContextWithinBudget,
  resolveAgentTurnBudget,
  serializedAgentContextBytes,
} from "../agent-budget-policy";
import { buildAgentProviderContext, isAgentStepContextWithinBudget } from "../agent-provider-context";
import {
  AGENT_MODELS,
  SHIPPED_AGENT_MODEL_KEY,
  isAgentModelWithinBudgetEnvelope,
  type AgentModelEntry,
} from "../model-catalog";
import { agentWebSearchCallLimit } from "../agent-web-search";
import { JEV_MODEL_ID, JEV_PRICING_PROVIDER } from "../classifier/jev-runner";

const CREDIT = 1_000_000;
const BALANCED = AGENT_MODELS.chat;
const CHEAPER: AgentModelEntry = {
  modelId: JEV_MODEL_ID,
  servingProvider: JEV_PRICING_PROVIDER,
  inferenceRegion: null,
  maxOutputTokens: 8192,
  maxContextTokens: 66_000,
  maxToolResultChars: 6000,
};

describe("agent turn credit budget", () => {
  it("pins the shipped model to its ZDR-compatible provider and configured inference region", () => {
    expect(SHIPPED_AGENT_MODEL_KEY).toBe("balanced");
    expect({ provider: BALANCED.servingProvider, region: BALANCED.inferenceRegion }).toEqual({
      provider: "vertexAnthropic",
      region: "eu",
    });
  });

  it("gives every model its own full envelope, because affordability is no longer a smaller envelope", () => {
    for (const model of [CHEAPER, BALANCED]) {
      const budget = resolveAgentTurnBudget({ model, availableMicrocents: 500 * CREDIT });

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

  it("prices the Knowledge Base synthesis output envelope before admitting a provider round", () => {
    const model = AGENT_MODELS.wikiSynthesis;
    const perRound = agentRoundWorstCaseMicrocents(model);

    expect(model.maxOutputTokens).toBe(16_384);
    expect(model.reasoningEffort).toBe("none");
    expect(perRound).toBe(2_276_120);
    expect(resolveAgentTurnBudget({ model, availableMicrocents: perRound - 1 })).toBeNull();
    expect(resolveAgentTurnBudget({ model, availableMicrocents: perRound })).toMatchObject({
      maxOutputTokens: 16_384,
      roundReserveMicrocents: perRound,
      reservedMicrocents: perRound,
    });
    expect(agentRoundWorstCaseMicrocents(AGENT_MODELS.chat)).toBe(1_825_560);
  });

  it("reserves a few rounds ahead rather than a whole worst-case turn", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: 500 * CREDIT });
    const perRound = agentRoundWorstCaseMicrocents(BALANCED);

    expect(budget?.roundReserveMicrocents).toBe(perRound);
    expect(budget?.reservedMicrocents).toBe(perRound * AGENT_RESERVATION_ROUNDS_AHEAD);
  });

  it("keeps the round worst case in exact microcents, without a whole-credit round-up or minimum", () => {
    expect(agentRoundWorstCaseMicrocents(BALANCED)).toBe(1_825_560);
    expect(Number.isSafeInteger(agentRoundWorstCaseMicrocents(CHEAPER))).toBe(true);
    expect(agentRoundWorstCaseMicrocents(CHEAPER) % CREDIT).not.toBe(0);
  });

  it.each([
    [0, 0],
    [1_999_999, 0],
    [2_000_000, 0],
    [3_999_999, 0],
    [4_000_000, 1],
    [5_999_999, 1],
    [6_000_000, 2],
    [20_000_000, 2],
  ])("funds %i microcents as at most %i retries beyond the admitted request", (remainingMicrocents, retries) => {
    expect(agentFundedRetryCount({ remainingMicrocents, roundReserveMicrocents: 2 * CREDIT, maxRetries: 2 })).toBe(
      retries,
    );
  });

  it("preserves the configured retry ceiling and disables retry funding on invalid bounds", () => {
    expect(
      agentFundedRetryCount({ remainingMicrocents: 20 * CREDIT, roundReserveMicrocents: 2 * CREDIT, maxRetries: 0 }),
    ).toBe(0);
    expect(
      agentFundedRetryCount({ remainingMicrocents: 20 * CREDIT, roundReserveMicrocents: 2 * CREDIT, maxRetries: 1 }),
    ).toBe(1);
    const valid = { remainingMicrocents: 6 * CREDIT, roundReserveMicrocents: 2 * CREDIT, maxRetries: 2 };
    for (const remainingMicrocents of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
      expect(agentFundedRetryCount({ ...valid, remainingMicrocents })).toBe(0);
    for (const roundReserveMicrocents of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(agentFundedRetryCount({ ...valid, roundReserveMicrocents })).toBe(0);
    for (const maxRetries of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])
      expect(agentFundedRetryCount({ ...valid, maxRetries })).toBe(0);
  });

  it("reserves the worst-case search price of every remaining search in exact microcents", () => {
    expect(agentWebSearchReserveMicrocents(3)).toBe(3_600_000);
    expect(agentWebSearchReserveMicrocents(2)).toBe(2_400_000);
    expect(agentWebSearchReserveMicrocents(1)).toBe(1_200_000);
    for (const none of [0, -1, 1.5, Number.NaN]) expect(agentWebSearchReserveMicrocents(none)).toBe(0);
  });

  it("reserves enough up front for the first round plus every search the turn may run", () => {
    const perRound = agentRoundWorstCaseMicrocents(BALANCED);
    const chatSearch = agentWebSearchReserveMicrocents(agentWebSearchCallLimit("chat"));
    const routineSearch = agentWebSearchReserveMicrocents(agentWebSearchCallLimit("routine"));

    expect({ chatSearch, routineSearch }).toEqual({
      chatSearch: 3_600_000,
      routineSearch: 2_400_000,
    });
    for (const [webSearchReserveMicrocents, reservedMicrocents] of [
      [chatSearch, 5_425_560],
      [routineSearch, 4_225_560],
    ]) {
      const budget = resolveAgentTurnBudget({
        model: BALANCED,
        availableMicrocents: 500 * CREDIT,
        webSearchReserveMicrocents,
      });
      expect(budget?.reservedMicrocents).toBe(reservedMicrocents);
      expect(budget?.reservedMicrocents).toBe(perRound + webSearchReserveMicrocents);
      expect(budget?.reservedMicrocents).toBeGreaterThan(perRound * AGENT_RESERVATION_ROUNDS_AHEAD);
    }
    expect(
      resolveAgentTurnBudget({
        model: BALANCED,
        availableMicrocents: 500 * CREDIT,
        webSearchReserveMicrocents: 20 * CREDIT,
      }),
    ).toMatchObject({ reservedMicrocents: perRound + 20 * CREDIT });
    expect(
      resolveAgentTurnBudget({
        model: BALANCED,
        availableMicrocents: 9 * CREDIT,
        webSearchReserveMicrocents: 20 * CREDIT,
      }),
    ).toMatchObject({ reservedMicrocents: 9 * CREDIT });
  });

  it("reserves strictly less for the cheaper model at the same envelope", () => {
    const fast = resolveAgentTurnBudget({ model: CHEAPER, availableMicrocents: 500 * CREDIT });
    const balanced = resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: 500 * CREDIT });

    expect(fast?.reservedMicrocents).toBeLessThan(balanced?.reservedMicrocents ?? 0);
  });

  it("never reserves more than the user actually has left", () => {
    const perRound = agentRoundWorstCaseMicrocents(BALANCED);
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: perRound });

    expect(budget?.reservedMicrocents).toBe(perRound);
  });

  it("refuses to start a provider round that cannot be fully reserved, to the microcent", () => {
    const perRound = agentRoundWorstCaseMicrocents(BALANCED);

    expect(resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: perRound - 1 })).toBeNull();
    expect(resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: perRound })).not.toBeNull();
  });

  it("refuses a user with no credits at all", () => {
    expect(resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: 0 })).toBeNull();
  });

  it("refuses a context the model's envelope cannot hold", () => {
    expect(
      resolveAgentTurnBudget({
        model: BALANCED,
        availableMicrocents: 500 * CREDIT,
        requiredContextBytes: agentContextTokensToBytes(BALANCED.maxContextTokens) + 1,
      }),
    ).toBeNull();
  });

  it("keeps the full tool-result allowance, which the old ladder used to trim away", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: 500 * CREDIT });

    expect(budget?.maxToolResultChars).toBe(BALANCED.maxToolResultChars);
  });

  it("measures the pricing-tier envelope in prompt tokens, per model", () => {
    const tiered = BALANCED;

    expect(isAgentModelWithinBudgetEnvelope(CHEAPER)).toBe(true);
    expect(isAgentModelWithinBudgetEnvelope(BALANCED)).toBe(true);
    expect(isAgentModelWithinBudgetEnvelope({ ...tiered, maxContextTokens: 400_000 })).toBe(false);
    expect(resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: 0 })).toBeNull();
    expect(
      resolveAgentTurnBudget({ model: { ...tiered, maxContextTokens: 400_000 }, availableMicrocents: 500 * CREDIT }),
    ).toBeNull();
  });

  it("checks the serialized context against the per-turn dynamic bound", () => {
    expect(isAgentContextWithinBudget({ value: "small" }, 100)).toBe(true);
    expect(isAgentContextWithinBudget({ value: "x".repeat(200) }, 100)).toBe(false);
  });

  it("prices every byte admitted from a dense serialized context within the reserved round", () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: 500 * CREDIT });
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
    expect(agentRoundWorstCaseMicrocentsForContextBytes(BALANCED, denseBytes)).toBeLessThanOrEqual(
      budget.roundReserveMicrocents,
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

  it("counts the system prompt once when the model step already contains it", () => {
    const context = buildAgentProviderContext("s".repeat(1_000), [{ role: "user", text: "hello" }], []);
    const messages = [{ role: "system", content: context.system }, ...context.messages] as ModelMessage[];
    const budget = serializedAgentContextBytes({ messages, tools: context.tools }) ?? 0;

    expect(budget).toBeGreaterThan(0);
    expect(agentStepContext({ ...context, messages })).toEqual({ messages, tools: context.tools });
    expect(serializedAgentContextBytes({ ...context, messages })).toBeGreaterThan(budget);
    expect(isAgentStepContextWithinBudget(context, messages, budget)).toBe(true);
    expect(isAgentStepContextWithinBudget(context, messages, budget - 1)).toBe(false);
  });

  it("still counts the system prompt when the step does not lead with that exact prompt", () => {
    const context = buildAgentProviderContext("s".repeat(1_000), [{ role: "user", text: "hello" }], []);
    const changed = [{ role: "system", content: "t".repeat(1_000) }, ...context.messages] as ModelMessage[];
    const later = [...context.messages, { role: "system", content: context.system }] as ModelMessage[];

    for (const messages of [changed, later]) {
      const both = serializedAgentContextBytes({ ...context, messages }) ?? 0;
      expect(agentStepContext({ ...context, messages })).toEqual({ ...context, messages });
      expect(isAgentStepContextWithinBudget(context, messages, both)).toBe(true);
      expect(isAgentStepContextWithinBudget(context, messages, both - 1)).toBe(false);
    }
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
  it("carries the entry's reasoning effort into the turn budget", () => {
    const budget = resolveAgentTurnBudget({
      model: { ...BALANCED, reasoningEffort: "high" },
      availableMicrocents: 500 * CREDIT,
    });

    expect(budget).toEqual(expect.objectContaining({ reasoningEffort: "high" }));
  });

  it("omits the reasoning keys entirely for a model without them", () => {
    const budget = resolveAgentTurnBudget({ model: CHEAPER, availableMicrocents: 500 * CREDIT });

    expect(budget).not.toHaveProperty("reasoningEffort");
  });
});

describe("per-round credit reserve", () => {
  const shippedBudget = () => {
    const budget = resolveAgentTurnBudget({ model: BALANCED, availableMicrocents: 10 * CREDIT });
    if (!budget) throw new Error("Expected the shipped model to be admitted with 10 credits.");
    return budget;
  };
  const appended = [
    { role: "assistant", content: [{ type: "tool-call", toolCallId: "call-1", toolName: "read", input: {} }] },
    {
      role: "tool",
      content: [
        {
          type: "tool-result",
          toolCallId: "call-1",
          toolName: "read",
          output: { type: "json", value: { ok: true, result: "row" } },
        },
      ],
    },
  ];

  it("prices a round from its own context at the full input price plus the longest reply", () => {
    expect(agentRoundReserveMicrocents(shippedBudget(), 120_000)).toBe(1_309_935);
    expect(agentRoundReserveMicrocents(shippedBudget(), 120_000)).toBe(
      agentRoundWorstCaseMicrocentsForContextBytes(BALANCED, 120_000),
    );
    expect(agentRoundReserveMicrocents(shippedBudget(), 30_000)).toBeLessThan(
      agentRoundReserveMicrocents(shippedBudget(), 120_000),
    );
  });

  it("never reserves more than the model's worst-case round, which a full context reaches", () => {
    const budget = shippedBudget();

    expect(agentRoundReserveMicrocents(budget, budget.maxContextBytes)).toBe(1_825_560);
    expect(agentRoundReserveMicrocents(budget, budget.maxContextBytes * 2)).toBe(1_825_560);
    expect(agentRoundReserveMicrocents({ ...budget, roundReserveMicrocents: CREDIT }, 120_000)).toBe(CREDIT);
  });

  it("reserves the worst-case round when the context size is unknown", () => {
    for (const bytes of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(agentRoundReserveMicrocents(shippedBudget(), bytes)).toBe(1_825_560);
  });

  it("prices a round from the provider's measured prompt plus the worst case of what was appended since", () => {
    const measured = { contextBytes: 120_000, promptTokens: 28_000 };

    expect(agentRoundReserveMicrocents(shippedBudget(), 130_000, measured)).toBe(904_310);
    expect(agentRoundReserveMicrocents(shippedBudget(), 120_000, measured)).toBe(835_560);
    expect(agentRoundReserveMicrocents(shippedBudget(), 130_000, measured)).toBeLessThan(
      agentRoundReserveMicrocents(shippedBudget(), 130_000),
    );
  });

  it("never prices a measured prompt above the context's own worst case", () => {
    expect(
      agentRoundReserveMicrocents(shippedBudget(), 120_000, { contextBytes: 100_000, promptTokens: 200_000 }),
    ).toBe(agentRoundReserveMicrocents(shippedBudget(), 120_000));
  });

  it("ignores a measurement that cannot bound the context, such as one from a larger or unmeasured prompt", () => {
    const unmeasured = agentRoundReserveMicrocents(shippedBudget(), 120_000);

    for (const measured of [
      { contextBytes: 150_000, promptTokens: 10_000 },
      { contextBytes: 100_000, promptTokens: 0 },
      { contextBytes: 100_000, promptTokens: 1.5 },
      { contextBytes: Number.NaN, promptTokens: 10_000 },
    ])
      expect(agentRoundReserveMicrocents(shippedBudget(), 120_000, measured)).toBe(unmeasured);
  });

  it("bounds a pending tool result by its character cap at the widest serialized character", () => {
    expect(agentPendingToolResultBytes(6_000)).toBe(
      6_000 * AGENT_MAX_SERIALIZED_BYTES_PER_CHAR + AGENT_TOOL_RESULT_ENVELOPE_BYTES,
    );
    expect(agentPendingToolResultBytes(60_000)).toBe(agentPendingToolResultBytes(6_000));
    expect(
      serializedAgentContextBytes({ ok: false, applied: false, result: "\u0001".repeat(6_000) }),
    ).toBeLessThanOrEqual(agentPendingToolResultBytes(6_000));
  });

  it("grows the next round's context by the round's output, its known results and each pending result", () => {
    const appendedBytes = serializedAgentContextBytes(appended) ?? Number.NaN;
    const next = (contextBytes: number, pendingToolResults: number) =>
      agentNextRoundContextBytes({
        contextBytes,
        appended,
        pendingToolResults,
        maxToolResultChars: 6_000,
        maxContextBytes: 198_000,
      });

    expect(next(120_000, 0)).toBe(120_000 + appendedBytes);
    expect(next(100_000, 2)).toBe(100_000 + appendedBytes + 2 * agentPendingToolResultBytes(6_000));
    expect(next(190_000, 1)).toBe(198_000);
  });

  it("assumes a full context when the round's output cannot be measured", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(
      agentNextRoundContextBytes({
        contextBytes: 1_000,
        appended: circular,
        pendingToolResults: 0,
        maxToolResultChars: 6_000,
        maxContextBytes: 198_000,
      }),
    ).toBe(198_000);
  });
});

import type { ModelMessage } from "ai";
import { describe, expect, it } from "vitest";

import {
  AGENT_MAX_CONTEXT_BYTES_PER_STEP,
  AGENT_MIN_OUTPUT_TOKENS_PER_STEP,
  AGENT_MAX_OUTPUT_TOKENS_PER_STEP,
  AGENT_MAX_STEPS_PER_TURN,
  agentTurnWorstCaseUsd,
  isAgentContextWithinBudget,
  isAgentModelWithinBudgetEnvelope,
  resolveAgentTurnBudget,
  serializedAgentContextBytes,
} from "../agent-budget-policy";
import { buildAgentProviderContext, isAgentStepContextWithinBudget } from "../agent-provider-context";

const MODEL = "openai:gpt-5.6-luna";

describe("agent turn credit budget", () => {
  it("uses the full safe envelope when the user has enough credits", () => {
    const budget = resolveAgentTurnBudget({
      availableCredits: 500,
    });

    expect(budget).toEqual(
      expect.objectContaining({
        maxSteps: AGENT_MAX_STEPS_PER_TURN,
        maxOutputTokens: AGENT_MAX_OUTPUT_TOKENS_PER_STEP,
        maxContextBytes: AGENT_MAX_CONTEXT_BYTES_PER_STEP,
      }),
    );
    expect(budget?.reservedCredits).toBe(Math.ceil(agentTurnWorstCaseUsd(MODEL) / 0.01));
    expect(budget?.reservedCredits).toBe(110);
  });

  it("shrinks the provider envelope to the user's remaining credits", () => {
    const budget = resolveAgentTurnBudget({
      availableCredits: 3,
    });

    expect(budget).not.toBeNull();
    expect(budget?.reservedCredits).toBe(3);
    if (!budget) throw new Error("Expected a three-credit turn budget.");
    expect(agentTurnWorstCaseUsd(MODEL, budget)).toBeLessThanOrEqual(0.03);
  });

  it("can safely admit a final one-credit request", () => {
    const budget = resolveAgentTurnBudget({
      availableCredits: 1,
    });

    expect(budget).not.toBeNull();
    expect(budget?.reservedCredits).toBe(1);
    expect(budget?.maxSteps).toBe(1);
    if (!budget) throw new Error("Expected a one-credit turn budget.");
    expect(agentTurnWorstCaseUsd(MODEL, budget)).toBeLessThanOrEqual(0.01);
  });

  it("rejects a turn when its required workflow cannot fit the funded step count", () => {
    expect(
      resolveAgentTurnBudget({
        availableCredits: 3,
        requiredContextBytes: 90_000,
        minimumSteps: 4,
      }),
    ).toBeNull();
    expect(
      resolveAgentTurnBudget({
        availableCredits: 500,
        requiredContextBytes: 90_000,
        minimumSteps: 4,
      }),
    ).toEqual(expect.objectContaining({ maxSteps: AGENT_MAX_STEPS_PER_TURN }));
  });

  it("funds a long full-catalog workflow without starving tool-call output", () => {
    const budget = resolveAgentTurnBudget({
      availableCredits: 500,
      requiredContextBytes: 160_000,
      minimumSteps: 4,
    });

    expect(budget).toEqual(
      expect.objectContaining({
        maxSteps: AGENT_MAX_STEPS_PER_TURN,
        maxContextBytes: AGENT_MAX_CONTEXT_BYTES_PER_STEP,
      }),
    );
    expect(budget?.maxOutputTokens).toBeGreaterThanOrEqual(800);
    expect(budget?.maxToolResultChars).toBeGreaterThanOrEqual(512);
  });

  it.each([40, 72, 96, 100, 112])(
    "preserves useful model output before adding steps with %i credits remaining",
    (availableCredits) => {
      const budget = resolveAgentTurnBudget({
        availableCredits,
        requiredContextBytes: 160_000,
        minimumSteps: 4,
      });

      expect(budget).not.toBeNull();
      expect(budget?.maxOutputTokens).toBeGreaterThanOrEqual(AGENT_MIN_OUTPUT_TOKENS_PER_STEP);
    },
  );

  it("rejects no-credit and unapproved-model admissions", () => {
    expect(
      resolveAgentTurnBudget({
        availableCredits: 0,
      }),
    ).toBeNull();
    expect(isAgentModelWithinBudgetEnvelope("openai:gpt-5.6-sol")).toBe(false);
    expect(isAgentModelWithinBudgetEnvelope(MODEL)).toBe(true);
  });

  it("checks the serialized context against the per-turn dynamic bound", () => {
    expect(isAgentContextWithinBudget({ value: "small" }, 100)).toBe(true);
    expect(isAgentContextWithinBudget({ value: "x".repeat(200) }, 100)).toBe(false);
  });

  it("counts the system prompt once and compacts stored hosted-search continuations", () => {
    const providerContext = buildAgentProviderContext(
      "system instructions",
      [{ role: "user", text: "hello" }],
      [{ name: "lookup", description: "Look up records.", inputSchema: { type: "object" } }],
    );
    expect(providerContext.messages).toEqual([{ role: "user", content: "hello" }]);

    const storedMessages = [
      ...providerContext.messages,
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolCallId: "search-call",
            toolName: "discover_customermates_tools",
            input: { arguments: { paths: ["records.lookup"] }, call_id: null },
            providerExecuted: true,
            providerOptions: { openai: { itemId: "tsc-catalog" } },
          },
          {
            type: "tool-result",
            toolCallId: "search-call",
            toolName: "discover_customermates_tools",
            output: { type: "json", value: { tools: [{ schema: "x".repeat(10_000) }] } },
            providerOptions: { openai: { itemId: "tso-catalog" } },
          },
        ],
      },
    ] as ModelMessage[];
    const maxContextBytes = 2_000;

    expect(serializedAgentContextBytes({ ...providerContext, messages: storedMessages })).toBeGreaterThan(
      maxContextBytes,
    );
    expect(isAgentStepContextWithinBudget(providerContext, storedMessages, maxContextBytes)).toBe(true);

    const unreferencedMessages = structuredClone(storedMessages);
    const assistant = unreferencedMessages.at(-1);
    if (assistant && Array.isArray(assistant.content))
      for (const part of assistant.content) if ("providerOptions" in part) delete part.providerOptions;

    expect(isAgentStepContextWithinBudget(providerContext, unreferencedMessages, maxContextBytes)).toBe(false);
  });
});

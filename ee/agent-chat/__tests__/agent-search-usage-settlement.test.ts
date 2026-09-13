import { describe, expect, it } from "vitest";

import { buildAgentUsageSettlement } from "../agent-usage-settlement";

const SEARCH_COST_MICROCENTS = 500_000;
const BASE = {
  model: "openai/gpt-5-nano",
  provider: "azure",
  tokens: { inputTokens: 35_329, outputTokens: 2_945, cacheReadTokens: 73_728, cacheWriteTokens: 0 },
  reservedCredits: 14,
  providerCharge: {
    billed: true,
    measuredCostMicrocents: 2_000_001,
    stepTokens: [],
    unreadableReason: null,
  },
};

describe("agent Search costs in the existing usage settlement", () => {
  it("adds Search fees to measured inference without calling the combined cost measured", () => {
    expect(buildAgentUsageSettlement({ ...BASE, toolCostMicrocents: SEARCH_COST_MICROCENTS })).toEqual({
      ...BASE.tokens,
      model: BASE.model,
      reservedCredits: 14,
      costMicrocents: 2_500_001,
      costSource: "estimated",
      chargedCredits: 3,
      policyBreach: false,
      state: "settled",
    });
  });

  it("retains Search fees when unreadable inference billing falls back to token pricing", () => {
    expect(
      buildAgentUsageSettlement({
        ...BASE,
        providerCharge: { ...BASE.providerCharge, measuredCostMicrocents: null, unreadableReason: "missing" },
        toolCostMicrocents: SEARCH_COST_MICROCENTS,
      }),
    ).toMatchObject({
      costMicrocents: 868_173,
      costSource: "estimated",
      chargedCredits: 1,
      policyBreach: false,
    });
  });

  it("retains Search fees when inference fallback is priced per step", () => {
    const steps = [
      { inputTokens: 27, outputTokens: 251, cacheReadTokens: 143_000, cacheWriteTokens: 37_210 },
      { inputTokens: 0, outputTokens: 276, cacheReadTokens: 144_247, cacheWriteTokens: 0 },
    ];

    expect(
      buildAgentUsageSettlement({
        ...BASE,
        model: "openai/gpt-5.6-luna",
        tokens: { inputTokens: 27, outputTokens: 527, cacheReadTokens: 287_247, cacheWriteTokens: 37_210 },
        providerCharge: {
          billed: true,
          measuredCostMicrocents: null,
          stepTokens: steps,
          unreadableReason: "missing",
        },
        toolCostMicrocents: SEARCH_COST_MICROCENTS,
      }),
    ).toMatchObject({ costMicrocents: 2_068_524, costSource: "estimated", chargedCredits: 3 });
  });

  it("charges Search when the inference provider proves it did not bill", () => {
    expect(
      buildAgentUsageSettlement({
        ...BASE,
        providerCharge: { ...BASE.providerCharge, billed: false },
        toolCostMicrocents: SEARCH_COST_MICROCENTS,
      }),
    ).toMatchObject({
      costMicrocents: SEARCH_COST_MICROCENTS,
      costSource: "estimated",
      chargedCredits: 1,
      policyBreach: false,
    });
  });

  it.each([
    { billed: true, measuredCostMicrocents: 2_000_001 },
    { billed: true, measuredCostMicrocents: null },
    { billed: false, measuredCostMicrocents: null },
    { billed: true, measuredCostMicrocents: 0 },
  ])("preserves existing settlement with no Search cost: %j", (charge) => {
    const args = { ...BASE, providerCharge: { ...BASE.providerCharge, ...charge } };
    expect(buildAgentUsageSettlement({ ...args, toolCostMicrocents: 0 })).toEqual(buildAgentUsageSettlement(args));
    expect(buildAgentUsageSettlement({ ...args, toolCostMicrocents: undefined })).toEqual(
      buildAgentUsageSettlement(args),
    );
  });

  it.each([
    { inference: 499_999, search: SEARCH_COST_MICROCENTS, expectedCredits: 1 },
    { inference: 500_000, search: SEARCH_COST_MICROCENTS, expectedCredits: 1 },
    { inference: 500_001, search: SEARCH_COST_MICROCENTS, expectedCredits: 2 },
    { inference: 500_001, search: SEARCH_COST_MICROCENTS * 3, expectedCredits: 3 },
  ])("rounds credits once on the all-in cost: %j", ({ inference, search, expectedCredits }) => {
    expect(
      buildAgentUsageSettlement({
        ...BASE,
        providerCharge: { ...BASE.providerCharge, measuredCostMicrocents: inference },
        toolCostMicrocents: search,
      }),
    ).toMatchObject({ chargedCredits: expectedCredits, policyBreach: false });
  });

  it("applies the existing reservation ceiling to inference plus Search", () => {
    expect(
      buildAgentUsageSettlement({
        ...BASE,
        reservedCredits: 2,
        providerCharge: { ...BASE.providerCharge, measuredCostMicrocents: 1_500_001 },
        toolCostMicrocents: SEARCH_COST_MICROCENTS,
      }),
    ).toMatchObject({ costMicrocents: 2_000_001, chargedCredits: 2, policyBreach: true });
  });

  it("applies the existing reservation ceiling to paid tools without inference billing", () => {
    expect(
      buildAgentUsageSettlement({
        ...BASE,
        reservedCredits: 1,
        providerCharge: { ...BASE.providerCharge, billed: false },
        toolCostMicrocents: SEARCH_COST_MICROCENTS * 3,
      }),
    ).toMatchObject({ costMicrocents: 1_500_000, chargedCredits: 1, policyBreach: true });
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1, null])(
    "rejects invalid Search cost %s even when the inference provider did not bill",
    (toolCostMicrocents) => {
      expect(() =>
        buildAgentUsageSettlement({
          ...BASE,
          providerCharge: { ...BASE.providerCharge, billed: false },
          toolCostMicrocents: toolCostMicrocents as number,
        }),
      ).toThrow("Agent tool cost must be a non-negative whole number of microcents.");
    },
  );

  it("rejects aggregate overflow even when each cost is independently safe", () => {
    expect(() =>
      buildAgentUsageSettlement({
        ...BASE,
        providerCharge: { ...BASE.providerCharge, measuredCostMicrocents: Number.MAX_SAFE_INTEGER },
        toolCostMicrocents: 1,
      }),
    ).toThrow();
  });

  it("accepts the largest safe aggregate", () => {
    expect(
      buildAgentUsageSettlement({
        ...BASE,
        providerCharge: {
          ...BASE.providerCharge,
          measuredCostMicrocents: Number.MAX_SAFE_INTEGER - SEARCH_COST_MICROCENTS,
        },
        toolCostMicrocents: SEARCH_COST_MICROCENTS,
      }),
    ).toMatchObject({ costMicrocents: Number.MAX_SAFE_INTEGER, chargedCredits: 14, policyBreach: true });
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "does not let Search costs mask invalid inference cost %s",
    (measuredCostMicrocents) => {
      expect(() =>
        buildAgentUsageSettlement({
          ...BASE,
          providerCharge: { ...BASE.providerCharge, measuredCostMicrocents },
          toolCostMicrocents: SEARCH_COST_MICROCENTS,
        }),
      ).toThrow();
    },
  );
});

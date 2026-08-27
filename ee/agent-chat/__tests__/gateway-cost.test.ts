import { describe, expect, it } from "vitest";

import { readAgentProviderCharge } from "../gateway-cost";

function billedMetadata(overrides: Record<string, unknown> = {}, routingOverrides: Record<string, unknown> = {}) {
  return {
    gateway: {
      routing: {
        originalModelId: "openai/gpt-5-nano",
        resolvedProvider: "openai",
        canonicalSlug: "openai/gpt-5-nano",
        finalProvider: "openai",
        modelAttemptCount: 1,
        modelAttempts: [
          {
            canonicalSlug: "openai/gpt-5-nano",
            success: true,
            providerAttemptCount: 1,
            providerAttempts: [{ provider: "openai", credentialType: "system", success: true }],
          },
        ],
        totalProviderAttemptCount: 1,
        ...routingOverrides,
      },
      cost: "0.00331309",
      marketCost: "0.00331309",
      surchargeCost: "0",
      gatewayCost: "0.00331309",
      inferenceCost: "0.00331309",
      generationId: "gen_01M0QTS0NKJMJMMYA0JGKZM6SF",
      ...overrides,
    },
  };
}

const rateLimitedMetadata = {
  gateway: {
    routing: {
      originalModelId: "openai/gpt-5-nano",
      resolvedProvider: "openai",
      canonicalSlug: "openai/gpt-5-nano",
      modelAttemptCount: 1,
      modelAttempts: [
        { canonicalSlug: "openai/gpt-5-nano", success: false, providerAttemptCount: 0, providerAttempts: [] },
      ],
      totalProviderAttemptCount: 0,
    },
    generationId: "gen_01M0QV6E7504PC55JF8WPBZRTT",
  },
};

const AZURE_SERVED_LUNA = {
  gateway: {
    routing: {
      canonicalSlug: "openai/gpt-5.6-luna",
      finalProvider: "azure",
      modelAttempts: [
        {
          canonicalSlug: "openai/gpt-5.6-luna",
          success: true,
          providerAttemptCount: 1,
          providerAttempts: [
            {
              provider: "azure",
              credentialType: "system",
              success: true,
              statusCode: 200,
              providerRequestId: "b30138d7-ab40-4377-be97-e5fb2726c501",
            },
          ],
        },
      ],
      totalProviderAttemptCount: 1,
    },
    inferenceCost: "0.000041",
    cost: "0.000041",
    surchargeCost: "0",
  },
};

describe("gateway provider charge", () => {
  it("reads the inline cost of a served generation as exact microcents", () => {
    expect(readAgentProviderCharge(billedMetadata(), "openai")).toEqual({
      outcome: "measured",
      charge: {
        costMicrocents: 331_309,
        finalProvider: "openai",
        generationId: "gen_01M0QTS0NKJMJMMYA0JGKZM6SF",
      },
    });
  });

  it("prefers the inference cost over the surcharged total", () => {
    const reading = readAgentProviderCharge(
      billedMetadata({ cost: "0.00400000", inferenceCost: "0.00331309" }),
      "openai",
    );

    expect(reading).toMatchObject({ outcome: "measured", charge: { costMicrocents: 331_309 } });
  });

  it("rounds a cost finer than one microcent up rather than dropping it", () => {
    expect(readAgentProviderCharge(billedMetadata({ inferenceCost: "0.000000005" }), "openai")).toMatchObject({
      outcome: "measured",
      charge: { costMicrocents: 1 },
    });
  });

  it("reports a rate-limited call as not billed so its reservation can be released", () => {
    expect(readAgentProviderCharge(rateLimitedMetadata, "openai")).toEqual({ outcome: "notBilled" });
  });

  it.each([
    [
      "a credential this platform does not bill",
      billedMetadata(
        {},
        {
          modelAttempts: [
            {
              success: true,
              providerAttempts: [{ provider: "openai", credentialType: "byok", success: true }],
            },
          ],
        },
      ),
    ],
    ["an unpinned serving provider", billedMetadata({}, { finalProvider: "azure" })],
    ["an unpriced service tier", billedMetadata({ serviceTier: "flex" })],
    ["an unattributable upstream cost", billedMetadata({ upstreamInferenceCost: "0.0001" })],
    ["no usable cost figure", billedMetadata({ cost: undefined, inferenceCost: undefined })],
    ["no gateway metadata at all", { openai: {} }],
  ])("refuses to price %s", (_case, metadata) => {
    const reading = readAgentProviderCharge(metadata, "openai");

    expect(reading.outcome).toBe("unreadable");
    if (reading.outcome !== "unreadable") throw new Error("Expected an unreadable charge.");
    expect(reading.reason.length).toBeGreaterThan(0);
  });

  it("refuses the real azure routing payload that prices the shipped model at five times the pinned rate", () => {
    const reading = readAgentProviderCharge(AZURE_SERVED_LUNA, "openai");

    expect(reading.outcome).toBe("unreadable");
    expect(readAgentProviderCharge(AZURE_SERVED_LUNA, "azure")).toMatchObject({
      outcome: "measured",
      charge: { costMicrocents: 4_100, finalProvider: "azure" },
    });
  });

  it("accepts a zero upstream cost, which the gateway reports for its own served models", () => {
    expect(readAgentProviderCharge(billedMetadata({ upstreamInferenceCost: "0" }), "openai")).toMatchObject({
      outcome: "measured",
    });
  });
});

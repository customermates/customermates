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

const VERTEX_NATIVE_SEARCH = {
  gateway: {
    routing: {
      finalProvider: "vertex",
      modelAttempts: [
        {
          canonicalSlug: "google/gemini-3.5-flash-lite",
          success: true,
          providerAttempts: [{ provider: "vertex", credentialType: "system", success: true }],
        },
      ],
    },
    cost: "0.00770279",
    inferenceCost: "0.00070279",
    surchargeCost: "0.0001",
    gatewayCost: "0.00780279",
    enabledZDR: true,
    gatewayToolCalls: { exa_search: 1 },
    generationId: "gen_synthetic_native_search",
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

  it("uses the authoritative total cost, including provider-tool charges", () => {
    const reading = readAgentProviderCharge(
      billedMetadata({ cost: "0.00400000", gatewayCost: "0.00400000", inferenceCost: "0.00331309" }),
      "openai",
    );

    expect(reading).toMatchObject({ outcome: "measured", charge: { costMicrocents: 400_000 } });
  });

  it("rounds a cost finer than one microcent up rather than dropping it", () => {
    expect(readAgentProviderCharge(billedMetadata({ gatewayCost: "0.000000005" }), "openai")).toMatchObject({
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
    ["no usable cost figure", billedMetadata({ gatewayCost: undefined })],
    ["no gateway metadata at all", { openai: {} }],
  ])("refuses to price %s", (_case, metadata) => {
    const reading = readAgentProviderCharge(metadata, "openai");

    expect(reading.outcome).toBe("unreadable");
    if (reading.outcome !== "unreadable") throw new Error("Expected an unreadable charge.");
    expect(reading.reason.length).toBeGreaterThan(0);
  });

  it("accepts the real Azure routing payload only when Azure is the expected provider", () => {
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

  it("settles the full native Search debit, including the Gateway surcharge", () => {
    expect(readAgentProviderCharge(VERTEX_NATIVE_SEARCH, "vertex")).toEqual({
      outcome: "measured",
      charge: {
        costMicrocents: 780_279,
        finalProvider: "vertex",
        generationId: "gen_synthetic_native_search",
      },
    });
  });

  it("does not add Search charges again when the authoritative debit already includes them", () => {
    const metadata = {
      gateway: {
        ...VERTEX_NATIVE_SEARCH.gateway,
        cost: "0.01470279",
        gatewayCost: "0.01480279",
        gatewayToolCalls: { exa_search: 2 },
      },
    };
    expect(readAgentProviderCharge(metadata, "vertex")).toMatchObject({
      outcome: "measured",
      charge: { costMicrocents: 1_480_279 },
    });
  });

  it("accepts a valid authoritative total without requiring the legacy cost alias", () => {
    expect(readAgentProviderCharge(billedMetadata({ cost: undefined }), "openai")).toMatchObject({
      outcome: "measured",
      charge: { costMicrocents: 331_309 },
    });
  });

  it.each([undefined, null, "", "garbage", -1, 0.00580279, "-0.005", "NaN", "Infinity", "90071992.54740992"])(
    "does not fall back to the legacy alias when authoritative debit %s is malformed",
    (gatewayCost) => {
      expect(readAgentProviderCharge(billedMetadata({ gatewayCost }), "openai").outcome).toBe("unreadable");
    },
  );

  it.each([undefined, null, "", "0.0001", "0.000000001", "-0.0001", 0])(
    "rejects legacy responses without proven zero surcharge: %s",
    (surchargeCost) => {
      const metadata = { gateway: { ...AZURE_SERVED_LUNA.gateway, surchargeCost } };
      expect(readAgentProviderCharge(metadata, "azure").outcome).toBe("unreadable");
    },
  );

  it("does not treat a contradictory nonzero debit as a free rate-limited request", () => {
    const metadata = { gateway: { ...rateLimitedMetadata.gateway, gatewayCost: "0.00580279" } };
    expect(readAgentProviderCharge(metadata, "openai").outcome).toBe("unreadable");
  });

  it("does not round a nonzero upstream charge to zero", () => {
    expect(readAgentProviderCharge(billedMetadata({ upstreamInferenceCost: "0.000000001" }), "openai").outcome).toBe(
      "unreadable",
    );
  });
});

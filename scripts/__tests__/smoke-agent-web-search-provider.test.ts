import { asSchema } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { getAgentWebSearchTool } from "@/ee/agent-chat/agent-web-search";
import { MODEL_CATALOG, SHIPPED_AGENT_MODEL_KEY } from "@/ee/agent-chat/model-catalog";

import {
  AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS,
  AGENT_WEB_SEARCH_SMOKE_MAX_USD,
  assertProviderSmokeFeasible,
  assertProviderSmokeRequest,
  inspectProviderSmokeBilling,
  inspectProviderSmokeSerialization,
  readProviderSmokePostRunThreshold,
  requestedAdversarialOverrides,
  runProviderSmoke,
} from "../smoke-agent-web-search-provider";

const MODEL = MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY];
const GENERATION_ID = "gen_01M0QTS0NKJMJMMYA0JGKZM6SF";

function generation(overrides: Partial<Parameters<typeof inspectProviderSmokeBilling>[1]> = {}) {
  return {
    id: GENERATION_ID,
    totalCost: 0.0074,
    usage: 0.0074,
    upstreamInferenceCost: 0,
    model: MODEL.modelId,
    providerName: MODEL.servingProvider,
    isByok: false,
    createdAt: "2026-09-13T00:00:00.000Z",
    streamed: false,
    finishReason: "tool_calls",
    latency: 1,
    generationTime: 1,
    promptTokens: 100,
    completionTokens: 10,
    reasoningTokens: 0,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    billableWebSearchCalls: 0,
    ...overrides,
  };
}

function metadata(overrides: Record<string, unknown> = {}, region: string | null = MODEL.inferenceRegion) {
  return {
    gateway: {
      generationId: GENERATION_ID,
      cost: "0.00730000",
      gatewayCost: "0.00740000",
      surchargeCost: "0.00010000",
      inferenceCost: "0.00030000",
      gatewayToolCalls: { exa_search: 1 },
      enabledZeroDataRetention: true,
      enabledDisallowPromptTraining: true,
      upstreamInferenceCost: "0",
      routing: {
        finalProvider: MODEL.servingProvider,
        modelAttempts: [
          {
            providerAttempts: [
              {
                success: true,
                provider: MODEL.servingProvider,
                credentialType: "system",
                inferenceEndpoint: region ? { scope: "zone", geoRegion: region } : null,
              },
            ],
          },
        ],
      },
      ...overrides,
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("web-search offline feasibility guard", () => {
  it("keeps the real paid smoke explicit and operationally bounded", () => {
    expect(AGENT_WEB_SEARCH_SMOKE_MAX_USD).toBe(15);
    expect(assertProviderSmokeFeasible()).toEqual({
      maxOuterModelRequests: 2,
      expectedNativeSearchCalls: 1,
      maxRetries: 0,
      maxOutputTokensPerRequest: 512,
      timeoutMs: 60_000,
      publicHomepageOnly: "customermates.com",
    });
    expect(() => readProviderSmokePostRunThreshold()).toThrow("request a paid smoke");
    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "true");
    vi.stubEnv("AGENT_WEB_SEARCH_SMOKE_MAX_USD", "15");
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-key");
    expect(readProviderSmokePostRunThreshold()).toBe(15);
    expect(AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS).toHaveLength(3);
  });

  it.each(["", "NaN", "-1", "0", "15.01", "Infinity", "1e3"])(
    "rejects invalid post-run threshold %s",
    (threshold) => {
      vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "true");
      vi.stubEnv("AGENT_WEB_SEARCH_SMOKE_MAX_USD", threshold);
      expect(() => readProviderSmokePostRunThreshold()).toThrow();
    },
  );

  it("refuses paid opt-in without the existing Gateway credential", async () => {
    const fetch = vi.fn(() => {
      throw new Error("Network must not run.");
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "true");
    vi.stubEnv("AGENT_WEB_SEARCH_SMOKE_MAX_USD", "15");
    vi.stubEnv("AI_GATEWAY_API_KEY", "");
    await expect(runProviderSmoke()).rejects.toThrow("AI_GATEWAY_API_KEY");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("captures actual SDK native serialization without sending a network request", async () => {
    const fetch = vi.fn(() => {
      throw new Error("Network must not run.");
    });
    vi.stubGlobal("fetch", fetch);
    const evidence = await inspectProviderSmokeSerialization();
    expect(fetch).not.toHaveBeenCalled();
    expect(evidence).toMatchObject({
      mode: "offline",
      networkRequests: 0,
      spentUsd: 0,
      paidExecutionAvailable: false,
      serialization: {
        phase: "search",
        model: MODEL.modelId,
        provider: "vertex",
        inferenceRegion: "eu",
        inputSchemaSent: false,
        nativeTools: [
          {
            type: "provider",
            name: "web_search",
            id: "gateway.exa_search",
            args: {
              type: "auto",
              numResults: 3,
              includeDomains: ["customermates.com"],
              contents: {
                text: { maxCharacters: 1000, verbosity: "compact" },
              },
            },
          },
        ],
        providerOptions: {
          gateway: {
            only: ["vertex"],
            inferenceRegion: { scope: "zone", geoRegion: "eu" },
            zeroDataRetention: true,
            disallowPromptTraining: true,
          },
        },
      },
    });
    expect(evidence.serialization.nativeTools[0]).not.toHaveProperty("inputSchema");
  });

  it("keeps bounded developer config alongside the model-visible override fields", async () => {
    const tool = getAgentWebSearchTool({
      allowedDomains: ["customermates.com"],
    });
    const inputSchema = asSchema(tool.inputSchema);
    const input = {
      query: "Customermates homepage",
      type: "auto",
      num_results: 100,
      include_domains: ["example.com"],
      contents: {
        text: { max_characters: 10_000, verbosity: "full" },
        highlights: { max_characters: 10_000 },
        subpages: 10,
        extras: { links: 10, image_links: 10 },
      },
    };
    expect(await inputSchema.validate?.(input)).toEqual({
      success: true,
      value: input,
    });
    expect(tool).toMatchObject({
      type: "provider",
      id: "gateway.exa_search",
      args: {
        type: "auto",
        numResults: 3,
        includeDomains: ["customermates.com"],
        contents: {
          text: { maxCharacters: 1000, verbosity: "compact" },
        },
      },
    });
  });

  it("accepts only the exact expected domain in the model's attempted override", () => {
    const call = (includeDomains: unknown[]) => ({
      input: {
        type: "auto",
        num_results: 4,
        include_domains: includeDomains,
        contents: { text: { max_characters: 1_100, verbosity: "standard" } },
      },
    });

    expect(requestedAdversarialOverrides(call(["customermates.com"]))).toBe(true);
    expect(requestedAdversarialOverrides(call(["customermates.com.attacker.example"]))).toBe(false);
    expect(requestedAdversarialOverrides(call(["attacker-customermates.com"]))).toBe(false);
    expect(requestedAdversarialOverrides(call(["customermates.com", "attacker.example"]))).toBe(false);
  });

  it("runs the default command as an offline-only check", async () => {
    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "");
    expect(await runProviderSmoke()).toMatchObject({
      mode: "offline",
      networkRequests: 0,
      spentUsd: 0,
    });
  });

  it("rejects drift instead of accepting a stale provider request", async () => {
    const request = new Request("https://ai-gateway.vercel.sh/v4/ai/language-model", {
      method: "POST",
      headers: { "ai-language-model-id": "openai/gpt-5.6-luna" },
      body: JSON.stringify({
        maxOutputTokens: 257,
        tools: [{ type: "provider", id: "openai.web_search" }],
      }),
    });
    await expect(assertProviderSmokeRequest(request)).rejects.toThrow("current model, provider, region");
  });

  it("rejects malformed and oversized offline request data", async () => {
    const request = (body: string) =>
      new Request("https://ai-gateway.vercel.sh/v4/ai/language-model", {
        method: "POST",
        body,
      });
    await expect(assertProviderSmokeRequest(request("not-json"))).rejects.toThrow("not JSON");
    await expect(assertProviderSmokeRequest(request(" ".repeat(256_001)))).rejects.toThrow("serialization bound");
  });
});

describe("read-only all-in billing receipt inspection", () => {
  it("reconciles the Exa charge inside the authoritative Gateway total", () => {
    expect(inspectProviderSmokeBilling(metadata(), generation())).toEqual({
      authoritativeMicrocents: 740_000,
      billedSearches: 1,
      generationBillableWebSearchCalls: 0,
      measuredSearchCostUsd: 0.007,
      searchCostInclusionVerified: true,
      modelInferenceZeroDataRetention: true,
      releasePrerequisitesSatisfied: false,
    });
  });

  it.each([
    { totalCost: 0.0003, usage: 0.0003 },
    { totalCost: Number.NaN },
    { totalCost: -1 },
    { providerName: "azure" },
    { model: "other-model" },
    { isByok: true },
    { upstreamInferenceCost: 0.001 },
    { billableWebSearchCalls: -1 },
    { billableWebSearchCalls: 1.5 },
    { id: "different-receipt" },
    { usage: 1 },
  ])("rejects inconsistent, missing-search, or differently served receipts", (overrides) => {
    expect(() => inspectProviderSmokeBilling(metadata(), generation(overrides))).toThrow("did not reconcile");
  });

  it("requires the resolved EU region and authoritative total cost", () => {
    expect(() => inspectProviderSmokeBilling(metadata({}, "us"), generation())).toThrow("did not reconcile");
    expect(() => inspectProviderSmokeBilling(metadata({ gatewayCost: undefined }), generation())).toThrow(
      "did not reconcile",
    );
  });

  it.each([
    { gatewayToolCalls: undefined },
    { gatewayToolCalls: { exa_search: 0 } },
    { gatewayToolCalls: { exa_search: 1.5 } },
    { gatewayToolCalls: { exa_search: 2 } },
    { inferenceCost: "0.00730000" },
    { inferenceCost: undefined },
    { enabledZeroDataRetention: false },
    { enabledDisallowPromptTraining: false },
  ])("refuses incomplete native-search billing evidence", (overrides) => {
    expect(() => inspectProviderSmokeBilling(metadata(overrides), generation())).toThrow("did not reconcile");
  });
});

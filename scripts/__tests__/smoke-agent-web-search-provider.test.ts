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
  readProviderSmokeCeiling,
  runProviderSmoke,
} from "../smoke-agent-web-search-provider";

const MODEL = MODEL_CATALOG[SHIPPED_AGENT_MODEL_KEY];
const GENERATION_ID = "gen_01M0QTS0NKJMJMMYA0JGKZM6SF";

function generation(overrides: Partial<Parameters<typeof inspectProviderSmokeBilling>[1]> = {}) {
  return {
    id: GENERATION_ID,
    totalCost: 0.0053,
    usage: 0.0053,
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
    billableWebSearchCalls: 1,
    ...overrides,
  };
}

function metadata(overrides: Record<string, unknown> = {}, region: string | null = MODEL.inferenceRegion) {
  return {
    gateway: {
      generationId: GENERATION_ID,
      cost: "0.00530000",
      inferenceCost: "0.00030000",
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
  it("does not infer a provider spend bound from an approved budget", () => {
    expect(AGENT_WEB_SEARCH_SMOKE_MAX_USD).toBe(15);
    expect(() => assertProviderSmokeFeasible()).toThrow("One HTTP request is not");
    expect(() => readProviderSmokeCeiling()).toThrow("request a paid smoke");
    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "true");
    vi.stubEnv("AGENT_WEB_SEARCH_SMOKE_MAX_USD", "15");
    expect(() => readProviderSmokeCeiling()).toThrow("disabled before network access");
    expect(AGENT_WEB_SEARCH_FEASIBILITY_BLOCKERS).toHaveLength(4);
  });

  it.each(["", "NaN", "-1", "0", "15.01", "Infinity", "1e3"])("rejects invalid aggregate ceiling %s", (ceiling) => {
    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "true");
    vi.stubEnv("AGENT_WEB_SEARCH_SMOKE_MAX_USD", ceiling);
    expect(() => readProviderSmokeCeiling()).toThrow();
  });

  it("refuses paid opt-in before any network or credential use", async () => {
    const fetch = vi.fn(() => {
      throw new Error("Network must not run.");
    });
    vi.stubGlobal("fetch", fetch);
    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "true");
    vi.stubEnv("AGENT_WEB_SEARCH_SMOKE_MAX_USD", "15");
    vi.stubEnv("AI_GATEWAY_API_KEY", "synthetic-must-not-be-used");
    await expect(runProviderSmoke()).rejects.toThrow("disabled before network access");
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
        model: MODEL.modelId,
        provider: "vertex",
        inferenceRegion: "eu",
        inputSchemaSent: false,
        nativeTools: [
          {
            type: "provider",
            name: "web_search",
            id: "gateway.perplexity_search",
            args: {
              maxResults: 3,
              maxTokens: 1024,
              maxTokensPerPage: 512,
              searchDomainFilter: ["iana.org"],
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
    expect(evidence.serialization.providerOptions.openai).not.toHaveProperty("maxToolCalls");
    expect(evidence.serialization.nativeTools[0]).not.toHaveProperty("inputSchema");
  });

  it("shows that the installed runtime schema permits parameters above configured defaults", async () => {
    const tool = getAgentWebSearchTool({ allowedDomains: ["iana.org"] });
    const inputSchema = asSchema(tool.inputSchema);
    const input = {
      query: Array.from({ length: 6 }, (_, index) => "synthetic query " + index),
      max_results: 20,
      max_tokens: 1_000_000,
      max_tokens_per_page: 2048,
      search_domain_filter: ["example.com"],
    };
    const result = await inputSchema.validate?.(input);
    expect(result).toEqual({ success: true, value: input });
    expect(tool.args).toMatchObject({
      maxResults: 3,
      maxTokens: 1024,
      maxTokensPerPage: 512,
      searchDomainFilter: ["iana.org"],
    });
    expect(tool).toMatchObject({ type: "provider", id: "gateway.perplexity_search" });
  });

  it("runs the default command as an offline-only check", async () => {
    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "");
    expect(await runProviderSmoke()).toMatchObject({ mode: "offline", networkRequests: 0, spentUsd: 0 });
  });

  it("rejects drift instead of accepting a stale Azure/OpenAI smoke request", async () => {
    const request = new Request("https://ai-gateway.vercel.sh/v4/ai/language-model", {
      method: "POST",
      headers: { "ai-language-model-id": "openai/gpt-5.6-luna" },
      body: JSON.stringify({ maxOutputTokens: 257, tools: [{ type: "provider", id: "openai.web_search" }] }),
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
    await expect(assertProviderSmokeRequest(request(" ".repeat(64_001)))).rejects.toThrow("serialization bound");
  });
});

describe("read-only all-in billing receipt inspection", () => {
  it("reconciles total Gateway charge rather than the smaller inference-only charge", () => {
    expect(inspectProviderSmokeBilling(metadata(), generation())).toEqual({
      authoritativeMicrocents: 530_000,
      billedSearches: 1,
      searchCostInclusionVerified: false,
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
    { billableWebSearchCalls: 0 },
    { billableWebSearchCalls: 1.5 },
    { id: "different-receipt" },
    { usage: 1 },
  ])("rejects inconsistent, missing-search, or differently served receipts", (overrides) => {
    expect(() => inspectProviderSmokeBilling(metadata(), generation(overrides))).toThrow("did not reconcile");
  });

  it("requires the resolved inference region and the authoritative cost field", () => {
    expect(() => inspectProviderSmokeBilling(metadata({}, "us"), generation())).toThrow("did not reconcile");
    expect(() => inspectProviderSmokeBilling(metadata({ cost: undefined }), generation())).toThrow("did not reconcile");
  });
});

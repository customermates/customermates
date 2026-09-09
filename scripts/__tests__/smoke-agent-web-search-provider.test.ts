import { createGateway } from "ai";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MODEL_CATALOG } from "@/ee/agent-chat/model-catalog";

import {
  AGENT_WEB_SEARCH_SMOKE_MAX_USD,
  assertProviderSmokeRequest,
  assertProviderSmokeSources,
  expectedProviderSmokeCostMicrocents,
  providerSmokeUpperBoundUsd,
  readProviderSmokeCeiling,
  runProviderSmokeModelRequest,
} from "../smoke-agent-web-search-provider";

const MODEL_URL = "https://ai-gateway.vercel.sh/v4/ai/language-model";

afterEach(() => vi.unstubAllEnvs());

describe("web-search provider smoke guard", () => {
  it("requires explicit opt-in and a ceiling that covers one bounded Azure search", () => {
    expect(providerSmokeUpperBoundUsd()).toBeCloseTo(0.5394608, 10);
    expect(() => readProviderSmokeCeiling()).toThrow("opt into the paid smoke");

    vi.stubEnv("RUN_AGENT_WEB_SEARCH_SMOKE", "true");
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-only");
    vi.stubEnv("AGENT_WEB_SEARCH_SMOKE_MAX_USD", "0.539");
    expect(() => readProviderSmokeCeiling()).toThrow("worst case exceeds");

    vi.stubEnv(
      "AGENT_WEB_SEARCH_SMOKE_MAX_USD",
      String(AGENT_WEB_SEARCH_SMOKE_MAX_USD),
    );
    expect(readProviderSmokeCeiling()).toBe(0.55);
  });

  it("accepts the real SDK serialization and rejects every other authenticated request", async () => {
    const inspected: string[] = [];
    const gateway = createGateway({
      apiKey: "test-only",
      fetch: async (input, init) => {
        inspected.push(await assertProviderSmokeRequest(input, init));
        return new Response(
          JSON.stringify({ error: { message: "intentional test stop" } }),
          {
            status: 400,
            headers: { "content-type": "application/json" },
          },
        );
      },
    });

    await expect(runProviderSmokeModelRequest(gateway)).rejects.toThrow();
    expect(inspected).toEqual(["model"]);

    expect(
      await assertProviderSmokeRequest(
        new Request(
          "https://ai-gateway.vercel.sh/v1/generation?id=gen_01M0QTS0NKJMJMMYA0JGKZM6SF",
          {
            headers: { authorization: "Bearer test-only" },
          },
        ),
      ),
    ).toBe("generation");
    await expect(
      assertProviderSmokeRequest(
        "https://ai-gateway.vercel.sh/v4/ai/future-paid-path",
        { method: "POST" },
      ),
    ).rejects.toThrow("unexpected authenticated Gateway request");
  });

  it("rejects drift in the serialized model, output, or native tool policy", async () => {
    const request = new Request(MODEL_URL, {
      method: "POST",
      headers: {
        authorization: "Bearer test-only",
        "ai-language-model-id": MODEL_CATALOG.balanced.modelId,
        "ai-language-model-specification-version": "4",
        "ai-language-model-streaming": "false",
        "ai-gateway-protocol-version": "0.0.1",
      },
      body: JSON.stringify({ maxOutputTokens: 257, tools: [] }),
    });

    await expect(assertProviderSmokeRequest(request)).rejects.toThrow(
      "did not preserve",
    );
  });

  it("adds the billed search to the actual token cost", () => {
    expect(
      expectedProviderSmokeCostMicrocents({
        promptTokens: 100,
        completionTokens: 10,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        billableWebSearchCalls: 1,
      }),
    ).toBe(1_403_200);
  });

  it("accepts usable provider sources from the requested domain", () => {
    const sources = [{ type: "url", url: "https://iana.org/source" }];
    const content = [
      {
        type: "tool-result",
        toolName: "web_search",
        output: { action: { type: "search" }, sources },
      },
    ];

    expect(assertProviderSmokeSources(content)).toEqual([
      "https://iana.org/source",
    ]);
    sources[0].url = "https://example.com/forbidden";
    expect(() => assertProviderSmokeSources(content)).toThrow(
      "outside the requested domain",
    );
  });
});

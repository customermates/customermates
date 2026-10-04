import { afterEach, describe, expect, it, vi } from "vitest";

import { env } from "@/env";

import { assertServableEntry, type AgentModelEntry } from "../agent-model";
import { readAgentProviderCharge, readAgentServedCharge } from "../gateway-cost";
import { computeCostMicrocents, modelContextLength } from "../model-pricing";
import {
  AGENT_LANGUAGE_MODEL_RESOLVER,
  createOvhLanguageModel,
  installAgentLanguageModelResolver,
  resolveAgentLanguageModel,
} from "../ovh-ai-endpoints";
import { agentServingProviderUsesGateway, ovhNativeModelId } from "../ovh-ai-endpoints-catalog";

const OVH_KEY = "test-ovh-key";

function chatCompletion() {
  return new Response(
    JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1_790_000_000,
      model: "Qwen3.8-27B",
      choices: [{ index: 0, message: { role: "assistant", content: "Hello." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function entry(overrides: Partial<AgentModelEntry> = {}): AgentModelEntry {
  return {
    modelId: "ovh/Qwen3.8-27B",
    servingProvider: "ovh",
    inferenceRegion: "eu",
    maxOutputTokens: 8192,
    maxContextTokens: 66_000,
    maxToolResultChars: 6000,
    ...overrides,
  };
}

const originalKey = env.OVH_AI_ENDPOINTS_API_KEY;
const registry = globalThis as unknown as Record<symbol, unknown>;

afterEach(() => {
  env.OVH_AI_ENDPOINTS_API_KEY = originalKey;
  Reflect.deleteProperty(registry, AGENT_LANGUAGE_MODEL_RESOLVER);
});

describe("OVHcloud AI Endpoints model construction", () => {
  it("calls OVH chat completions with the bearer key and the native model id", async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(chatCompletion()));
    const model = createOvhLanguageModel("ovh/Qwen3.8-27B", { apiKey: OVH_KEY, fetch: fetcher });

    expect(model.provider).toBe("ovh.chat");
    expect(model.modelId).toBe("Qwen3.8-27B");

    const result = await model.doGenerate({
      prompt: [{ role: "user", content: [{ type: "text", text: "Hi" }] }],
      maxOutputTokens: 64,
      providerOptions: { openai: { parallelToolCalls: false } },
    });

    expect(fetcher).toHaveBeenCalledOnce();
    const [url, init] = fetcher.mock.calls[0];
    expect(String(url)).toBe("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions");
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${OVH_KEY}`);
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ model: "Qwen3.8-27B", max_tokens: 64, parallel_tool_calls: false });
    expect(body).not.toHaveProperty("store");
    expect(result.usage.inputTokens.total).toBe(12);
    expect(result.usage.outputTokens.total).toBe(3);
  });

  it("reads the key from the server environment at call time and fails closed without one", () => {
    env.OVH_AI_ENDPOINTS_API_KEY = undefined;
    expect(() => createOvhLanguageModel("ovh/Qwen3.8-27B")).toThrow("OVH_AI_ENDPOINTS_API_KEY is required");
    env.OVH_AI_ENDPOINTS_API_KEY = "XXX";
    expect(() => createOvhLanguageModel("ovh/Qwen3.8-27B")).toThrow("OVH_AI_ENDPOINTS_API_KEY is required");
    env.OVH_AI_ENDPOINTS_API_KEY = OVH_KEY;
    expect(createOvhLanguageModel("ovh/gpt-oss-120b").modelId).toBe("gpt-oss-120b");
  });

  it("rejects ids outside the audited OVH model list", () => {
    expect(() => createOvhLanguageModel("google/gemini-3.5-flash", { apiKey: OVH_KEY })).toThrow(
      "is not an OVHcloud AI Endpoints model id",
    );
    expect(() => ovhNativeModelId("ovh/Meta-Llama-3_3-70B-Instruct")).toThrow("not in the audited model list");
  });

  it("resolves only OVH ids, leaving every Gateway id to the Gateway", () => {
    env.OVH_AI_ENDPOINTS_API_KEY = OVH_KEY;
    expect(resolveAgentLanguageModel("google/gemini-3.5-flash-lite")).toBeUndefined();
    expect(resolveAgentLanguageModel("openai/gpt-5.6-luna")).toBeUndefined();
    expect(resolveAgentLanguageModel("ovh/Mistral-Small-3.2-24B-Instruct-2506")?.modelId).toBe(
      "Mistral-Small-3.2-24B-Instruct-2506",
    );
  });

  it("registers the resolver the patched workflow step consults", () => {
    installAgentLanguageModelResolver();
    expect(registry[Symbol.for("ai-sdk.workflow.resolveLanguageModel")]).toBe(resolveAgentLanguageModel);
  });
});

describe("OVHcloud AI Endpoints catalog entries", () => {
  it("accepts every audited OVH model priced in the snapshot", () => {
    for (const modelId of [
      "ovh/Qwen3.8-27B",
      "ovh/Qwen3.5-397B-A17B",
      "ovh/gpt-oss-120b",
      "ovh/Mistral-Small-3.2-24B-Instruct-2506",
      "ovh/Qwen3-Coder-30B-A3B-Instruct",
    ])
      expect(() => assertServableEntry(modelId, entry({ modelId }))).not.toThrow();
    expect(modelContextLength("ovh/gpt-oss-120b", "ovh", "eu")).toBe(131_072);
    expect(modelContextLength("ovh/Qwen3.8-27B", "ovh", "eu")).toBe(262_144);
  });

  it("only passes reasoning settings an OVH model accepts", () => {
    expect(() =>
      assertServableEntry("gpt-oss", entry({ modelId: "ovh/gpt-oss-120b", reasoningEffort: "low" })),
    ).not.toThrow();
    expect(() =>
      assertServableEntry("gpt-oss", entry({ modelId: "ovh/gpt-oss-120b", reasoningEffort: "none" })),
    ).toThrow('reasoning effort "none"');
    expect(() => assertServableEntry("qwen", entry({ reasoningEffort: "low" }))).toThrow('reasoning effort "low"');
    expect(() => assertServableEntry("qwen", entry({ thinkingLevel: "low" }))).toThrow("thinking level");
  });

  it("pins OVH entries to the attested EU region and the ovh serving provider", () => {
    expect(() => assertServableEntry("global", entry({ inferenceRegion: null }))).toThrow('inference region "eu"');
    expect(() => assertServableEntry("wrong provider", entry({ servingProvider: "azure" }))).toThrow(
      'serving provider "ovh"',
    );
    expect(() =>
      assertServableEntry("wrong id", entry({ modelId: "google/gemini-3.5-flash-lite", servingProvider: "ovh" })),
    ).toThrow('serving provider "ovh"');
  });

  it("prices OVH tokens from the snapshot with no cache discount", () => {
    expect(
      computeCostMicrocents(
        "ovh/Qwen3.8-27B",
        { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
        "ovh",
        "eu",
      ),
    ).toBe(47_000_000 + 319_000_000);
    expect(
      computeCostMicrocents(
        "ovh/gpt-oss-120b",
        { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000, cacheWriteTokens: 1_000 },
        "ovh",
        "eu",
      ),
    ).toBe(0);
  });
});

describe("charges on a provider without receipts", () => {
  it("prices an OVH round from tokens instead of reading a Gateway receipt", () => {
    expect(agentServingProviderUsesGateway("ovh")).toBe(false);
    expect(agentServingProviderUsesGateway("vertex")).toBe(true);
    expect(readAgentServedCharge({ openai: {} }, "ovh")).toEqual({ outcome: "tokenPriced" });
    expect(readAgentServedCharge(undefined, "ovh")).toEqual({ outcome: "tokenPriced" });
    expect(readAgentServedCharge({ gateway: { gatewayCost: "0.1" } }, "ovh")).toMatchObject({ outcome: "unreadable" });
  });

  it("leaves Gateway providers on the Gateway receipt reader", () => {
    expect(readAgentServedCharge({}, "vertex")).toEqual(readAgentProviderCharge({}, "vertex"));
    expect(readAgentProviderCharge({}, "ovh")).toMatchObject({ outcome: "unreadable" });
  });
});

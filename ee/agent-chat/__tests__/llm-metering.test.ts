import { describe, it, expect, vi } from "vitest";
import { generateText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";

import { MOCK_ENV_MODULE } from "@/tests/helpers/interactor-test-setup";

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" as const },
}));

import { usageToTokenCounts } from "../llm.service";
import { MODEL_CATALOG } from "../model-catalog";
import { resolveModelPricing } from "../model-pricing";

describe("usageToTokenCounts", () => {
  it("preserves cache-write usage from the real OpenAI Responses adapter", async () => {
    const provider = createOpenAI({
      apiKey: "test-key",
      fetch: vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              id: "resp_test",
              created_at: 1_787_206_400,
              error: null,
              model: "gpt-5.6-luna",
              output: [
                {
                  type: "message",
                  role: "assistant",
                  id: "msg_test",
                  content: [{ type: "output_text", text: "Done.", annotations: [] }],
                },
              ],
              incomplete_details: null,
              usage: {
                input_tokens: 27_000,
                input_tokens_details: { cached_tokens: 0, cache_write_tokens: 26_973 },
                output_tokens: 150,
                output_tokens_details: { reasoning_tokens: 0 },
              },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        ),
      ) as never,
    });

    const result = await generateText({ model: provider("gpt-5.6-luna"), prompt: "Hello" });

    expect(result.usage.inputTokenDetails).toEqual(
      expect.objectContaining({ noCacheTokens: 27, cacheReadTokens: 0, cacheWriteTokens: 26_973 }),
    );
    expect(usageToTokenCounts(result.usage)).toEqual({
      inputTokens: 27,
      outputTokens: 150,
      cacheReadTokens: 0,
      cacheWriteTokens: 26_973,
    });
  });

  it("maps the AI SDK v6 inputTokenDetails onto the 4-class TokenCounts (cacheWrite is first-class, not lost)", () => {
    const usage = {
      inputTokens: 27000,
      inputTokenDetails: { noCacheTokens: 27, cacheReadTokens: 0, cacheWriteTokens: 26973 },
      outputTokens: 150,
      outputTokenDetails: { textTokens: 150, reasoningTokens: 0 },
      totalTokens: 27150,
    } as never;

    expect(usageToTokenCounts(usage)).toEqual({
      inputTokens: 27,
      outputTokens: 150,
      cacheReadTokens: 0,
      cacheWriteTokens: 26973,
    });
  });

  it("reads a warm cache-read turn", () => {
    const usage = {
      inputTokens: 23346,
      inputTokenDetails: { noCacheTokens: 17, cacheReadTokens: 23329, cacheWriteTokens: 0 },
      outputTokens: 144,
    } as never;

    expect(usageToTokenCounts(usage)).toMatchObject({ inputTokens: 17, cacheReadTokens: 23329, cacheWriteTokens: 0 });
  });

  it("derives uncached input by subtraction when a provider omits noCacheTokens", () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 20,
      inputTokenDetails: { cacheReadTokens: 30, cacheWriteTokens: 0 },
    } as never;

    expect(usageToTokenCounts(usage)).toEqual({
      inputTokens: 70,
      outputTokens: 20,
      cacheReadTokens: 30,
      cacheWriteTokens: 0,
    });
  });

  it("maps missing token fields to zero rather than guessing", () => {
    expect(usageToTokenCounts({} as never)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  it.each([{ inputTokens: -1 }, { outputTokens: Number.NaN }, { inputTokenDetails: { cacheReadTokens: 1.5 } }])(
    "rejects malformed provider usage %#",
    (usage) => {
      expect(() => usageToTokenCounts(usage as never)).toThrow("reported by the AI provider");
    },
  );
});

describe("model catalog + pricing coverage", () => {
  it("addresses every catalog model by its gateway-namespaced id", () => {
    expect(Object.values(MODEL_CATALOG).map((entry) => entry.modelId)).toEqual([
      "openai/gpt-5-nano",
      "openai/gpt-5.6-luna",
    ]);
  });

  it("refuses to price an unpinned model instead of falling back to a spend cap", () => {
    expect(() => resolveModelPricing("definitely-not-a-real-model")).toThrow(/No pinned pricing/);
  });

  it("prices the configured agent model from the pinned snapshot", () => {
    expect(resolveModelPricing(MODEL_CATALOG.balanced.modelId).cacheWritePerMTok).toBe(0.25);
  });
});

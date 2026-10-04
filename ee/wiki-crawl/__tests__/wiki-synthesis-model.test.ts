import * as ai from "ai";
import { z } from "zod";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({ ...(await importOriginal<typeof ai>()), generateText: provider.generate }));

import type { AgentModelEntry } from "@/ee/agent-chat/model-catalog";

import { env } from "@/env";
import { INITIAL_WIKI_SYNTHESIS_MODEL, SHIPPED_AGENT_MODEL } from "@/ee/agent-chat/model-catalog";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";

import { generateWikiSynthesisObject, wikiSynthesisWorstCaseMicrocents } from "../wiki-synthesis-model";

const GATEWAY_IMPORT_MODEL: AgentModelEntry = {
  modelId: "google/gemini-3.8-flash",
  servingProvider: "vertex",
  inferenceRegion: "eu",
  maxOutputTokens: 16_384,
  maxContextTokens: 66_000,
  maxToolResultChars: 6000,
  thinkingLevel: "low",
};

function failure(statusCode: number) {
  return new ai.APICallError({ message: "failed", url: "https://provider.invalid", requestBodyValues: {}, statusCode });
}

function rejectWith(error: Error) {
  provider.generate.mockImplementation(() => Promise.reject(error));
}

function call(model: AgentModelEntry = INITIAL_WIKI_SYNTHESIS_MODEL) {
  return generateWikiSynthesisObject({
    model,
    schema: z.object({ title: z.string() }),
    system: "system",
    prompt: "prompt",
  });
}

const originalKey = env.OVH_AI_ENDPOINTS_API_KEY;

beforeEach(() => {
  provider.generate.mockReset();
  env.OVH_AI_ENDPOINTS_API_KEY = "test-ovh-key";
});

afterEach(() => {
  env.OVH_AI_ENDPOINTS_API_KEY = originalKey;
});

describe("generateWikiSynthesisObject", () => {
  it("runs both import models on the shipped OVHcloud model", () => {
    expect(INITIAL_WIKI_SYNTHESIS_MODEL).toMatchObject({
      modelId: SHIPPED_AGENT_MODEL.modelId,
      servingProvider: "ovh",
      inferenceRegion: "eu",
      maxOutputTokens: 16_384,
    });
  });

  it.each([400, 401, 403, 404, 422, 429])(
    "charges nothing when OVHcloud rejects the request with %i before generating",
    async (status) => {
      rejectWith(failure(status));
      expect(await call()).toMatchObject({
        output: null,
        charge: null,
        failure: expect.stringContaining(`HTTP ${status}`),
      });
    },
  );

  it("charges nothing when the OVHcloud key is missing, because no request was sent", async () => {
    env.OVH_AI_ENDPOINTS_API_KEY = undefined;
    expect(await call()).toMatchObject({ output: null, charge: null, failure: expect.stringContaining("failed") });
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 429])("charges nothing when the gateway rejects the request with %i", async (status) => {
    rejectWith(failure(status));
    expect(await call(GATEWAY_IMPORT_MODEL)).toMatchObject({
      output: null,
      charge: null,
      failure: expect.stringContaining("failed"),
    });
  });

  it.each(["GatewayAuthenticationError", "GatewayRateLimitError"])(
    "charges nothing when the gateway reports a %s",
    async (name) => {
      rejectWith(Object.assign(new Error("rejected"), { name }));
      expect(await call(GATEWAY_IMPORT_MODEL)).toMatchObject({
        output: null,
        charge: null,
        failure: expect.stringContaining("failed"),
      });
    },
  );

  it.each([
    [INITIAL_WIKI_SYNTHESIS_MODEL, 408],
    [INITIAL_WIKI_SYNTHESIS_MODEL, 500],
    [INITIAL_WIKI_SYNTHESIS_MODEL, 503],
    [GATEWAY_IMPORT_MODEL, 503],
  ] as const)("charges the worst case when a %#: %i failure may have reached the model", async (model, status) => {
    rejectWith(failure(status));
    const { output, charge } = await call(model);
    expect(output).toBeNull();
    expect(charge).toMatchObject({
      costSource: "estimated",
      costMicrocents: wikiSynthesisWorstCaseMicrocents(model, "system", "prompt"),
    });
  });

  it("charges the worst case when the request fails without a status", async () => {
    rejectWith(new Error("socket hang up"));
    expect((await call()).charge?.costMicrocents).toBe(
      wikiSynthesisWorstCaseMicrocents(INITIAL_WIKI_SYNTHESIS_MODEL, "system", "prompt"),
    );
  });

  it("settles an OVHcloud call as measured from the provider-reported tokens at list price", async () => {
    provider.generate.mockResolvedValue({
      output: { title: "Pricing" },
      usage: { inputTokens: 12_000, outputTokens: 900 },
      providerMetadata: undefined,
    });
    expect(await call()).toEqual({
      output: { title: "Pricing" },
      charge: {
        model: INITIAL_WIKI_SYNTHESIS_MODEL.modelId,
        inputTokens: 12_000,
        costMicrocents: computeCostMicrocents(
          INITIAL_WIKI_SYNTHESIS_MODEL.modelId,
          { inputTokens: 12_000, outputTokens: 900, cacheReadTokens: 0, cacheWriteTokens: 0 },
          "ovh",
          "eu",
        ),
        costSource: "measured",
      },
    });
  });

  it("estimates an OVHcloud call whose usage is missing at the worst-case output", async () => {
    provider.generate.mockResolvedValue({ output: { title: "Pricing" }, usage: {}, providerMetadata: undefined });
    const { charge } = await call();
    expect(charge).toMatchObject({
      costSource: "estimated",
      costMicrocents: wikiSynthesisWorstCaseMicrocents(INITIAL_WIKI_SYNTHESIS_MODEL, "system", "prompt"),
    });
  });

  it("settles an OVHcloud output that fails to parse as measured from its reported tokens", async () => {
    rejectWith(
      new ai.NoObjectGeneratedError({
        message: "no object",
        text: "{",
        response: { id: "r", timestamp: new Date(0), modelId: "Qwen3.8-27B" },
        usage: {
          inputTokens: 5_000,
          outputTokens: 16_384,
          totalTokens: 21_384,
          inputTokenDetails: { noCacheTokens: 5_000, cacheReadTokens: 0, cacheWriteTokens: 0 },
          outputTokenDetails: { textTokens: 16_384, reasoningTokens: 0 },
        },
        finishReason: "length",
      }),
    );
    const { output, charge } = await call();
    expect(output).toBeNull();
    expect(charge).toMatchObject({
      costSource: "measured",
      inputTokens: 5_000,
      costMicrocents: computeCostMicrocents(
        INITIAL_WIKI_SYNTHESIS_MODEL.modelId,
        { inputTokens: 5_000, outputTokens: 16_384, cacheReadTokens: 0, cacheWriteTokens: 0 },
        "ovh",
        "eu",
      ),
    });
  });

  it("keeps a Gateway answer without a readable receipt estimated", async () => {
    provider.generate.mockResolvedValue({
      output: { title: "Pricing" },
      usage: { inputTokens: 12_000, outputTokens: 900 },
      providerMetadata: undefined,
    });
    expect((await call(GATEWAY_IMPORT_MODEL)).charge).toMatchObject({ costSource: "estimated" });
  });
});

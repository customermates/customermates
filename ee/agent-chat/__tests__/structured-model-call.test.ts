import * as ai from "ai";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof ai>()),
  generateText: provider.generate,
}));

import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";

import { generateStructuredObject, structuredCallWorstCaseMicrocents } from "../structured-model-call";

function failure(statusCode: number) {
  return new ai.APICallError({
    message: "failed",
    url: "https://gateway.invalid",
    requestBodyValues: {},
    statusCode,
  });
}

function rejectWith(error: Error) {
  provider.generate.mockImplementation(() => Promise.reject(error));
}

function call() {
  return generateStructuredObject({
    label: "Website import",
    model: AGENT_MODELS.wikiSynthesis,
    schema: z.object({ title: z.string() }),
    system: "system",
    prompt: "prompt",
  });
}

beforeEach(() => {
  provider.generate.mockReset();
});

describe("generateStructuredObject", () => {
  it("sends the synthesis entry's output ceiling and reasoning effort to the provider", async () => {
    provider.generate.mockResolvedValue({
      output: { title: "Overview" },
      usage: { inputTokens: 10, outputTokens: 5 },
      providerMetadata: undefined,
    });
    expect((await call()).output).toEqual({ title: "Overview" });
    expect(provider.generate).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "anthropic/claude-haiku-5.5",
        maxOutputTokens: 16_384,
        reasoning: "medium",
      }),
    );
  });

  it.each([400, 401, 403, 429])("charges nothing when the gateway rejects the request with %i", async (status) => {
    rejectWith(failure(status));
    expect(await call()).toMatchObject({
      output: null,
      charge: null,
      failure: expect.stringContaining("failed"),
    });
  });

  it.each(["GatewayAuthenticationError", "GatewayRateLimitError"])(
    "charges nothing when the gateway reports a %s",
    async (name) => {
      rejectWith(Object.assign(new Error("rejected"), { name }));
      expect(await call()).toMatchObject({
        output: null,
        charge: null,
        failure: expect.stringContaining("failed"),
      });
    },
  );

  it.each([408, 500, 503])("charges the worst case when a %i failure may have reached the model", async (status) => {
    rejectWith(failure(status));
    const { output, charge } = await call();
    expect(output).toBeNull();
    expect(charge).toMatchObject({
      costSource: "estimated",
      costMicrocents: structuredCallWorstCaseMicrocents(AGENT_MODELS.wikiSynthesis, "system", "prompt"),
    });
  });

  it.each([
    [
      "an unparseable object",
      new ai.NoObjectGeneratedError({
        message: "no object",
        response: { id: "r", timestamp: new Date(), modelId: "m" },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        finishReason: "stop",
      } as never),
    ],
    ["a timeout", Object.assign(new Error("timed out"), { name: "TimeoutError" })],
    ["an invalid request", failure(400)],
    ["a request timeout status", failure(408)],
    [
      "a gateway invalid request",
      Object.assign(new Error("invalid"), {
        name: "GatewayInvalidRequestError",
      }),
    ],
  ])("scopes %s to the request, so a caller can move on to the next item", async (_label, error) => {
    rejectWith(error);
    expect((await call()).failureScope).toBe("request");
  });

  it.each([
    ["an authentication failure", failure(401)],
    ["a forbidden request", failure(403)],
    ["a rate limit", failure(429)],
    ["a server error", failure(503)],
    [
      "a missing model",
      Object.assign(new Error("missing"), {
        name: "GatewayModelNotFoundError",
      }),
    ],
    ["a network failure", new Error("socket hang up")],
  ])("scopes %s to the provider, so a caller stops instead of skipping items", async (_label, error) => {
    rejectWith(error);
    expect((await call()).failureScope).toBe("provider");
  });

  it("charges the worst case when the request fails without a status", async () => {
    rejectWith(new Error("socket hang up"));
    expect((await call()).charge?.costMicrocents).toBe(
      structuredCallWorstCaseMicrocents(AGENT_MODELS.wikiSynthesis, "system", "prompt"),
    );
  });
});

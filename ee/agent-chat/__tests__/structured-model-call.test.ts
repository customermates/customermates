import * as ai from "ai";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof ai>()),
  generateText: provider.generate,
}));

import { MockLanguageModelV4 } from "ai/test";

import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";

import {
  STRUCTURED_OUTPUT_MAX_UNION_TYPES,
  generateStructuredObject,
  structuredCallWorstCaseMicrocents,
  structuredOutputUnionTypes,
} from "../structured-model-call";

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

const NestedSchema = z.object({ recordModel: z.object({ lists: z.array(z.string()) }) });

async function malformed(text: string, finishReason: "stop" | "length" = "stop") {
  const actual = await vi.importActual<typeof ai>("ai");
  const model = new MockLanguageModelV4({
    doGenerate: () =>
      Promise.resolve({
        content: [{ type: "text" as const, text }],
        finishReason: { unified: finishReason, raw: finishReason },
        usage: {
          inputTokens: { total: 50, noCache: 50, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      }),
  });
  try {
    await actual.generateText({ model, prompt: "x", output: actual.Output.object({ schema: NestedSchema }) });
  } catch (error) {
    return error as Error;
  }
  throw new Error("The mock answer was accepted.");
}

function nestedCall() {
  return generateStructuredObject({
    label: "Workspace setup plan",
    model: AGENT_MODELS.setupPlanning,
    schema: NestedSchema,
    system: "system",
    prompt: "prompt",
  });
}

describe("structured output the provider did not constrain", () => {
  it("recovers a nested object the model returned as JSON text inside a string", async () => {
    rejectWith(await malformed(JSON.stringify({ recordModel: JSON.stringify({ lists: ["deal"] }) })));
    expect(await nestedCall()).toMatchObject({
      output: { recordModel: { lists: ["deal"] } },
      charge: { inputTokens: 50 },
    });
  });

  it("names the paths that did not match, so a repair prompt can fix them", async () => {
    rejectWith(await malformed(JSON.stringify({ recordModel: JSON.stringify({ fields: [] }) })));
    expect(await nestedCall()).toMatchObject({
      output: null,
      failureScope: "request",
      rejection: expect.stringContaining("recordModel.lists: Invalid input: expected array, received undefined"),
    });
  });

  it("says an answer was cut off at the output limit instead of retrying it unchanged", async () => {
    rejectWith(await malformed('{"recordModel": {"lists": ["de', "length"));
    expect(await nestedCall()).toMatchObject({
      output: null,
      rejection: "The answer was cut off at the output limit; keep it shorter.",
    });
  });

  it("counts the union-typed nodes that turn off constrained decoding", () => {
    const nullable = Object.fromEntries(
      Array.from({ length: 3 }, (_value, index) => [`f${index}`, z.string().nullable()]),
    );
    expect(structuredOutputUnionTypes(z.object(nullable))).toBe(3);
    expect(structuredOutputUnionTypes(z.object({ kind: z.enum(["a", "b"]), list: z.array(z.string()) }))).toBe(0);
    expect(STRUCTURED_OUTPUT_MAX_UNION_TYPES).toBeLessThan(22);
  });
});

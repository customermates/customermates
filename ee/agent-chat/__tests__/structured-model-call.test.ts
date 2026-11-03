import * as ai from "ai";
import { z } from "zod";
import { beforeEach, describe, expect, it, vi } from "vitest";

const provider = vi.hoisted(() => ({ generate: vi.fn() }));
vi.mock("ai", async (importOriginal) => ({
  ...(await importOriginal<typeof ai>()),
  generateText: provider.generate,
}));

import { MockLanguageModelV4 } from "ai/test";

import { getStructuredCallProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import { AGENT_MODELS } from "@/ee/agent-chat/model-catalog";
import { PlanViewsWireSchema } from "@/ee/workspace-setup/workspace-setup-wire";

import {
  STRUCTURED_OUTPUT_MAX_UNION_TYPES,
  generateStructuredObject,
  structuredCallWorstCaseMicrocents,
  structuredOutputUnionTypes,
  readUnconstrainedOutput,
  salvageArrayElements,
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

describe("workspace setup schema compilation recovery", () => {
  const views = { listDefaults: [], sampleLists: [], widgets: [], calendarSources: [], importMapping: null };
  const schemaError = () =>
    new ai.APICallError({
      message: "The compiled grammar is too large, which would cause performance issues.",
      url: "https://gateway.invalid",
      requestBodyValues: {},
      statusCode: 400,
    });
  const setupCall = () =>
    generateStructuredObject({
      label: "Workspace setup plan: views and dashboard",
      model: AGENT_MODELS.setupPlanning,
      schema: PlanViewsWireSchema,
      system: "system",
      prompt: "prompt",
      retrySchemaCompilation: true,
    });
  const textResult = (text: string, finishReason = "stop") => ({
    text,
    usage: { inputTokens: 500, outputTokens: 50, totalTokens: 550 },
    response: { id: "r", timestamp: new Date(), modelId: AGENT_MODELS.setupPlanning.modelId },
    finishReason,
  });

  it("recovers the real views schema's grammar rejection and validates the replacement JSON locally", async () => {
    provider.generate.mockRejectedValueOnce(schemaError()).mockResolvedValueOnce(textResult(JSON.stringify(views)));
    expect(await setupCall()).toMatchObject({ output: views, charge: { inputTokens: 500 } });
    expect(provider.generate).toHaveBeenCalledTimes(2);
    const [constrained, recovered] = provider.generate.mock.calls.map(([request]) => request);
    expect(recovered).not.toHaveProperty("output");
    expect(recovered.system).toContain(JSON.stringify(z.toJSONSchema(PlanViewsWireSchema, { io: "input" })));
    expect(recovered).toMatchObject({
      model: constrained.model,
      prompt: constrained.prompt,
      maxOutputTokens: constrained.maxOutputTokens,
      reasoning: constrained.reasoning,
      maxRetries: 0,
      providerOptions: constrained.providerOptions,
    });
    expect(recovered.abortSignal).toBe(constrained.abortSignal);
  });

  it.each(["not JSON", JSON.stringify({ widgets: "not an array" })])(
    "rejects an unusable replacement instead of admitting it into setup: %s",
    async (text) => {
      provider.generate.mockRejectedValueOnce(schemaError()).mockResolvedValueOnce(textResult(text));
      expect(await setupCall()).toMatchObject({ output: null, failureScope: "request", rejection: expect.any(String) });
      expect(provider.generate).toHaveBeenCalledTimes(2);
    },
  );

  it("rejects a truncated replacement even when its prefix happens to be valid JSON", async () => {
    provider.generate
      .mockRejectedValueOnce(schemaError())
      .mockResolvedValueOnce(textResult(JSON.stringify(views), "length"));
    expect(await setupCall()).toMatchObject({ output: null, rejection: expect.stringContaining("cut off") });
  });

  it("keeps a schema's JSON-string fields instead of decoding already valid expression text", async () => {
    const value = { expression: JSON.stringify({ kind: "literal", value: 1 }) };
    provider.generate.mockRejectedValueOnce(schemaError()).mockResolvedValueOnce(textResult(JSON.stringify(value)));
    expect(
      await generateStructuredObject({
        label: "Workspace setup expression",
        model: AGENT_MODELS.setupPlanning,
        schema: z.object({ expression: z.string() }),
        system: "system",
        prompt: "prompt",
        retrySchemaCompilation: true,
      }),
    ).toMatchObject({ output: value });
  });

  it.each([failure(400), failure(401), failure(429), failure(503)])(
    "does not retry other gateway failures without constrained output",
    async (error) => {
      provider.generate.mockRejectedValueOnce(error);
      expect((await setupCall()).output).toBeNull();
      expect(provider.generate).toHaveBeenCalledTimes(1);
    },
  );

  it("requires a caller to reserve for and opt into schema compilation recovery", async () => {
    provider.generate.mockRejectedValueOnce(schemaError());
    expect((await call()).output).toBeNull();
    expect(provider.generate).toHaveBeenCalledTimes(1);
    expect(
      structuredCallWorstCaseMicrocents(AGENT_MODELS.setupPlanning, "system", "prompt", PlanViewsWireSchema),
    ).toBeGreaterThan(structuredCallWorstCaseMicrocents(AGENT_MODELS.setupPlanning, "system", "prompt"));
  });
});

describe("generateStructuredObject", () => {
  it("sends the entry's output ceiling without thinking, which would turn off constrained decoding", async () => {
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
        reasoning: "none",
      }),
    );
  });

  it("sends a one-shot call without Gateway caching, so it pays no cache write that nothing reads", async () => {
    provider.generate.mockResolvedValue({ output: { title: "x" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await call();
    const [request] = provider.generate.mock.calls[0];
    expect(request.providerOptions).toEqual(getStructuredCallProviderOptions("vertexAnthropic", "eu"));
    expect(request.providerOptions.gateway).not.toHaveProperty("caching");
  });

  it.each([
    ["wikiSynthesis", 16_384, 90_000],
    ["wikiSummary", 512, 90_000],
    ["setupDrafting", 8_192, 90_000],
    ["setupPlanning", 16_384, 180_000],
    ["chat", 8_192, 90_000],
  ] as const)(
    "sends %s without thinking or Gateway caching, with its output ceiling and timeout",
    async (purpose, maxOutputTokens, timeoutMs) => {
      const timeout = vi.spyOn(AbortSignal, "timeout");
      provider.generate.mockResolvedValue({ output: { title: "x" }, usage: { inputTokens: 1, outputTokens: 1 } });
      try {
        await generateStructuredObject({
          label: purpose,
          model: AGENT_MODELS[purpose],
          schema: z.object({ title: z.string() }),
          system: "system",
          prompt: "prompt",
        });
        const [request] = provider.generate.mock.calls[0];
        expect(request).toMatchObject({ model: AGENT_MODELS[purpose].modelId, maxOutputTokens, reasoning: "none" });
        expect(request.providerOptions).toEqual({
          gateway: {
            only: ["vertexAnthropic"],
            inferenceRegion: { scope: "zone", geoRegion: "eu" },
            zeroDataRetention: true,
            disallowPromptTraining: true,
          },
        });
        expect(timeout).toHaveBeenCalledWith(timeoutMs);
      } finally {
        timeout.mockRestore();
      }
    },
  );

  it("lets a caller's own timeout win over the catalog entry", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    provider.generate.mockResolvedValue({ output: { title: "x" }, usage: { inputTokens: 1, outputTokens: 1 } });
    try {
      await generateStructuredObject({
        label: "Calculation draft",
        model: AGENT_MODELS.setupPlanning,
        schema: z.object({ title: z.string() }),
        system: "system",
        prompt: "prompt",
        timeoutMs: 20_000,
      });
      expect(timeout).toHaveBeenCalledWith(20_000);
    } finally {
      timeout.mockRestore();
    }
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
  it("never thinks, even for an entry whose turns do", async () => {
    provider.generate.mockResolvedValue({ output: { title: "x" }, usage: { inputTokens: 1, outputTokens: 1 } });
    await generateStructuredObject({
      label: "Workspace setup pre-fill",
      model: AGENT_MODELS.routine,
      schema: z.object({ title: z.string() }),
      system: "system",
      prompt: "prompt",
    });
    expect(provider.generate).toHaveBeenCalledWith(expect.objectContaining({ reasoning: "none" }));
  });

  it("recovers a nested object the model returned as JSON text inside a string", async () => {
    rejectWith(await malformed(JSON.stringify({ recordModel: JSON.stringify({ lists: ["deal"] }) })));
    expect(await nestedCall()).toMatchObject({
      output: { recordModel: { lists: ["deal"] } },
      charge: { inputTokens: 50 },
    });
  });

  it("salvages the well-formed elements of an array returned as malformed JSON text only when asked", () => {
    const text = JSON.stringify({ items: '[{"a":1},{"a":"x}]"},{"a":3}}]' });
    const error = new ai.NoObjectGeneratedError({
      message: "no object",
      text,
      response: { id: "r", timestamp: new Date(), modelId: "m" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      finishReason: "stop",
    } as never);
    const schema = z.object({ items: z.array(z.object({ a: z.union([z.number(), z.string()]) })) });

    expect(readUnconstrainedOutput(error, schema, true)).toEqual({
      output: { items: [{ a: 1 }, { a: "x}]" }, { a: 3 }] },
    });
    expect(readUnconstrainedOutput(error, schema)).toMatchObject({ rejection: expect.stringContaining("items") });
    expect(salvageArrayElements("not an array")).toBeUndefined();
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

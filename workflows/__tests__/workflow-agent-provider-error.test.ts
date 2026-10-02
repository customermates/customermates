import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { dehydrateStepError, hydrateStepError } from "@workflow/core/serialization";
import { APICallError, isStepCount, jsonSchema, tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { readAgentProviderErrorCharge, readAgentProviderRoundCharge } from "@/ee/agent-chat/agent-provider-error";

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type MockStreamPart = MockStreamResult extends { stream: ReadableStream<infer Part> } ? Part : never;

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function metadata(cost: string, success = true, generationId?: string) {
  return {
    gateway: {
      gatewayCost: cost,
      cost,
      ...(generationId ? { generationId } : {}),
      routing: {
        finalProvider: "vertex",
        modelAttempts: [{ providerAttempts: [{ provider: "vertex", credentialType: "system", success }] }],
      },
    },
  };
}

function failure(attempts: unknown[]) {
  return new Error("Provider request failed", {
    cause: { kind: "ai-sdk-workflow-provider-error", version: 1, attempts },
  });
}

function isJsonProviderToolResult(value: unknown): value is Extract<MockStreamPart, { type: "tool-result" }>["result"] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return z.record(z.string(), z.json().optional()).safeParse(Object.fromEntries(Object.entries(value))).success;
}

function apiError(receipt: unknown, statusCode = 400) {
  return new APICallError({
    message: "The public fixture request was rejected",
    url: "https://example.test/gateway",
    requestBodyValues: { prompt: "fixture-private-request", authorization: "fixture-private-token" },
    responseHeaders: { authorization: "fixture-private-header", "retry-ms": "0" },
    responseBody: JSON.stringify({
      providerMetadata: receipt,
      error: { message: "fixture-private-body" },
      unrelated: "fixture-private-field",
    }),
    statusCode,
    isRetryable: statusCode >= 500,
  });
}

async function rejectedAttempt(errors: Error[], maxRetries = 0) {
  let attempt = 0;
  const model = new MockLanguageModelV4({
    provider: "gateway",
    modelId: "public-test-model",
    doStream: () => Promise.reject(errors[attempt++] ?? errors.at(-1) ?? new Error("Public empty fixture")),
  });
  const onStepEnd = vi.fn();
  const agent = new WorkflowAgent({ model, maxRetries, stopWhen: isStepCount(1), onStepEnd });
  const result = await agent.stream({ prompt: "Public transport fixture" }).then(
    () => {
      throw new Error("Expected provider rejection");
    },
    (error: unknown) => error,
  );
  return { error: result, model, onStepEnd };
}

async function successfulAfterRetry(priorReceipt: unknown) {
  const finishMetadata = metadata("0.0007", true, "public-current-success");
  let attempt = 0;
  const model = new MockLanguageModelV4({
    provider: "gateway",
    modelId: "public-test-model",
    doStream: () =>
      attempt++ === 0
        ? Promise.reject(apiError(priorReceipt, 500))
        : Promise.resolve({
            stream: convertArrayToReadableStream([
              { type: "stream-start" as const, warnings: [] },
              {
                type: "finish" as const,
                finishReason: { unified: "stop" as const, raw: "stop" },
                usage: {
                  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
                  outputTokens: { total: 10, text: 10, reasoning: undefined },
                },
                providerMetadata: finishMetadata,
              },
            ]),
          }),
  });
  const onStepEnd = vi.fn();
  const agent = new WorkflowAgent({ model, maxRetries: 1, stopWhen: isStepCount(1), onStepEnd });
  const result = await agent.stream({ prompt: "Public retry-success fixture" });
  return { result, model, onStepEnd, finishMetadata };
}

async function roundTrip(error: unknown) {
  const serialized = await dehydrateStepError(error, "wrun_public_receipt_fixture", undefined);
  return hydrateStepError(serialized, "wrun_public_receipt_fixture", undefined);
}

describe("WorkflowAgent durable provider failure evidence", () => {
  it("preserves a proven zero pre-stream receipt through native Error serialization", async () => {
    const { error, model, onStepEnd } = await rejectedAttempt([apiError(metadata("0", false))]);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(onStepEnd).not.toHaveBeenCalled();
    expect(readAgentProviderErrorCharge(error, "vertex")).toEqual({ costMicrocents: 0, measured: true });
    const revived = await roundTrip(error);
    expect(revived).toBeInstanceOf(Error);
    expect((revived as Error).cause).toEqual(
      expect.objectContaining({
        kind: "ai-sdk-workflow-provider-error",
        version: 1,
        statusCode: 400,
        isRetryable: false,
      }),
    );
    expect(readAgentProviderErrorCharge(revived, "vertex")).toEqual({ costMicrocents: 0, measured: true });
    const cause = JSON.stringify((revived as Error).cause);
    expect(cause).not.toMatch(/fixture-private|authorization|requestBodyValues|responseBody|example\.test/);
  });

  it.each([
    metadata("0", false),
    metadata("0.0005", true, "public-generation-projection"),
    {
      gateway: {
        ...metadata("0.0005").gateway,
        surchargeCost: "0",
        upstreamInferenceCost: "0",
        unrelated: "fixture-private-field",
      },
    },
    { gateway: { ...metadata("0").gateway, serviceTier: "unpriced" } },
    { gateway: { ...metadata("0.0005").gateway, upstreamInferenceCost: "0.01" } },
    { gateway: { gatewayCost: "0", routing: {} } },
    { gateway: { ...metadata("0", false).gateway, gatewayCost: "fixture-private-price" } },
  ])("keeps vendor/app charge interpretation equivalent through the bounded cause %#", async (receipt) => {
    const { error } = await rejectedAttempt([apiError(receipt)]);
    expect(readAgentProviderErrorCharge(await roundTrip(error), "vertex")).toEqual(
      readAgentProviderErrorCharge(failure([receipt]), "vertex"),
    );
    const serialized = JSON.stringify((error as Error).cause);
    expect(serialized).not.toMatch(/fixture-private|requestBodyValues|responseBody|authorization|example\.test/);
  });

  it("does not preserve a raw APICallError receipt without the production boundary repair", async () => {
    const revived = await roundTrip(apiError(metadata("0", false)));
    expect(readAgentProviderErrorCharge(revived, "vertex")).toBeNull();
    expect((revived as { responseBody?: unknown }).responseBody).toBeUndefined();
  });

  it("accounts an earlier billed SDK retry followed by a proven zero attempt", async () => {
    const { error, model, onStepEnd } = await rejectedAttempt(
      [apiError(metadata("0.0005", true, "public-generation-a"), 500), apiError(metadata("0", false), 400)],
      1,
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(onStepEnd).not.toHaveBeenCalled();
    const revived = await roundTrip(error);
    expect((revived as Error).cause).toEqual(expect.objectContaining({ statusCode: 400, isRetryable: false }));
    expect(readAgentProviderErrorCharge(revived, "vertex")).toEqual({ costMicrocents: 50_000, measured: true });
  });

  it("does not let a final zero receipt conceal an SDK retry with missing metadata", async () => {
    const { error, model } = await rejectedAttempt([apiError(undefined, 500), apiError(metadata("0", false), 400)], 1);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(readAgentProviderErrorCharge(await roundTrip(error), "vertex")).toEqual(
      expect.objectContaining({ costMicrocents: 0, measured: false }),
    );
  });

  it("preserves safe terminal error evidence without replacing a legitimate finish receipt", async () => {
    const terminal = apiError(metadata("0", false));
    const finishMetadata = metadata("0.0005", true, "public-generation-b");
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "public-test-model",
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream([
            { type: "stream-start" as const, warnings: [] },
            { type: "error" as const, error: terminal },
            {
              type: "finish" as const,
              finishReason: { unified: "error" as const, raw: "error" },
              usage: {
                inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
                outputTokens: { total: 10, text: 10, reasoning: undefined },
              },
              providerMetadata: finishMetadata,
            },
          ]),
        }),
    });
    const onStepEnd = vi.fn();
    const agent = new WorkflowAgent({ model, maxRetries: 0, stopWhen: isStepCount(1), onStepEnd });
    const result = await agent.stream({ prompt: "Public streamed fixture" });
    expect(onStepEnd).toHaveBeenCalledTimes(1);
    expect(result.steps[0].providerMetadata).toEqual({
      ...finishMetadata,
      workflow: {
        providerReceipt: {
          kind: "ai-sdk-workflow-provider-error",
          version: 1,
          attempts: [],
          providerFailure: true,
          currentAttempt: { finishMetadata, errorAttempts: [metadata("0", false)] },
        },
      },
    });
    expect(readAgentProviderRoundCharge(result.steps[0].providerMetadata, "vertex")).toEqual(
      expect.objectContaining({ costMicrocents: 50_000, measured: true, currentAttemptOutcome: "measured" }),
    );
    expect(readAgentProviderErrorCharge(await roundTrip(result.error), "vertex")).toEqual({
      costMicrocents: 0,
      measured: true,
    });
  });
  it("retains a billed failed SDK request after the retry produces a successful finish", async () => {
    const { result, model, onStepEnd, finishMetadata } = await successfulAfterRetry(
      metadata("0.0005", true, "public-prior-failure"),
    );
    expect(model.doStreamCalls).toHaveLength(2);
    expect(onStepEnd).toHaveBeenCalledTimes(1);
    expect(result.steps).toHaveLength(1);
    const providerMetadata = result.steps[0].providerMetadata;
    expect(providerMetadata).toBeDefined();
    if (!providerMetadata) throw new Error("Expected successful retry provider metadata fixture");
    expect(providerMetadata.gateway).toEqual(finishMetadata.gateway);
    expect(readAgentProviderRoundCharge(providerMetadata, "vertex")).toEqual({
      costMicrocents: 120_000,
      measured: true,
      currentAttemptOutcome: "measured",
    });
    expect(JSON.stringify(providerMetadata.workflow)).not.toMatch(
      /fixture-private|authorization|requestBodyValues|responseBody|example\.test/,
    );
  });

  it("does not let a successful retry conceal an earlier failed request with no receipt", async () => {
    const { result, model, onStepEnd } = await successfulAfterRetry(undefined);
    expect(model.doStreamCalls).toHaveLength(2);
    expect(onStepEnd).toHaveBeenCalledTimes(1);
    expect(readAgentProviderRoundCharge(result.steps[0].providerMetadata, "vertex")).toEqual(
      expect.objectContaining({ costMicrocents: 70_000, measured: false, currentAttemptOutcome: "measured" }),
    );
  });

  it("exposes a proven terminal error receipt before onStepEnd despite a missing finish part", async () => {
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "public-test-model",
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream<MockStreamPart>([
            { type: "stream-start", warnings: [] },
            { type: "error", error: apiError(metadata("0", false)) },
          ]),
        }),
    });
    const onStepEnd = vi.fn();
    const agent = new WorkflowAgent({ model, maxRetries: 0, stopWhen: isStepCount(1), onStepEnd });
    const result = await agent.stream({ prompt: "Public missing-finish fixture" });
    expect(model.doStreamCalls).toHaveLength(1);
    expect(onStepEnd).toHaveBeenCalledTimes(1);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].finishReason).toBe("other");
    expect(result.steps[0].usage.totalTokens).toBe(0);
    expect(readAgentProviderRoundCharge(result.steps[0].providerMetadata, "vertex")).toEqual(
      expect.objectContaining({ costMicrocents: 0, measured: true, currentAttemptOutcome: "notBilled" }),
    );
    expect(JSON.stringify(result.steps[0].providerMetadata)).not.toMatch(/fixture-private|responseBody|authorization/);
  });

  it("retains a captured billed finish when the actual stream reader subsequently throws a zero receipt", async () => {
    let confirmFinish!: () => void;
    const capturedFinish = new Promise<void>((resolve) => {
      confirmFinish = resolve;
    });
    const stream = new ReadableStream<MockStreamPart>({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({
          type: "finish",
          finishReason: { unified: "stop", raw: "stop" },
          usage,
          providerMetadata: metadata("0.0005", true, "public-captured-finish"),
        });
      },
      async pull(controller) {
        await capturedFinish;
        controller.error(apiError(metadata("0", false)));
      },
    });
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "public-test-model",
      doStream: () => Promise.resolve({ stream }),
    });
    const onStepEnd = vi.fn();
    const agent = new WorkflowAgent({ model, maxRetries: 0, stopWhen: isStepCount(1), onStepEnd });
    const error = await agent
      .stream({
        prompt: "Public captured-finish fixture",
        preventClose: true,
        sendFinish: false,
        writable: new WritableStream<ModelCallStreamPart>({
          write(part) {
            if (part.type === "model-call-end") confirmFinish();
          },
        }),
      })
      .then(
        () => {
          throw new Error("Expected reader rejection");
        },
        (value: unknown) => value,
      );
    expect(model.doStreamCalls).toHaveLength(1);
    expect(onStepEnd).not.toHaveBeenCalled();
    const revived = await roundTrip(error);
    expect(readAgentProviderErrorCharge(revived, "vertex")).toEqual({ costMicrocents: 50_000, measured: true });
    expect((revived as Error).cause).toEqual(
      expect.objectContaining({
        providerFailure: true,
        currentAttempt: {
          finishMetadata: metadata("0.0005", true, "public-captured-finish"),
          errorAttempts: [metadata("0", false)],
        },
      }),
    );
    expect(JSON.stringify((revived as Error).cause)).not.toMatch(
      /fixture-private|responseBody|authorization|example\.test/,
    );
  });

  it.each([new Error("Public sink fixture"), apiError(metadata("0", false))])(
    "carries captured billing evidence without reclassifying a writable sink failure as a provider error %#",
    async (sinkError) => {
      const model = new MockLanguageModelV4({
        provider: "gateway",
        modelId: "public-test-model",
        doStream: () =>
          Promise.resolve({
            stream: convertArrayToReadableStream<MockStreamPart>([
              { type: "stream-start", warnings: [] },
              {
                type: "finish",
                finishReason: { unified: "stop", raw: "stop" },
                usage,
                providerMetadata: metadata("0.0005", true, "public-sink-finish"),
              },
            ]),
          }),
      });
      const onStepEnd = vi.fn();
      const agent = new WorkflowAgent({ model, maxRetries: 0, stopWhen: isStepCount(1), onStepEnd });
      const error = await agent
        .stream({
          prompt: "Public sink fixture",
          preventClose: true,
          sendFinish: false,
          writable: new WritableStream<ModelCallStreamPart>({
            write(part) {
              if (part.type === "model-call-end") throw sinkError;
            },
          }),
        })
        .then(
          () => {
            throw new Error("Expected sink rejection");
          },
          (value: unknown) => value,
        );
      expect(model.doStreamCalls).toHaveLength(1);
      expect(onStepEnd).not.toHaveBeenCalled();
      const revived = await roundTrip(error);
      expect(readAgentProviderErrorCharge(revived, "vertex")).toEqual({
        costMicrocents: 50_000,
        measured: true,
        providerFailure: false,
      });
      expect((revived as Error).cause).toEqual(expect.objectContaining({ providerFailure: false }));
      expect(JSON.stringify((revived as Error).cause)).not.toMatch(/fixture-private|responseBody|authorization/);
    },
  );

  it("retains an earlier positive terminal candidate when a later reader failure reports zero without a finish", async () => {
    let confirmError!: () => void;
    const capturedError = new Promise<void>((resolve) => {
      confirmError = resolve;
    });
    const stream = new ReadableStream<MockStreamPart>({
      start(controller) {
        controller.enqueue({ type: "stream-start", warnings: [] });
        controller.enqueue({ type: "error", error: apiError(metadata("0.0005", true, "public-terminal-debit")) });
      },
      async pull(controller) {
        await capturedError;
        controller.error(apiError(metadata("0", false)));
      },
    });
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "public-test-model",
      doStream: () => Promise.resolve({ stream }),
    });
    const agent = new WorkflowAgent({ model, maxRetries: 0, stopWhen: isStepCount(1) });
    const error = await agent
      .stream({
        prompt: "Public conflicting-candidate fixture",
        preventClose: true,
        sendFinish: false,
        writable: new WritableStream<ModelCallStreamPart>({
          write(part) {
            if (part.type === "error") confirmError();
          },
        }),
      })
      .then(
        () => {
          throw new Error("Expected reader rejection");
        },
        (value: unknown) => value,
      );
    expect(model.doStreamCalls).toHaveLength(1);
    const revived = await roundTrip(error);
    expect(readAgentProviderErrorCharge(revived, "vertex")).toEqual(
      expect.objectContaining({ costMicrocents: 50_000, measured: false }),
    );
    expect((revived as Error).cause).toEqual(
      expect.objectContaining({
        currentAttempt: { errorAttempts: [metadata("0.0005", true, "public-terminal-debit"), metadata("0", false)] },
      }),
    );
  });

  it("does not project a lookalike cost cause from an unmarked provider stream error", async () => {
    const lookalike = failure([metadata("0", false)]);
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "public-test-model",
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream<MockStreamPart>([
            { type: "stream-start", warnings: [] },
            { type: "error", error: lookalike },
          ]),
        }),
    });
    const agent = new WorkflowAgent({ model, maxRetries: 0, stopWhen: isStepCount(1) });
    const result = await agent.stream({ prompt: "Public unmarked stream fixture" });
    expect(result.steps).toHaveLength(1);
    expect(readAgentProviderRoundCharge(result.steps[0].providerMetadata, "vertex")).toEqual(
      expect.objectContaining({ costMicrocents: 0, measured: false, currentAttemptOutcome: "unreadable" }),
    );
    const providerMetadata = result.steps[0].providerMetadata;
    expect(providerMetadata).toBeDefined();
    if (!providerMetadata) throw new Error("Expected unmarked stream provider metadata fixture");
    expect(providerMetadata.workflow).toEqual({
      providerReceipt: {
        kind: "ai-sdk-workflow-provider-error",
        version: 1,
        attempts: [],
        providerFailure: true,
        currentAttempt: { errorAttempts: [null] },
      },
    });
  });
  it("projects SDK-marked terminal transport errors before writing the durable stream", async () => {
    const transportError = apiError(metadata("0", false));
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "public-test-model",
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream<MockStreamPart>([
            { type: "stream-start", warnings: [] },
            { type: "error", error: transportError },
          ]),
        }),
    });
    const streamed: ModelCallStreamPart[] = [];
    const agent = new WorkflowAgent({ model, maxRetries: 0, stopWhen: isStepCount(1) });
    await agent.stream({
      prompt: "Public durable error-part fixture",
      preventClose: true,
      sendFinish: false,
      writable: new WritableStream<ModelCallStreamPart>({
        write(part) {
          streamed.push(part);
        },
      }),
    });
    expect(model.doStreamCalls).toHaveLength(1);
    const part = streamed.find((value) => value.type === "error");
    expect(part?.type).toBe("error");
    if (part?.type !== "error") throw new Error("Expected one streamed error fixture");
    expect(part.error).not.toBe(transportError);
    expect(part.error).toBeInstanceOf(Error);
    const revived = await roundTrip(part.error);
    expect(readAgentProviderErrorCharge(revived, "vertex")).toEqual({ costMicrocents: 0, measured: true });
    expect(JSON.stringify((revived as Error).cause)).not.toMatch(
      /fixture-private|authorization|requestBodyValues|responseBody|responseHeaders|example\.test/,
    );
    expect(JSON.stringify(streamed)).not.toMatch(
      /fixture-private|authorization|requestBodyValues|responseBody|responseHeaders|example\.test/,
    );
  });

  it.each(["stop", "error"] as const)(
    "projects SDK-marked provider tool transport errors in writable and retained %s results",
    async (reason) => {
      const transportError = apiError(metadata("0", false));
      if (!isJsonProviderToolResult(transportError))
        throw new Error("Expected JSON-compatible native tool-error fixture");
      expect(APICallError.isInstance(transportError)).toBe(true);
      const model = new MockLanguageModelV4({
        provider: "gateway",
        modelId: "public-test-model",
        doStream: () =>
          Promise.resolve({
            stream: convertArrayToReadableStream<MockStreamPart>([
              { type: "stream-start", warnings: [] },
              {
                type: "tool-call",
                toolCallId: "public-provider-tool",
                toolName: "web_search",
                input: "{}",
                providerExecuted: true,
              },
              {
                type: "tool-result",
                toolCallId: "public-provider-tool",
                toolName: "web_search",
                result: transportError,
                isError: true,
              },
              {
                type: "finish",
                finishReason: { unified: reason, raw: reason },
                usage,
                providerMetadata: metadata("0.0005"),
              },
            ]),
          }),
      });
      const streamed: ModelCallStreamPart[] = [];
      const agent = new WorkflowAgent({
        model,
        maxRetries: 0,
        stopWhen: isStepCount(1),
        tools: {
          web_search: tool({
            type: "provider",
            id: "gateway.exa_search",
            args: { type: "auto", numResults: 1 },
            isProviderExecuted: true,
            inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
          }),
        },
      });
      const result = await agent.stream({
        prompt: "Public durable provider-tool fixture",
        preventClose: true,
        sendFinish: false,
        writable: new WritableStream<ModelCallStreamPart>({
          write(part) {
            streamed.push(part);
          },
        }),
      });
      expect(model.doStreamCalls).toHaveLength(1);
      const part = streamed.find((value) => value.type === "tool-error");
      expect(part?.type).toBe("tool-error");
      if (part?.type !== "tool-error") throw new Error("Expected provider tool-error fixture");
      expect(part.error).not.toBe(transportError);
      const revived = await roundTrip(part.error);
      expect(readAgentProviderErrorCharge(revived, "vertex")).toEqual({ costMicrocents: 0, measured: true });
      expect(JSON.stringify((revived as Error).cause)).not.toMatch(
        /fixture-private|authorization|requestBodyValues|responseBody|responseHeaders|example\.test/,
      );
      expect(JSON.stringify(streamed)).not.toMatch(
        /fixture-private|authorization|requestBodyValues|responseBody|responseHeaders|example\.test/,
      );
      expect(result.steps).toHaveLength(1);
      const retained = result.steps[0].content.find((value) => value.type === "tool-error");
      expect(retained?.type).toBe("tool-error");
      if (retained?.type !== "tool-error") throw new Error("Expected retained provider tool-error fixture");
      expect(retained.error).not.toBe(transportError);
      expect(readAgentProviderErrorCharge(await roundTrip(retained.error), "vertex")).toEqual({
        costMicrocents: 0,
        measured: true,
      });
      expect(JSON.stringify(result.steps[0].content)).not.toMatch(
        /fixture-private|authorization|requestBodyValues|responseBody|responseHeaders|example\.test/,
      );
      const providerMetadata = result.steps[0].providerMetadata;
      expect(providerMetadata).toBeDefined();
      if (!providerMetadata) throw new Error("Expected provider tool-error finish metadata fixture");
      expect(providerMetadata.gateway).toEqual(metadata("0.0005").gateway);
    },
  );

  it("keeps ordinary plain provider tool failures unchanged in writable and retained results", async () => {
    const plainError = { message: "Public provider tool unavailable", code: "public-fixture" };
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "public-test-model",
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream<MockStreamPart>([
            { type: "stream-start", warnings: [] },
            {
              type: "tool-call",
              toolCallId: "public-provider-tool",
              toolName: "web_search",
              input: "{}",
              providerExecuted: true,
            },
            {
              type: "tool-result",
              toolCallId: "public-provider-tool",
              toolName: "web_search",
              result: plainError,
              isError: true,
            },
            {
              type: "finish",
              finishReason: { unified: "stop", raw: "stop" },
              usage,
              providerMetadata: metadata("0.0005"),
            },
          ]),
        }),
    });
    const streamed: ModelCallStreamPart[] = [];
    const agent = new WorkflowAgent({
      model,
      maxRetries: 0,
      stopWhen: isStepCount(1),
      tools: {
        web_search: tool({
          type: "provider",
          id: "gateway.exa_search",
          args: { type: "auto", numResults: 1 },
          isProviderExecuted: true,
          inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
        }),
      },
    });
    const result = await agent.stream({
      prompt: "Public ordinary provider-tool fixture",
      preventClose: true,
      sendFinish: false,
      writable: new WritableStream<ModelCallStreamPart>({
        write(part) {
          streamed.push(part);
        },
      }),
    });
    const part = streamed.find((value) => value.type === "tool-error");
    expect(part?.type).toBe("tool-error");
    if (part?.type !== "tool-error") throw new Error("Expected ordinary tool-error fixture");
    expect(part.error).toEqual(plainError);
    const retained = result.steps[0].content.find((value) => value.type === "tool-error");
    expect(retained?.type).toBe("tool-error");
    if (retained?.type !== "tool-error") throw new Error("Expected retained ordinary tool-error fixture");
    expect(retained.error).toEqual(plainError);
  });
});

describe("bounded provider failure charge reading", () => {
  it("requires the versioned durable provider cause, never a JSON message or arbitrary body", () => {
    const receipt = metadata("0", false);
    expect(readAgentProviderErrorCharge(new Error(JSON.stringify({ providerMetadata: receipt })), "vertex")).toBeNull();
    expect(
      readAgentProviderErrorCharge({ responseBody: JSON.stringify({ providerMetadata: receipt }) }, "vertex"),
    ).toBeNull();
  });

  it("sums separate no-ID receipts instead of deduplicating equal monetary figures", () => {
    expect(readAgentProviderErrorCharge(failure([metadata("0.0005"), metadata("0.0005")]), "vertex")).toEqual({
      costMicrocents: 100_000,
      measured: true,
    });
  });

  it("deduplicates a repeated consistent Gateway generation receipt", () => {
    expect(
      readAgentProviderErrorCharge(
        failure([metadata("0.0005", true, "public-generation-a"), metadata("0.0005", true, "public-generation-a")]),
        "vertex",
      ),
    ).toEqual({
      costMicrocents: 50_000,
      measured: true,
    });
  });

  it("retains a known debit floor when another attempted request has no receipt", () => {
    expect(readAgentProviderErrorCharge(failure([metadata("0.0005"), null]), "vertex")).toEqual(
      expect.objectContaining({ costMicrocents: 50_000, measured: false }),
    );
  });

  it("cannot treat contradictory generation receipts as measured", () => {
    expect(
      readAgentProviderErrorCharge(
        failure([metadata("0.0005", true, "public-generation-a"), metadata("0.0007", true, "public-generation-a")]),
        "vertex",
      ),
    ).toEqual(expect.objectContaining({ costMicrocents: 70_000, measured: false }));
  });

  it.each([
    { gateway: { gatewayCost: "0", routing: {} } },
    { gateway: { gatewayCost: "0" } },
    { gateway: { gatewayCost: "0", serviceTier: "unknown", routing: { modelAttempts: [] } } },
    { gateway: { gatewayCost: "0.0005", routing: { modelAttempts: [] } } },
    { gateway: { gatewayCost: "0", routing: { modelAttempts: [{ providerAttempts: [{ success: "false" }] }] } } },
    {
      gateway: {
        gatewayCost: "0",
        routing: {
          finalProvider: "other",
          modelAttempts: [{ providerAttempts: [{ success: true, provider: "other", credentialType: "system" }] }],
        },
      },
    },
    {
      gateway: {
        gatewayCost: "0",
        routing: {
          finalProvider: "vertex",
          modelAttempts: [{ providerAttempts: [{ success: true, provider: "vertex", credentialType: "byok" }] }],
        },
      },
    },
    { gateway: { gatewayCost: "0", upstreamInferenceCost: "0.01", routing: { modelAttempts: [] } } },
  ])("retains conservative accounting for incomplete or unpriced evidence %#", (receipt) => {
    expect(readAgentProviderErrorCharge(failure([receipt]), "vertex")?.measured).toBe(false);
  });

  it("does not claim an unsafe aggregate debit is measured", () => {
    const charge = readAgentProviderErrorCharge(
      failure([metadata("90071992.54740991"), metadata("0.00000001")]),
      "vertex",
    );
    expect(charge).toEqual(expect.objectContaining({ costMicrocents: Number.MAX_SAFE_INTEGER, measured: false }));
  });

  it("does not accept an unknown receipt version", () => {
    const error = new Error("Public fixture", {
      cause: { kind: "ai-sdk-workflow-provider-error", version: 2, attempts: [metadata("0", false)] },
    });
    expect(readAgentProviderErrorCharge(error, "vertex")).toBeNull();
  });

  it("bounds retry and routing attempt arrays without dropping their incomplete evidence", () => {
    expect(
      readAgentProviderErrorCharge(failure(Array.from({ length: 17 }, () => metadata("0", false))), "vertex")?.measured,
    ).toBe(false);
    const receipt = {
      gateway: {
        gatewayCost: "0",
        routing: { modelAttempts: Array.from({ length: 17 }, () => ({ providerAttempts: [] })) },
      },
    };
    expect(readAgentProviderErrorCharge(failure([receipt]), "vertex")?.measured).toBe(false);
  });

  it("does not acquire a receipt from an oversized transport body or a cyclic unmarked cause", async () => {
    const oversized = apiError(metadata("0", false));
    Object.defineProperty(oversized, "responseBody", { value: " ".repeat(65_537) });
    const { error } = await rejectedAttempt([oversized]);
    expect(readAgentProviderErrorCharge(error, "vertex")?.measured).toBe(false);
    const cycle = new Error("Public fixture failure");
    Object.defineProperty(cycle, "cause", { value: cycle });
    const rejected = await rejectedAttempt([cycle]);
    expect(rejected.error).toBe(cycle);
    expect(readAgentProviderErrorCharge(rejected.error, "vertex")).toBeNull();
  });
});

import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { isStepCount, jsonSchema, tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { agentBatchContainsWebCall } from "@/ee/agent-chat/agent-web-policy";

import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type MockStreamPart = MockStreamResult extends {
  stream: ReadableStream<infer Part>;
}
  ? Part
  : never;

const usage = {
  inputTokens: {
    total: 5,
    noCache: 5,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: 10,
    text: 10,
    reasoning: undefined,
  },
};

async function runWebSearchResponse(streamParts: MockStreamPart[], withLocalTool = false) {
  const model = new MockLanguageModelV4({
    provider: "openai.responses",
    modelId: "gpt-test",
    doStream: () => Promise.resolve({ stream: convertArrayToReadableStream(streamParts) }),
  });
  const streamed: ModelCallStreamPart[] = [];
  const executeLocal = vi.fn(() => Promise.resolve({ ok: true }));
  const endedContents: unknown[] = [];
  const onStepEnd = vi.fn((step: { content: unknown }) => {
    endedContents.push(structuredClone(step.content));
  });
  const agent = new WorkflowAgent({
    model,
    stopWhen: isStepCount(1),
    onStepEnd,
    tools: {
      web_search: tool({
        type: "provider",
        id: "gateway.perplexity_search",
        args: { maxResults: 3, maxTokens: 1024, maxTokensPerPage: 512 },
        isProviderExecuted: true,
        inputSchema: jsonSchema({
          type: "object",
          properties: {},
          additionalProperties: false,
        }),
      }),
      ...(withLocalTool
        ? {
            mutate: tool({
              inputSchema: jsonSchema({ type: "object" }),
              execute: executeLocal,
            }),
          }
        : {}),
    },
    providerOptions: getAgentProviderOptions("vertex", "eu"),
  });

  const result = await agent.stream({
    prompt: "Find the current answer on the web.",
    writable: new WritableStream<ModelCallStreamPart>({
      write(part) {
        streamed.push(part);
      },
    }),
    preventClose: true,
    sendFinish: false,
  });

  return { model, result, streamed, executeLocal, onStepEnd, endedContents };
}

describe("WorkflowAgent native web search contract", () => {
  it("preserves provider tool and source content from a single stop response", async () => {
    const source = {
      type: "source" as const,
      sourceType: "url" as const,
      id: "source-1",
      url: "https://example.com/current",
      title: "Current source",
    };
    const webSearchOutput = {
      action: { type: "search", queries: ["current answer"] },
      sources: [{ type: "url", url: source.url }],
    };
    const streamParts: MockStreamPart[] = [
      { type: "stream-start", warnings: [] },
      {
        type: "response-metadata",
        id: "response-1",
        modelId: "openai:gpt-test",
        timestamp: new Date("2026-09-08T00:00:00.000Z"),
      },
      {
        type: "tool-call",
        toolCallId: "web-1",
        toolName: "web_search",
        input: "{}",
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: "web-1",
        toolName: "web_search",
        result: webSearchOutput,
      },
      { type: "text-start", id: "text-1" },
      { type: "text-delta", id: "text-1", delta: "A current answer." },
      source,
      { type: "text-end", id: "text-1" },
      {
        type: "finish",
        finishReason: { unified: "stop", raw: "stop" },
        usage,
      },
    ];
    const { model, result, streamed } = await runWebSearchResponse(streamParts);

    expect(result.finishReason).toBe("stop");
    expect(model.doStreamCalls).toHaveLength(1);
    expect(model.doStreamCalls[0]).toMatchObject({
      tools: [
        {
          type: "provider",
          id: "gateway.perplexity_search",
          name: "web_search",
          args: { maxResults: 3, maxTokens: 1024, maxTokensPerPage: 512 },
        },
      ],
      providerOptions: {
        gateway: {
          only: ["vertex"],
          inferenceRegion: { scope: "zone", geoRegion: "eu" },
          zeroDataRetention: true,
          disallowPromptTraining: true,
        },
        openai: { parallelToolCalls: false, store: false },
      },
    });
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].content).toEqual([
      expect.objectContaining({
        type: "tool-call",
        toolCallId: "web-1",
        toolName: "web_search",
        input: {},
        providerExecuted: true,
      }),
      { type: "text", text: "A current answer." },
      source,
      {
        type: "tool-result",
        toolCallId: "web-1",
        toolName: "web_search",
        input: {},
        output: webSearchOutput,
        providerExecuted: true,
      },
    ]);
    expect(result.steps[0].sources).toEqual([source]);
    expect(result.steps[0].toolResults).toEqual([
      {
        type: "tool-result",
        toolCallId: "web-1",
        toolName: "web_search",
        input: {},
        output: webSearchOutput,
        providerExecuted: true,
      },
    ]);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "tool",
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "tool-result",
              toolCallId: "web-1",
              toolName: "web_search",
              output: { type: "json", value: webSearchOutput },
            }),
          ]),
        }),
      ]),
    );
    expect(streamed.filter((part) => ["tool-call", "tool-result", "source"].includes(part.type))).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-call",
          toolCallId: "web-1",
          toolName: "web_search",
          providerExecuted: true,
        }),
        expect.objectContaining({
          type: "tool-result",
          toolCallId: "web-1",
          toolName: "web_search",
          output: webSearchOutput,
          providerExecuted: true,
        }),
        source,
      ]),
    );
  });

  it("preserves a provider tool error from a single stop response", async () => {
    const providerError = { code: "web_search_failed", message: "Search failed" };
    const streamParts: MockStreamPart[] = [
      { type: "stream-start", warnings: [] },
      {
        type: "response-metadata",
        id: "response-1",
        modelId: "openai:gpt-test",
        timestamp: new Date("2026-09-08T00:00:00.000Z"),
      },
      {
        type: "tool-call",
        toolCallId: "web-1",
        toolName: "web_search",
        input: "{}",
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolCallId: "web-1",
        toolName: "web_search",
        result: providerError,
        isError: true,
      },
      {
        type: "finish",
        finishReason: { unified: "stop", raw: "stop" },
        usage,
      },
    ];

    const { model, result, streamed } = await runWebSearchResponse(streamParts);

    expect(result.finishReason).toBe("stop");
    expect(model.doStreamCalls).toHaveLength(1);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].content).toEqual([
      expect.objectContaining({
        type: "tool-call",
        toolCallId: "web-1",
        toolName: "web_search",
        input: {},
        providerExecuted: true,
      }),
      {
        type: "tool-error",
        toolCallId: "web-1",
        toolName: "web_search",
        input: {},
        error: providerError,
        providerExecuted: true,
      },
    ]);
    expect(result.steps[0].toolResults).toEqual([]);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: "tool",
          content: expect.arrayContaining([
            expect.objectContaining({
              type: "tool-result",
              toolCallId: "web-1",
              toolName: "web_search",
              output: { type: "error-json", value: providerError },
            }),
          ]),
        }),
      ]),
    );
    expect(streamed).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "tool-error",
          toolCallId: "web-1",
          toolName: "web_search",
          error: providerError,
          providerExecuted: true,
        }),
      ]),
    );
  });
});

describe("WorkflowAgent terminal native search receipts", () => {
  const terminalReasons = ["length", "content-filter", "error", "other"] as const;

  it.each(terminalReasons.flatMap((reason) => [false, true].map((isError) => ({ reason, isError }))))(
    "retains the provider outcome before onStepEnd for $reason (isError=$isError) without executing local calls",
    async ({ reason, isError }) => {
      const output = isError
        ? { error: "timeout", message: "Search timed out" }
        : {
            results: [
              {
                url: "https://example.com/current",
                title: "Current source",
                snippet: "Evidence",
              },
            ],
          };
      const providerMetadata = {
        gateway: {
          gatewayCost: "0.00580279",
          gatewayToolCalls: { perplexity_search: 1 },
        },
      };
      const { model, result, executeLocal, onStepEnd, endedContents } = await runWebSearchResponse(
        [
          { type: "stream-start", warnings: [] },
          {
            type: "tool-call",
            toolCallId: "web-1",
            toolName: "web_search",
            input: "{}",
            providerExecuted: true,
          },
          {
            type: "tool-result",
            toolCallId: "web-1",
            toolName: "web_search",
            result: output,
            isError,
          },
          {
            type: "tool-call",
            toolCallId: "write-1",
            toolName: "mutate",
            input: "{}",
          },
          {
            type: "finish",
            finishReason: { unified: reason, raw: reason },
            usage,
            providerMetadata,
          },
        ],
        true,
      );
      const outcome = expect.objectContaining({
        type: isError ? "tool-error" : "tool-result",
        toolCallId: "web-1",
        toolName: "web_search",
        input: {},
        providerExecuted: true,
        ...(isError ? { error: output } : { output }),
      });
      expect(executeLocal).not.toHaveBeenCalled();
      expect(model.doStreamCalls).toHaveLength(1);
      expect(result.finishReason).toBe(reason);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0].content).toContainEqual(outcome);
      expect(result.steps[0].toolResults).toEqual(isError ? [] : [outcome]);
      expect(result.steps[0].staticToolResults).toEqual(isError ? [] : [outcome]);
      expect(result.steps[0].dynamicToolResults).toEqual([]);
      expect(result.steps[0].providerMetadata).toEqual(providerMetadata);
      expect(endedContents).toEqual([expect.arrayContaining([outcome])]);
      expect(onStepEnd).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ content: expect.arrayContaining([outcome]) }),
      );
    },
  );

  it("retains a successful search when the stream reports a terminal error instead of a finish", async () => {
    const failure = new Error("Provider stream failed after search");
    const output = { results: [{ url: "https://example.com/current" }] };
    const { result, executeLocal, onStepEnd } = await runWebSearchResponse(
      [
        { type: "stream-start", warnings: [] },
        {
          type: "tool-call",
          toolCallId: "web-1",
          toolName: "web_search",
          input: "{}",
          providerExecuted: true,
        },
        {
          type: "tool-result",
          toolCallId: "web-1",
          toolName: "web_search",
          result: output,
        },
        {
          type: "tool-call",
          toolCallId: "write-1",
          toolName: "mutate",
          input: "{}",
        },
        { type: "error", error: failure },
      ],
      true,
    );
    expect(executeLocal).not.toHaveBeenCalled();
    expect(result.error).toBe(failure);
    expect(result.steps[0].toolResults).toEqual([
      expect.objectContaining({
        toolCallId: "web-1",
        providerExecuted: true,
        output,
      }),
    ]);
    expect(onStepEnd).toHaveBeenCalledTimes(1);
  });
});

describe("WorkflowAgent complete native tool batch", () => {
  it.each(["web-first", "write-first"])(
    "blocks a local mutation in a %s provider-executed search response",
    async (order) => {
      const mutated = vi.fn();
      const calls: MockStreamPart[] = [
        {
          type: "tool-call",
          toolCallId: "web-1",
          toolName: "web_search",
          input: "{}",
          providerExecuted: true,
        },
        {
          type: "tool-call",
          toolCallId: "write-1",
          toolName: "manage_wiki_pages",
          input: "{}",
        },
      ];
      if (order === "write-first") calls.reverse();
      const model = new MockLanguageModelV4({
        doStream: () =>
          Promise.resolve({
            stream: convertArrayToReadableStream([
              { type: "stream-start", warnings: [] },
              ...calls,
              {
                type: "tool-result",
                toolCallId: "web-1",
                toolName: "web_search",
                result: { results: [{ url: "https://example.com" }] },
              },
              { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
            ] as MockStreamPart[]),
          }),
      });
      const agent = new WorkflowAgent({
        model,
        stopWhen: isStepCount(1),
        tools: {
          web_search: tool({
            type: "provider",
            id: "gateway.perplexity_search",
            args: {},
            isProviderExecuted: true,
            inputSchema: jsonSchema({ type: "object" }),
          }),
          manage_wiki_pages: tool({
            inputSchema: jsonSchema({ type: "object" }),
            execute: (_input, { messages, toolCallId }) => {
              if (agentBatchContainsWebCall(messages, toolCallId)) return Promise.resolve({ ok: false });
              mutated();
              return Promise.resolve({ ok: true });
            },
          }),
        },
      });
      const result = await agent.stream({
        prompt: "Read and write",
        writable: new WritableStream(),
        preventClose: true,
      });
      expect(mutated).not.toHaveBeenCalled();
      expect(result.steps.flatMap((step) => step.toolResults)).toContainEqual(
        expect.objectContaining({ toolName: "manage_wiki_pages", output: { ok: false } }),
      );
      expect(model.doStreamCalls).toHaveLength(1);
    },
  );
});

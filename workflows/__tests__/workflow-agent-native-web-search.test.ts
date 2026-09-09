import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { jsonSchema, tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";

import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type MockStreamPart = MockStreamResult extends { stream: ReadableStream<infer Part> } ? Part : never;

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

async function runWebSearchResponse(streamParts: MockStreamPart[]) {
  const model = new MockLanguageModelV4({
    provider: "openai.responses",
    modelId: "gpt-test",
    doStream: () => Promise.resolve({ stream: convertArrayToReadableStream(streamParts) }),
  });
  const streamed: ModelCallStreamPart[] = [];
  const agent = new WorkflowAgent({
    model,
    tools: {
      web_search: tool({
        type: "provider",
        id: "openai.web_search",
        args: { externalWebAccess: true, searchContextSize: "low" },
        isProviderExecuted: true,
        inputSchema: jsonSchema({ type: "object", properties: {}, additionalProperties: false }),
      }),
    },
    providerOptions: getAgentProviderOptions("azure"),
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

  return { model, result, streamed };
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
          id: "openai.web_search",
          name: "web_search",
          args: { externalWebAccess: true, searchContextSize: "low" },
        },
      ],
      providerOptions: {
        gateway: {
          only: ["azure"],
          zeroDataRetention: true,
          disallowPromptTraining: true,
        },
        openai: { parallelToolCalls: false, store: false, maxToolCalls: 1 },
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

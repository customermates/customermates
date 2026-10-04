import { WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount, jsonSchema, tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";
import { agentBatchContainsWebCall } from "@/ee/agent-chat/agent-web-policy";

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type MockStreamPart = MockStreamResult extends {
  stream: ReadableStream<infer Part>;
}
  ? Part
  : never;

const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

describe("WorkflowAgent page-read batch", () => {
  it.each(["read-first", "write-first"])(
    "lets a local mutation see a %s page read in its own batch, so a routine can refuse it",
    async (order) => {
      const mutated = vi.fn();
      const read = vi.fn(() => Promise.resolve({ ok: true, result: "page", url: "https://example.com/" }));
      const calls: MockStreamPart[] = [
        { type: "tool-call", toolCallId: "web-1", toolName: "read_web_page", input: '{"url":"https://example.com/"}' },
        { type: "tool-call", toolCallId: "write-1", toolName: "manage_wiki_pages", input: "{}" },
      ];
      if (order === "write-first") calls.reverse();
      const model = new MockLanguageModelV4({
        doStream: () =>
          Promise.resolve({
            stream: convertArrayToReadableStream([
              { type: "stream-start", warnings: [] },
              ...calls,
              { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
            ] as MockStreamPart[]),
          }),
      });
      const agent = new WorkflowAgent({
        model,
        stopWhen: isStepCount(1),
        tools: {
          read_web_page: tool({ inputSchema: jsonSchema({ type: "object" }), execute: read }),
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
      expect(read).toHaveBeenCalledOnce();
      expect(mutated).not.toHaveBeenCalled();
      expect(result.steps.flatMap((step) => step.toolResults)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ toolName: "manage_wiki_pages", output: { ok: false } }),
          expect.objectContaining({ toolName: "read_web_page", output: expect.objectContaining({ ok: true }) }),
        ]),
      );
      expect(model.doStreamCalls).toHaveLength(1);
    },
  );

  it("lets a mutation run in a batch without a page read", async () => {
    const mutated = vi.fn();
    const model = new MockLanguageModelV4({
      doStream: () =>
        Promise.resolve({
          stream: convertArrayToReadableStream([
            { type: "stream-start", warnings: [] },
            { type: "tool-call", toolCallId: "write-1", toolName: "manage_wiki_pages", input: "{}" },
            { type: "finish", finishReason: { unified: "tool-calls", raw: "tool-calls" }, usage },
          ] as MockStreamPart[]),
        }),
    });
    const agent = new WorkflowAgent({
      model,
      stopWhen: isStepCount(1),
      tools: {
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
    await agent.stream({ prompt: "Write", writable: new WritableStream(), preventClose: true });
    expect(mutated).toHaveBeenCalledOnce();
  });
});

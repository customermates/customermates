import { WorkflowAgent, type ModelCallStreamPart } from "@ai-sdk/workflow";
import { isStepCount, jsonSchema, tool } from "ai";
import { convertArrayToReadableStream, MockLanguageModelV4 } from "ai/test";
import { describe, expect, it, vi } from "vitest";

import { planAgentAttachments } from "@/ee/agent-chat/agent-attachments";
import { agentContextProviderPrefix } from "@/ee/agent-chat/agent-context";
import { toModelMessages } from "@/ee/agent-chat/agent-stream-utils";

type MockStreamResult = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>;
type MockStreamPart = MockStreamResult extends { stream: ReadableStream<infer Part> } ? Part : never;

const FILE_ID = "62000000-0000-4000-8000-000000000001";
const DEAL_TYPE_ID = "62000000-0000-4000-8000-000000000002";
const DEAL_ID = "62000000-0000-4000-8000-000000000003";
const FIELD_ID = "62000000-0000-4000-8000-000000000004";
const IMAGE = Buffer.from("not really a png, but bytes all the same").toString("base64");
const usage = {
  inputTokens: { total: 5, noCache: 5, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
};

function response(parts: MockStreamPart[]): MockStreamPart[] {
  return [
    { type: "stream-start", warnings: [] },
    { type: "response-metadata", id: "response", modelId: "google/gemini-test", timestamp: new Date(0) },
    ...parts,
    {
      type: "finish",
      finishReason: { unified: parts.some((part) => part.type === "tool-call") ? "tool-calls" : "stop", raw: "stop" },
      usage,
    },
  ];
}

describe("Mate with a file attached in the chat", () => {
  it("receives the file and its untrusted-marked text, then files it onto a record with manage_record_files attach", async () => {
    const context = {
      reference: { kind: "file" as const, fileId: FILE_ID, mimeType: "image/png", size: 4_096 },
      label: "Offer scan.png",
    };
    const plan = planAgentAttachments({
      files: [
        {
          id: FILE_ID,
          name: "Offer scan.png",
          mimeType: "image/png",
          size: 4_096,
          extractionStatus: "unsupported",
          pageCount: null,
        },
      ],
      excerpts: new Map(),
      modelId: "google/gemini-3.5-flash-lite",
      roomBytes: 60_000,
    });
    const messages = toModelMessages([
      {
        role: "user",
        text: `${agentContextProviderPrefix([context])}Attach this offer to the Northwind deal.`,
        attachedText: plan.attachedText,
        files: plan.nativeFiles.map((file) => ({ ...file, data: IMAGE })),
      },
    ]);
    const attachInput = {
      action: "attach",
      fileId: FILE_ID,
      typeId: DEAL_TYPE_ID,
      recordId: DEAL_ID,
      fieldId: FIELD_ID,
      attach: "append",
    };
    let calls = 0;
    const model = new MockLanguageModelV4({
      provider: "gateway",
      modelId: "google/gemini-test",
      doStream: () => {
        calls += 1;
        return Promise.resolve({
          stream: convertArrayToReadableStream(
            calls === 1
              ? response([
                  {
                    type: "tool-call",
                    toolCallId: "attach-1",
                    toolName: "manage_record_files",
                    input: JSON.stringify(attachInput),
                  },
                ])
              : response([
                  { type: "text-start", id: "text-1" },
                  { type: "text-delta", id: "text-1", delta: "The offer is on the deal now." },
                  { type: "text-end", id: "text-1" },
                ]),
          ),
        });
      },
    });
    const attach = vi.fn(() => Promise.resolve({ action: "attach", attached: true }));
    const agent = new WorkflowAgent({
      model,
      stopWhen: isStepCount(2),
      tools: {
        manage_record_files: tool({ inputSchema: jsonSchema({ type: "object" }), execute: attach }),
      },
    });
    const streamed: ModelCallStreamPart[] = [];
    const result = await agent.stream({
      messages,
      writable: new WritableStream<ModelCallStreamPart>({ write: (part) => void streamed.push(part) }),
      preventClose: true,
      sendFinish: false,
    });

    const [user] = model.doStreamCalls[0].prompt.filter((message) => message.role === "user");
    expect(user.content).toEqual([
      expect.objectContaining({ type: "text", text: expect.stringContaining(`kind="file" fileId="${FILE_ID}"`) }),
      expect.objectContaining({
        type: "text",
        text: expect.stringContaining(`<file fileId="${FILE_ID}" name="Offer scan.png" content="file"/>`),
      }),
      expect.objectContaining({ type: "file", mediaType: "image/png", filename: "Offer scan.png" }),
    ]);
    expect(attach).toHaveBeenCalledWith(attachInput, expect.objectContaining({ toolCallId: "attach-1" }));
    expect(result.steps.at(-1)?.text).toBe("The offer is on the deal now.");
  });
});

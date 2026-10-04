import { WorkflowAgent } from "@ai-sdk/workflow";
import { isStepCount, jsonSchema, tool } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { env } from "@/env";
import { getAgentProviderOptions } from "@/ee/agent-chat/agent-provider-options";
import { readAgentServedCharge } from "@/ee/agent-chat/gateway-cost";
import { computeCostMicrocents } from "@/ee/agent-chat/model-pricing";
import { usageToTokenCounts } from "@/ee/agent-chat/agent-usage-settlement";
import { AGENT_LANGUAGE_MODEL_RESOLVER, installAgentLanguageModelResolver } from "@/ee/agent-chat/ovh-ai-endpoints";

const OVH_KEY = "test-ovh-key";

function sse(chunks: unknown[]) {
  const body = [...chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`), "data: [DONE]\n\n"].join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function chunk(delta: Record<string, unknown>, finishReason: string | null = null) {
  return {
    id: "chatcmpl-ovh",
    object: "chat.completion.chunk",
    created: 1_790_000_000,
    model: "Qwen3.8-27B",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}

function usageChunk(promptTokens: number, completionTokens: number) {
  return {
    id: "chatcmpl-ovh",
    object: "chat.completion.chunk",
    created: 1_790_000_000,
    model: "Qwen3.8-27B",
    choices: [],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  };
}

const toolCallStream = () =>
  sse([
    chunk({
      role: "assistant",
      content: null,
      tool_calls: [
        { index: 0, id: "call_lookup", type: "function", function: { name: "lookup_contact", arguments: "" } },
      ],
    }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '{"name":' } }] }),
    chunk({ tool_calls: [{ index: 0, function: { arguments: '"Acme"}' } }] }),
    chunk({}, "tool_calls"),
    usageChunk(400, 20),
  ]);

const textStream = () =>
  sse([
    chunk({ role: "assistant", content: "Acme is " }),
    chunk({ content: "a customer." }),
    chunk({}, "stop"),
    usageChunk(450, 6),
  ]);

const originalKey = env.OVH_AI_ENDPOINTS_API_KEY;
const registry = globalThis as unknown as Record<symbol, unknown>;

beforeEach(() => {
  env.OVH_AI_ENDPOINTS_API_KEY = OVH_KEY;
  installAgentLanguageModelResolver();
});

afterEach(() => {
  env.OVH_AI_ENDPOINTS_API_KEY = originalKey;
  Reflect.deleteProperty(registry, AGENT_LANGUAGE_MODEL_RESOLVER);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("WorkflowAgent on an OVHcloud AI Endpoints model id", () => {
  it("round-trips a streamed tool call and its result through the string model id", async () => {
    const responses = [toolCallStream(), textStream()];
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(responses.shift() ?? new Response(null, { status: 500 })),
    );
    vi.stubGlobal("fetch", fetcher);
    const execute = vi.fn((input: { name: string }) => Promise.resolve({ found: true, name: input.name }));
    const onStepEnd = vi.fn();

    const agent = new WorkflowAgent({
      model: "ovh/Qwen3.8-27B",
      maxRetries: 0,
      maxOutputTokens: 256,
      stopWhen: isStepCount(2),
      onStepEnd,
      tools: {
        lookup_contact: tool({
          description: "Find a contact by name.",
          inputSchema: jsonSchema<{ name: string }>({
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
            additionalProperties: false,
          }),
          execute,
        }),
      },
      providerOptions: getAgentProviderOptions("ovh", "eu"),
    });
    const result = await agent.stream({ prompt: "Who is Acme?" });

    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url, init] of fetcher.mock.calls) {
      expect(String(url)).toBe("https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${OVH_KEY}`);
    }
    const firstBody = JSON.parse(String(fetcher.mock.calls[0][1]?.body)) as Record<string, unknown>;
    expect(firstBody).toMatchObject({
      model: "Qwen3.8-27B",
      stream: true,
      stream_options: { include_usage: true },
      max_tokens: 256,
    });
    expect(firstBody).not.toHaveProperty("parallel_tool_calls");
    expect(firstBody).not.toHaveProperty("store");
    expect(firstBody.tools).toEqual([
      expect.objectContaining({ type: "function", function: expect.objectContaining({ name: "lookup_contact" }) }),
    ]);
    const secondBody = JSON.parse(String(fetcher.mock.calls[1][1]?.body)) as {
      messages: { role: string; tool_call_id?: string }[];
    };
    expect(secondBody.messages).toContainEqual(expect.objectContaining({ role: "tool", tool_call_id: "call_lookup" }));

    expect(execute).toHaveBeenCalledWith({ name: "Acme" }, expect.anything());
    expect(onStepEnd).toHaveBeenCalledTimes(2);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].toolCalls).toEqual([
      expect.objectContaining({ toolCallId: "call_lookup", toolName: "lookup_contact", input: { name: "Acme" } }),
    ]);
    expect(result.steps[1].text).toBe("Acme is a customer.");

    const tokens = usageToTokenCounts(result.steps[0].usage);
    expect(tokens).toEqual({ inputTokens: 400, outputTokens: 20, cacheReadTokens: 0, cacheWriteTokens: 0 });
    expect(readAgentServedCharge(result.steps[0].providerMetadata, "ovh")).toEqual({ outcome: "tokenPriced" });
    expect(computeCostMicrocents("ovh/Qwen3.8-27B", tokens, "ovh", "eu")).toBe(25_180);
  });

  it("leaves a Gateway model id on the Gateway when the resolver is registered", async () => {
    vi.stubEnv("AI_GATEWAY_API_KEY", "test-gateway-key");
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response("{}", { status: 400 })));
    vi.stubGlobal("fetch", fetcher);

    const agent = new WorkflowAgent({ model: "google/gemini-3.5-flash-lite", maxRetries: 0, stopWhen: isStepCount(1) });
    await agent.stream({ prompt: "Hello" }).catch(() => undefined);

    expect(fetcher).toHaveBeenCalled();
    for (const [url] of fetcher.mock.calls) expect(new URL(String(url)).hostname).toBe("ai-gateway.vercel.sh");
  });
});

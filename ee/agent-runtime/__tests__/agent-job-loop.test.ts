import { describe, expect, it, vi } from "vitest";

vi.mock("@/ee/agent-chat/agent-tools", () => ({ getAgentAiTools: vi.fn() }));
vi.mock("@/ee/agent-chat/agent-toolsets", () => ({
  onDemandToolsetOfTool: (name: string) => (name === "export_crm_records" ? "data-transfer" : null),
}));

import { MockLanguageModelV4 } from "ai/test";
import { tool } from "ai";
import { z } from "zod";

import { AgentJobRecorder } from "../agent-job-recorder";
import { agentJobActiveToolNames, buildAgentJobTools, createAgentJobToolkit } from "../agent-job-toolset";
import { runAgentJobLoop } from "../run-agent-job-loop";

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};

function toolCallStep(toolName: string, input: unknown, toolCallId = "call-1") {
  return {
    content: [{ type: "tool-call" as const, toolCallId, toolName, input: JSON.stringify(input) }],
    finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
    usage,
    warnings: [],
  };
}

function textStep(text: string) {
  return {
    content: [{ type: "text" as const, text }],
    finishReason: { unified: "stop" as const, raw: "end_turn" },
    usage,
    warnings: [],
  };
}

function setup(modelResults: unknown[], executes: Record<string, (input: unknown) => unknown> = {}) {
  const recorder = new AgentJobRecorder(() => new Date("2026-11-17T08:00:00.000Z"));
  const read = vi.fn(executes.query_crm_records ?? (() => ({ ok: true, result: "3 rows\nfound" })));
  const base = {
    query_crm_records: tool({
      description: "Query records",
      inputSchema: z.object({ typeId: z.string() }),
      execute: read as never,
    }),
    mutate_crm_record: tool({
      description: "Change a record",
      inputSchema: z.object({ id: z.string() }),
      execute: (executes.mutate_crm_record ??
        (() => ({
          agentToolStatus: "cancelled",
          reason: "rejected",
          message: "Declined: nobody can approve.",
        }))) as never,
    }),
    load_toolset: tool({
      description: "Load a tool set",
      inputSchema: z.object({ toolset: z.string() }),
      execute: (() => ({ ok: true, result: "Loaded" })) as never,
    }),
    export_crm_records: tool({
      description: "Export",
      inputSchema: z.object({}),
      execute: (() => ({ ok: true, result: "exported" })) as never,
    }),
  };
  const tools = buildAgentJobTools({ locale: "en", maxToolCalls: 3, recorder, base });
  const model = new MockLanguageModelV4({ doGenerate: modelResults as never });
  return { recorder, tools, model, read, flushed: [] as number[] };
}

async function run(
  setupResult: ReturnType<typeof setup>,
  overrides: Partial<Parameters<typeof runAgentJobLoop>[0]> = {},
) {
  const onStep = vi.fn().mockResolvedValue(undefined);
  const outcome = await runAgentJobLoop({
    model: setupResult.model,
    system: "system",
    prompt: "prompt",
    tools: setupResult.tools,
    activeToolNames: () => Object.keys(setupResult.tools),
    recorder: setupResult.recorder,
    maxToolCalls: 3,
    wallMs: 5_000,
    onStep,
    ...overrides,
  });
  return { outcome, onStep };
}

describe("the agent job loop", () => {
  it("runs a tool and ends with the model's answer, recording each step in the transcript", async () => {
    const world = setup([toolCallStep("query_crm_records", { typeId: "deals" }), textStep("Found 3 deals.")]);

    const { outcome, onStep } = await run(world);

    expect(outcome).toMatchObject({ kind: "finished", reason: "stop", text: "Found 3 deals." });
    expect(outcome.steps).toHaveLength(2);
    expect(outcome.steps[0].tokens).toEqual({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(world.recorder.drain().map((event) => event.type)).toEqual(["toolCall", "toolResult", "message"]);
    expect(world.read).toHaveBeenCalledTimes(1);
  });

  it("answers a gated tool with the unattended refusal instead of waiting for an approval", async () => {
    const world = setup([toolCallStep("mutate_crm_record", { id: "x" }), textStep("I could not change it.")]);

    const { outcome } = await run(world);

    expect(outcome).toMatchObject({ kind: "finished", reason: "stop" });
    const result = world.recorder.drain().find((event) => event.type === "toolResult");
    expect(result).toMatchObject({ ok: false, name: "mutate_crm_record", summary: "Declined: nobody can approve." });
  });

  it("stops at the tool call cap and reports it", async () => {
    const calls = [1, 2, 3, 4].map((index) =>
      toolCallStep("query_crm_records", { typeId: `t${index}` }, `call-${index}`),
    );
    const world = setup([...calls, textStep("never reached")]);

    const { outcome } = await run(world);

    expect(outcome).toMatchObject({ kind: "finished", reason: "toolLimit" });
    expect(world.recorder.toolCalls).toBe(3);
    expect(world.read).toHaveBeenCalledTimes(3);
  });

  it("does not run a call past the cap when the model asks for several at once", async () => {
    const batch = {
      content: [1, 2, 3, 4, 5].map((index) => ({
        type: "tool-call" as const,
        toolCallId: `call-${index}`,
        toolName: "query_crm_records",
        input: JSON.stringify({ typeId: `t${index}` }),
      })),
      finishReason: { unified: "tool-calls" as const, raw: "tool_use" },
      usage,
      warnings: [],
    };
    const world = setup([batch, textStep("done")]);

    const { outcome } = await run(world);

    expect(outcome).toMatchObject({ kind: "finished", reason: "toolLimit" });
    expect(world.read).toHaveBeenCalledTimes(3);
    const events = world.recorder.drain();
    const refused = events.filter((event) => event.type === "toolResult" && !event.ok);
    expect(refused).toHaveLength(2);
  });

  it("stops before the next round when the credits cannot cover it", async () => {
    const world = setup([toolCallStep("query_crm_records", { typeId: "deals" }), textStep("never reached")]);

    const { outcome } = await run(world, { outOfBudget: (steps) => steps.length >= 1 });

    expect(outcome).toMatchObject({ kind: "finished", reason: "creditLimit" });
    expect(outcome.steps).toHaveLength(1);
  });

  it("ends a run that outlives its wall time as a time limit and keeps what it had", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" })), 5);
        }),
    });
    const world = setup([]);

    const { outcome } = await run(world, { model, wallMs: 1 });

    expect(outcome).toMatchObject({ kind: "finished", reason: "timeLimit", steps: [] });
  });

  it("returns a provider failure together with the steps that already ran", async () => {
    const failure = Object.assign(new Error("overloaded"), { name: "APICallError", statusCode: 529 });
    const world = setup([toolCallStep("query_crm_records", { typeId: "deals" })]);
    const model = new MockLanguageModelV4({
      doGenerate: [toolCallStep("query_crm_records", { typeId: "deals" }), () => Promise.reject(failure)] as never,
    });

    const { outcome } = await run(world, { model });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(outcome.steps).toHaveLength(1);
    expect((outcome.error as Error).name).toBeDefined();
  });
});

describe("the agent job toolset", () => {
  it("keeps on-demand tools out of the active list until their set is loaded", async () => {
    const world = setup([toolCallStep("load_toolset", { toolset: "data-transfer" }), textStep("loaded")]);
    const toolkit = createAgentJobToolkit;
    expect(typeof toolkit).toBe("function");

    expect(agentJobActiveToolNames(world.tools, world.recorder.loadedToolsets)).not.toContain("export_crm_records");
    await run(world);
    expect(world.recorder.loadedToolsets.has("data-transfer")).toBe(true);
    expect(agentJobActiveToolNames(world.tools, world.recorder.loadedToolsets)).toContain("export_crm_records");
  });

  it("records only a digest of the arguments and a summary of the result", async () => {
    const long = "x".repeat(2000);
    const world = setup([toolCallStep("query_crm_records", { typeId: long }), textStep("ok")], {
      query_crm_records: () => ({ ok: true, result: `${long}\n${long}` }),
    });

    await run(world);

    const events = world.recorder.drain();
    const call = events.find((event) => event.type === "toolCall");
    const result = events.find((event) => event.type === "toolResult");
    expect(call && "argumentsDigest" in call && call.argumentsDigest.length).toBeLessThanOrEqual(300);
    expect(result && "summary" in result && result.summary.length).toBeLessThanOrEqual(300);
  });
});

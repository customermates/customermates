import { describe, expect, it, vi } from "vitest";

const rerank = vi.hoisted(() => ({ charges: [] as unknown[] }));

vi.mock("@/ee/agent-chat/agent-tools", () => ({ getAgentAiTools: vi.fn() }));
vi.mock("@/ee/agent-chat/agent-toolsets", () => ({
  onDemandToolsetOfTool: (name: string) => (name === "export_crm_records" ? "data-transfer" : null),
}));
vi.mock("@/ee/agent-chat/classifier/metered", () => ({
  collectClassifierCharges: async (run: () => Promise<unknown>) => ({
    value: await run(),
    charges: rerank.charges.splice(0),
  }),
}));

import { MockLanguageModelV4 } from "ai/test";
import { tool } from "ai";
import { z } from "zod";

import { AGENT_JOB_TRIMMED_TOOL_RESULT, fitAgentJobContext } from "../agent-job-context";
import { agentJobFailureCode } from "../agent-job-failure";
import { AgentJobRecorder } from "../agent-job-recorder";
import { agentJobActiveToolNames, buildAgentJobTools, createAgentJobToolkit } from "../agent-job-toolset";
import { AGENT_JOB_MAX_STEPS, runAgentJobLoop } from "../run-agent-job-loop";

const usage = {
  inputTokens: { total: 100, noCache: 100, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 20, text: 20, reasoning: undefined },
};
const NO_TOKENS = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
const admitted = (roundReserveMicrocents = 300_000) => ({ admitted: true as const, roundReserveMicrocents });

function systemOf(call: { prompt: Array<{ role: string; content: unknown }> }): string {
  return call.prompt
    .filter((message) => message.role === "system")
    .map((message) => String(message.content))
    .join("\n");
}

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

  it("gives the model one round without tools to report when a call ran into the tool call cap", async () => {
    const calls = [1, 2, 3, 4].map((index) =>
      toolCallStep("query_crm_records", { typeId: `t${index}` }, `call-${index}`),
    );
    const world = setup([...calls, textStep("Read three lists. The fourth is still open.")]);

    const { outcome } = await run(world);

    expect(outcome).toMatchObject({
      kind: "finished",
      reason: "toolLimit",
      text: "Read three lists. The fourth is still open.",
    });
    expect(world.recorder.toolCalls).toBe(3);
    expect(world.read).toHaveBeenCalledTimes(3);
    expect(world.model.doGenerateCalls).toHaveLength(5);
    const report = world.model.doGenerateCalls[4];
    expect(report.tools ?? []).toEqual([]);
    expect(systemOf(report as never)).toContain("no further tool call is possible");
    expect(systemOf(world.model.doGenerateCalls[3] as never)).not.toContain("no further tool call is possible");
  });

  it("lets a run that used exactly its tool calls finish as completed", async () => {
    const calls = [1, 2, 3].map((index) => toolCallStep("query_crm_records", { typeId: `t${index}` }, `call-${index}`));
    const world = setup([...calls, textStep("All three lists are up to date.")]);

    const { outcome } = await run(world);

    expect(outcome).toMatchObject({ kind: "finished", reason: "stop", text: "All three lists are up to date." });
    expect(world.recorder.toolCalls).toBe(3);
    expect((world.model.doGenerateCalls[3].tools ?? []).length).toBeGreaterThan(0);
  });

  it("does not record a run cut by the step cap as completed and still asks for a report", async () => {
    const world = setup([]);
    let round = 0;
    const model = new MockLanguageModelV4({
      doGenerate: (() => {
        round += 1;
        return Promise.resolve(
          round < AGENT_JOB_MAX_STEPS
            ? toolCallStep("query_crm_records", { wrong: true }, `call-${round}`)
            : textStep("I could not form a valid query."),
        );
      }) as never,
    });

    const { outcome } = await run(world, { model });

    expect(outcome).toMatchObject({ kind: "finished", reason: "toolLimit", text: "I could not form a valid query." });
    expect(outcome.steps).toHaveLength(AGENT_JOB_MAX_STEPS);
    expect(world.read).not.toHaveBeenCalled();
    expect(world.recorder.toolCalls).toBe(0);
    expect(model.doGenerateCalls.at(-1)?.tools ?? []).toEqual([]);
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

  it("asks before every round whether the credits cover it and stops before the round they do not", async () => {
    const world = setup([toolCallStep("query_crm_records", { typeId: "deals" }), textStep("never reached")]);
    const asked: Array<{ steps: number; promptTokens: number | null }> = [];
    const admitRound = vi
      .fn()
      .mockImplementation((round: { steps: unknown[]; measured: { promptTokens: number } | null }) => {
        asked.push({ steps: round.steps.length, promptTokens: round.measured?.promptTokens ?? null });
        return Promise.resolve(asked.length === 1 ? admitted() : { admitted: false, reason: "creditLimit" });
      });

    const { outcome } = await run(world, { admitRound });

    expect(outcome).toMatchObject({ kind: "finished", reason: "creditLimit" });
    expect(outcome.steps).toHaveLength(1);
    expect(world.model.doGenerateCalls).toHaveLength(1);
    expect(asked).toEqual([
      { steps: 0, promptTokens: null },
      { steps: 1, promptTokens: 100 },
    ]);
  });

  it("does not call the provider at all when the first round is not covered", async () => {
    const world = setup([textStep("never reached")]);

    const { outcome } = await run(world, {
      admitRound: vi.fn().mockResolvedValue({ admitted: false, reason: "creditLimit" }),
    });

    expect(outcome).toMatchObject({ kind: "finished", reason: "creditLimit", steps: [] });
    expect(world.model.doGenerateCalls).toHaveLength(0);
  });

  it("stops a hosted run as unavailable, not as out of credits, when a round is refused for that reason", async () => {
    const world = setup([toolCallStep("query_crm_records", { typeId: "deals" }), textStep("never reached")]);
    const admitRound = vi
      .fn()
      .mockResolvedValueOnce(admitted())
      .mockResolvedValue({ admitted: false, reason: "hostedAiUnavailable" });

    const { outcome } = await run(world, { admitRound });

    expect(outcome).toMatchObject({ kind: "stopped", code: "hostedAiUnavailable" });
    expect(outcome.steps).toHaveLength(1);
    expect(world.model.doGenerateCalls).toHaveLength(1);
  });

  it("marks the tools and the system prompt as cacheable for an Anthropic key and leaves other runs unmarked", async () => {
    const cacheOf = (value: unknown) =>
      (value as { providerOptions?: { anthropic?: unknown } }).providerOptions?.anthropic;
    const anthropic = setup([toolCallStep("query_crm_records", { typeId: "deals" }), textStep("done")]);
    await run(anthropic, {
      anthropicCache: true,
      activeToolNames: () => agentJobActiveToolNames(anthropic.tools, anthropic.recorder.loadedToolsets),
    });

    for (const call of anthropic.model.doGenerateCalls) {
      const sent = call.tools ?? [];
      expect(sent.map((definition) => definition.name)).toEqual([
        "query_crm_records",
        "mutate_crm_record",
        "load_toolset",
      ]);
      expect(cacheOf(sent[2])).toEqual({ cacheControl: { type: "ephemeral", ttl: "1h" } });
      expect(cacheOf(sent[0])).toBeUndefined();
      expect(call.prompt[0]).toMatchObject({ role: "system", content: "system" });
      expect(cacheOf(call.prompt[0])).toEqual({ cacheControl: { type: "ephemeral" } });
    }
    expect(anthropic.read).toHaveBeenCalledTimes(1);

    const other = setup([textStep("done")]);
    await run(other);
    const [call] = other.model.doGenerateCalls;
    expect((call.tools ?? []).every((definition) => cacheOf(definition) === undefined)).toBe(true);
    expect(cacheOf(call.prompt[0])).toBeUndefined();
  });

  it("sends the output and reasoning limits of a hosted run and none for a run on the workspace's own key", async () => {
    const hosted = setup([textStep("done")]);
    await run(hosted, { limits: { maxOutputTokens: 8192, maxContextBytes: 195_000, reasoning: "medium" } });
    expect(hosted.model.doGenerateCalls[0]).toMatchObject({ maxOutputTokens: 8192, reasoning: "medium" });

    const ownKey = setup([textStep("done")]);
    await run(ownKey);
    expect(ownKey.model.doGenerateCalls[0].maxOutputTokens).toBeUndefined();
    expect(ownKey.model.doGenerateCalls[0].reasoning).toBeUndefined();
  });

  it("bills a round whose usage cannot be read at what was reserved for it and keeps going", async () => {
    const unreadable = {
      ...toolCallStep("query_crm_records", { typeId: "deals" }),
      usage: { ...usage, inputTokens: { ...usage.inputTokens, total: 12.5, noCache: 12.5 } },
    };
    const world = setup([unreadable, textStep("done")]);

    const { outcome } = await run(world, { admitRound: vi.fn().mockResolvedValue(admitted(275_000)) });

    expect(outcome).toMatchObject({ kind: "finished", reason: "stop", text: "done" });
    expect(outcome.steps).toHaveLength(2);
    expect(outcome.steps[0]).toMatchObject({ tokens: NO_TOKENS, unmeasuredMicrocents: 275_000 });
    expect(outcome.steps[1].unmeasuredMicrocents).toBeUndefined();

    const ownKey = setup([unreadable, textStep("done")]);
    const own = await run(ownKey);
    expect(own.outcome.steps).toHaveLength(2);
    expect(own.outcome.steps[0]).toEqual({ tokens: NO_TOKENS, providerMetadata: undefined });
  });

  it("bills the round that was in flight when a hosted run ran out of time", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: () =>
        new Promise((_resolve, reject) => {
          setTimeout(() => reject(Object.assign(new Error("The operation timed out."), { name: "TimeoutError" })), 5);
        }),
    });
    const world = setup([]);

    const { outcome } = await run(world, { model, wallMs: 1, admitRound: vi.fn().mockResolvedValue(admitted()) });

    expect(outcome).toMatchObject({ kind: "finished", reason: "timeLimit" });
    expect(outcome.steps).toEqual([{ tokens: NO_TOKENS, providerMetadata: undefined, unmeasuredMicrocents: 300_000 }]);
  });

  it("does not bill a round the provider refused with an error status", async () => {
    const failure = Object.assign(new Error("overloaded"), { name: "APICallError", statusCode: 529 });
    const world = setup([]);
    let round = 0;
    const model = new MockLanguageModelV4({
      doGenerate: (() => {
        round += 1;
        return round === 1
          ? Promise.resolve(toolCallStep("query_crm_records", { typeId: "deals" }))
          : Promise.reject(failure);
      }) as never,
    });

    const { outcome } = await run(world, { model, admitRound: vi.fn().mockResolvedValue(admitted()) });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(agentJobFailureCode(outcome.error)).toMatch(/:529$/);
    expect(outcome.steps).toHaveLength(1);
    expect(outcome.steps[0].unmeasuredMicrocents).toBeUndefined();
  });

  it("bills the round of a hosted run that broke off without an answer from the provider", async () => {
    const world = setup([]);
    const model = new MockLanguageModelV4({
      doGenerate: (() => Promise.reject(new TypeError("fetch failed"))) as never,
    });

    const { outcome } = await run(world, { model, admitRound: vi.fn().mockResolvedValue(admitted(410_000)) });

    expect(outcome.kind).toBe("failed");
    expect(outcome.steps).toEqual([{ tokens: NO_TOKENS, providerMetadata: undefined, unmeasuredMicrocents: 410_000 }]);
  });

  it("stops a hosted run whose instruction and tools alone exceed the context limit, before any provider call", async () => {
    const world = setup([textStep("never reached")]);

    const { outcome } = await run(world, { limits: { maxOutputTokens: 8192, maxContextBytes: 50 } });

    expect(outcome).toMatchObject({ kind: "stopped", code: "contextLimit", steps: [] });
    expect(world.model.doGenerateCalls).toHaveLength(0);
  });

  it("drops the oldest tool results of a hosted run instead of sending more than the context limit", async () => {
    const big = "r".repeat(3_000);
    const calls = [1, 2, 3].map((index) => toolCallStep("query_crm_records", { typeId: `t${index}` }, `call-${index}`));
    const world = setup([...calls, textStep("done")], { query_crm_records: () => ({ ok: true, result: big }) });
    const contexts: number[] = [];
    const admitRound = vi.fn().mockImplementation((round: { contextBytes: number }) => {
      contexts.push(round.contextBytes);
      return Promise.resolve(admitted());
    });

    const first = await run(world, { limits: { maxOutputTokens: 8192, maxContextBytes: 1_000_000 }, admitRound });
    expect(first.outcome).toMatchObject({ reason: "stop" });
    const [base, afterOne, afterTwo] = contexts;
    expect(afterOne - base).toBeGreaterThan(3_000);

    const tight = setup([...calls, textStep("done")], { query_crm_records: () => ({ ok: true, result: big }) });
    const maxContextBytes = afterTwo - 1;
    const second = await run(tight, { limits: { maxOutputTokens: 8192, maxContextBytes }, admitRound });

    expect(second.outcome).toMatchObject({ kind: "finished", reason: "stop", text: "done" });
    const sent = JSON.stringify(tight.model.doGenerateCalls.map((call) => call.prompt));
    expect(sent).toContain(AGENT_JOB_TRIMMED_TOOL_RESULT);
    for (const call of tight.model.doGenerateCalls) {
      const results = JSON.stringify(call.prompt).split(big).length - 1;
      expect(results).toBeLessThanOrEqual(1);
    }
    expect(JSON.stringify(tight.model.doGenerateCalls.at(-1)?.prompt)).toContain(big);
  });

  it("hands the re-rank charges of the tools to the credit check and to the outcome", async () => {
    const charge = { use: "docs_rerank", model: "jev", costMicrocents: 1_200, measured: true, answered: true };
    const world = setup([toolCallStep("query_crm_records", { typeId: "deals" }), textStep("done")], {
      query_crm_records: () => {
        rerank.charges.push(charge);
        return { ok: true, result: "3 rows" };
      },
    });
    const admitRound = vi.fn().mockResolvedValue(admitted());

    const { outcome } = await run(world, { admitRound });

    expect(outcome.auxiliary).toEqual([charge]);
    expect(admitRound.mock.calls[1][0].auxiliary).toEqual([charge]);
  });

  it("fails the run and keeps its usage when a step cannot be written to the transcript", async () => {
    const world = setup([toolCallStep("query_crm_records", { typeId: "deals" }), textStep("never reached")]);
    const onStep = vi.fn().mockRejectedValue(new Error("transcript store unavailable"));

    const outcome = await runAgentJobLoop({
      model: world.model,
      system: "system",
      prompt: "prompt",
      tools: world.tools,
      activeToolNames: () => Object.keys(world.tools),
      recorder: world.recorder,
      maxToolCalls: 3,
      wallMs: 5_000,
      onStep,
    });

    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect((outcome.error as Error).message).toBe("transcript store unavailable");
    expect(outcome.steps).toHaveLength(1);
    expect(world.model.doGenerateCalls).toHaveLength(1);
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

describe("fitting a hosted run into its context limit", () => {
  const result = (toolCallId: string, value: string) => ({
    role: "tool" as const,
    content: [
      { type: "tool-result" as const, toolCallId, toolName: "query", output: { type: "text" as const, value } },
    ],
  });
  const messages = [
    { role: "user" as const, content: "Check the offers" },
    result("call-1", "a".repeat(2_000)),
    result("call-2", "b".repeat(2_000)),
    result("call-3", "c".repeat(2_000)),
  ];
  const fit = (maxContextBytes: number) =>
    fitAgentJobContext({ system: "system", messages: messages as never, tools: [], maxContextBytes });

  it("leaves a context that fits untouched", () => {
    const fitted = fit(100_000);

    expect(fitted?.messages).toBe(messages);
    expect(fitted?.contextBytes).toBeGreaterThan(6_000);
  });

  it("replaces tool results oldest first until the context fits and reports the new size", () => {
    const whole = fit(100_000)?.contextBytes ?? 0;
    const fitted = fit(whole - 2_500);

    const sent = JSON.stringify(fitted?.messages);
    expect(sent).not.toContain("a".repeat(2_000));
    expect(sent).not.toContain("b".repeat(2_000));
    expect(sent).toContain("c".repeat(2_000));
    expect(sent.split(AGENT_JOB_TRIMMED_TOOL_RESULT).length - 1).toBe(2);
    expect(fitted?.contextBytes).toBeLessThanOrEqual(whole - 2_500);
    expect(JSON.stringify(messages)).toContain("a".repeat(2_000));
  });

  it("gives up when even the instruction does not fit", () => {
    expect(fit(20)).toBeNull();
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

import { beforeEach, describe, expect, it, vi } from "vitest";

type WorkflowTool = {
  needsApproval: (input: unknown, options: { toolCallId: string }) => Promise<boolean>;
  execute?: (input: unknown, options: { toolCallId: string }) => Promise<unknown>;
};

type StreamOptions = {
  tools: Record<string, WorkflowTool>;
  messages: unknown[];
  completeStepAndPrepareNext: (step: unknown, messages?: unknown[]) => Promise<void>;
  executeAndCompleteTool: (toolName: string, input: unknown, toolCallId: string) => Promise<unknown>;
};

const state = vi.hoisted(() => ({
  gateResults: [] as boolean[],
  gateFailure: null as Error | null,
  contextFits: vi.fn(),
  providerCalls: 0,
  writes: [] as unknown[],
  markProviderStarted: vi.fn<() => Promise<boolean>>(),
  finalize: vi.fn(),
  reconcile: vi.fn(),
  close: vi.fn(),
  reportFailure: vi.fn(),
  toolLoadFailure: false,
  providerOptions: null as unknown,
  definitions: [] as { name: string; description: string; inputSchema: unknown }[],
  normalize: vi.fn(),
  execute: vi.fn(),
  runTools: null as null | ((options: StreamOptions) => Promise<unknown>),
  createApproval: vi.fn(),
  readApproval: vi.fn(),
  takeUiResult: vi.fn(),
  readCancellation: vi.fn(),
  dispatch: vi.fn(),
  heartbeat: vi.fn(),
  recordRound: vi.fn(),
  extendReservation: vi.fn(),
  instructions: [] as string[],
}));

vi.mock("@ai-sdk/workflow", () => ({
  WorkflowAgent: class {
    constructor(
      private readonly options: {
        prepareStep: (input: { messages: unknown[] }) => Promise<unknown>;
        onStepEnd: (step: unknown) => Promise<void>;
        onToolExecutionEnd: (event: unknown) => void;
        instructions: string;
        providerOptions: unknown;
        tools: Record<string, WorkflowTool>;
      },
    ) {
      state.providerOptions = options.providerOptions;
      state.instructions.push(options.instructions);
    }

    async stream({ messages }: { messages: unknown[] }) {
      if (messages.some((message) => (message as { role?: string }).role === "system")) {
        throw new Error(
          "System messages are not allowed in the prompt or messages fields. Use the instructions option instead.",
        );
      }
      const preparedMessages = (nextMessages: unknown[]) => [
        { role: "system", content: this.options.instructions },
        ...nextMessages,
      ];
      if (state.runTools) {
        await this.options.prepareStep({ messages: preparedMessages(messages) });
        state.providerCalls += 1;
        return state.runTools({
          tools: this.options.tools,
          messages,
          completeStepAndPrepareNext: async (step, nextMessages = messages) => {
            await this.options.onStepEnd(step);
            await this.options.prepareStep({ messages: preparedMessages(nextMessages) });
            state.providerCalls += 1;
          },
          executeAndCompleteTool: async (toolName, input, toolCallId) => {
            const tool = this.options.tools[toolName];
            if (!tool?.execute) throw new Error(`Tool ${toolName} cannot execute.`);
            const output = await tool.execute(input, { toolCallId });
            this.options.onToolExecutionEnd({
              success: true,
              toolCall: { toolCallId, toolName },
              output,
            });
            return output;
          },
        });
      }
      await this.options.prepareStep({ messages: preparedMessages(messages) });
      state.providerCalls += 1;

      await this.options.prepareStep({ messages: preparedMessages(messages) });
      state.providerCalls += 1;

      return { finishReason: "stop", messages: [], steps: [] };
    }
  },
}));

vi.mock("workflow", () => ({
  createHook: () => ({
    dispose: vi.fn(),
    async *[Symbol.asyncIterator]() {
      yield await Promise.resolve({ requestId: "turn-1:call-1" });
    },
  }),
  getWritable: () => ({
    close: state.close,
    getWriter: () => ({
      releaseLock: vi.fn(),
      write: (value: unknown) => {
        state.writes.push(value);
        return Promise.resolve();
      },
    }),
  }),
  sleep: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("ai", () => ({
  isStepCount: () => () => false,
  jsonSchema: (schema: unknown) => schema,
}));

vi.mock("@/core/decorators/background-tenant", () => ({
  runAsBackgroundTenant: (_userId: string, run: () => unknown) => Promise.resolve(run()),
}));

vi.mock("@/core/di", () => ({
  getAgentChatRepo: () => ({
    canStartNextHostedAiProviderRoundUnscoped: vi.fn(() => {
      if (state.gateFailure) return Promise.reject(state.gateFailure);
      return Promise.resolve(state.gateResults.shift() ?? true);
    }),
    finalizeAgentTurnOrThrowUnscoped: state.finalize,
    reconcileInterruptedAgentTurnUnscoped: state.reconcile,
    isAgentTurnCancellationRequestedUnscoped: state.readCancellation,
    markAgentTurnProviderStartedUnscoped: state.markProviderStarted,
    extendAgentRunLeaseForSuspensionUnscoped: vi.fn().mockResolvedValue(undefined),
    createPendingApprovalRequestOrThrowUnscoped: state.createApproval,
    findApprovalDecisionUnscoped: state.readApproval,
    discardPendingApprovalRequestUnscoped: vi.fn().mockResolvedValue(undefined),
    takeUiCommandResultUnscoped: state.takeUiResult,
    heartbeatAgentRunUnscoped: state.heartbeat,
    recordAgentRunRoundUnscoped: state.recordRound,
    extendUsageReservationUnscoped: state.extendReservation,
  }),
  getBackgroundTaskService: () => ({ dispatch: state.dispatch }),
}));

vi.mock("@/ee/agent-chat/agent-tools", () => ({
  getAgentAiToolDefinitions: () => {
    if (state.toolLoadFailure) throw new Error("tool shell unavailable");
    return state.definitions;
  },
  agentToolDefinitionsForTurn: () => {
    if (state.toolLoadFailure) throw new Error("tool shell unavailable");
    return state.definitions.map((definition: { name: string }) => ({ ...definition, toolset: null }));
  },
  getAgentAiTools: () => Object.fromEntries(state.definitions.map(({ name }) => [name, { execute: state.execute }])),
  normalizeAgentAiToolInput: state.normalize,
  AGENT_HOSTED_TOOL_ANNOTATIONS: { analyze_records: { readOnlyHint: true } },
}));
vi.mock("@/features/mcp-tools/tool-registry", () => ({
  ALL_MCP_TOOLS: [
    { name: "list_users", annotations: { readOnlyHint: true } },
    { name: "manage_widgets", annotations: { readOnlyHint: false } },
    { name: "delete_records", annotations: { readOnlyHint: false } },
  ],
}));
vi.mock("@/ee/agent-chat/system-prompt", () => ({
  buildAgentSystemPrompt: () => "system",
  routineTriggerEventOf: () => null,
}));
vi.mock("@/ee/agent-chat/agent-provider-context", () => ({
  buildAgentProviderContext: (system: string, messages: unknown[], tools: unknown[]) => ({ messages, system, tools }),
  isAgentStepContextWithinBudget: (...args: unknown[]) => state.contextFits(...args),
}));
vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () => Promise.resolve((key: string) => `localized:${key}`),
}));
vi.mock("@/i18n/locale-registry", () => ({ appLocaleOrDefault: (locale: string) => locale }));
vi.mock("../capture-failure", () => ({
  reportFailure: state.reportFailure,
  reportWarning: () => Promise.resolve(),
  toWorkflowFailure: (error: unknown) => error,
}));

import { runAgentTurn, type AgentTurnWorkflowPayload } from "../agent-turn";
import { approvalDenialReason } from "@/ee/agent-chat/agent-approval-resume";

const payload: AgentTurnWorkflowPayload = {
  turnRequestId: "turn-1",
  conversationId: "conversation-1",
  runId: "run-1",
  companyId: "company-1",
  userId: "user-1",
  userName: "Test User",
  locale: "en",
  messages: [{ role: "user", text: "Hello" }],
  turnBudget: {
    modelSpec: "google/gemini-3.5-flash-lite",
    servingProvider: "vertex",
    inferenceRegion: "eu",
    reservedCredits: 10,
    roundReserveCredits: 2,
    maxOutputTokens: 100,
    maxContextTokens: 8_000,
    maxContextBytes: 32_000,
    maxToolResultChars: 1_000,
  },
  tenant: { userId: "user-1", companyId: "company-1" },
};

beforeEach(() => {
  state.gateResults = [];
  state.gateFailure = null;
  state.providerCalls = 0;
  state.writes = [];
  state.toolLoadFailure = false;
  state.providerOptions = null;
  state.definitions = [];
  state.runTools = null;
  state.normalize.mockReset();
  state.execute.mockReset().mockResolvedValue({ ok: true, result: "done" });
  state.createApproval.mockReset().mockResolvedValue(undefined);
  state.readApproval.mockReset();
  state.takeUiResult.mockReset().mockResolvedValue({ ok: true, result: "shown" });
  state.readCancellation.mockReset().mockResolvedValue(false);
  state.dispatch.mockReset().mockResolvedValue(undefined);
  state.heartbeat.mockReset().mockResolvedValue(true);
  state.recordRound.mockReset().mockResolvedValue(undefined);
  state.extendReservation
    .mockReset()
    .mockImplementation(({ requiredCredits }) =>
      Promise.resolve({ disposition: "extended", reservedCredits: requiredCredits }),
    );
  state.contextFits.mockReset().mockReturnValue(true);
  state.instructions.length = 0;
  state.reconcile.mockReset().mockResolvedValue({ reconciled: true });
  state.close.mockReset().mockResolvedValue(undefined);
  state.reportFailure.mockReset().mockResolvedValue(undefined);
  state.markProviderStarted.mockReset().mockResolvedValue(true);
  state.finalize.mockReset().mockImplementation((args) => {
    const policyBreach = args.usageSettlement?.policyBreach === true;
    return Promise.resolve({
      assistantMessage: { id: "assistant-1" },
      terminalCode: policyBreach ? "policyBreach" : args.terminalCode,
      stopReason: policyBreach ? "policy_breach" : args.stopReason,
      affectedResources: args.affectedResources,
      chargedCredits: args.usageSettlement?.chargedCredits ?? 0,
    });
  });
});

function streamedStep(text: string, finishReason: string, outputTokens = text ? 1 : 0) {
  return {
    content: text ? [{ type: "text", text }] : [],
    finishReason,
    usage: {
      inputTokens: 1,
      outputTokens,
      totalTokens: outputTokens + 1,
      inputTokenDetails: { noCacheTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
      outputTokenDetails: { textTokens: outputTokens, reasoningTokens: 0 },
    },
    providerMetadata: {},
  };
}

function streamedToolCallStep(toolName: string, toolCallId: string, input: unknown) {
  return {
    ...streamedStep("", "tool-calls"),
    content: [{ type: "tool-call", toolName, toolCallId, input }],
  };
}

describe("agent-turn hosted-AI provider gates", () => {
  it("makes no provider call when the provider-start admission is rejected", async () => {
    state.markProviderStarted.mockResolvedValueOnce(false);

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(0);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ usageSettlement: null, stopReason: "hosted_ai_unavailable" }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.hostedAiUnavailable");
    expect(JSON.stringify(state.writes)).not.toMatch(/operator_paused|global_spend_cap/u);
  });

  it("does not invoke the provider again when a later round gate is rejected", async () => {
    state.gateResults = [true, false];

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(1);
    expect(state.providerOptions).toEqual({
      gateway: {
        only: [payload.turnBudget.servingProvider],
        inferenceRegion: { scope: "zone", geoRegion: "eu" },
        zeroDataRetention: true,
        disallowPromptTraining: true,
        caching: "auto",
      },
      openai: { parallelToolCalls: false },
    });
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "partial", stopReason: "hosted_ai_unavailable" }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.hostedAiUnavailable");
    expect(JSON.stringify(state.writes)).not.toMatch(/operator_paused|global_spend_cap/u);
  });
});

describe("agent-turn credit-bounded continuation", () => {
  it("continues a length-truncated response from captured partial output without replaying the original prompt", async () => {
    let segment = 0;
    const seenMessages: unknown[][] = [];
    state.runTools = ({ messages }) => {
      seenMessages.push(messages);
      segment += 1;

      if (segment === 1) {
        return Promise.resolve({
          finishReason: "length",
          messages: [{ role: "user", content: "Hello" }],
          steps: [streamedStep("First half.", "length")],
        });
      }

      return Promise.resolve({
        finishReason: "stop",
        messages,
        steps: [streamedStep(" Second half.", "stop")],
      });
    };

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(2);
    expect(state.writes.filter((event) => (event as { type?: string }).type === "stream_checkpoint")).toHaveLength(2);
    expect(JSON.stringify(seenMessages[1])).toContain("First half.");
    expect(JSON.stringify(seenMessages[1])).toContain("agent_output_continuation");
    expect(JSON.stringify(seenMessages[1]).match(/Hello/g)).toHaveLength(1);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });

  it("stops before another provider segment when the next worst-case round cannot be reserved", async () => {
    state.extendReservation.mockResolvedValueOnce({ disposition: "credit_limit" });
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "length",
        messages,
        steps: [streamedStep("Partial response.", "length")],
      });

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, reservedCredits: 1, roundReserveCredits: 2 },
    });

    expect(state.providerCalls).toBe(1);
    expect(state.extendReservation).toHaveBeenCalledWith(expect.objectContaining({ requiredCredits: 3 }));
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalCode: "partial",
        stopReason: "credit_limit",
        usageSettlement: expect.objectContaining({ reservedCredits: 1, chargedCredits: 1 }),
      }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.creditLimitNoWrite");
  });

  it("blocks the SDK's next internal provider request when a tool-call round exhausts its reservation", async () => {
    state.extendReservation.mockResolvedValueOnce({ disposition: "credit_limit" });
    state.runTools = async ({ messages, completeStepAndPrepareNext }) => {
      await completeStepAndPrepareNext(streamedStep("Working.", "tool-calls"), messages);
      throw new Error("unreachable");
    };

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, reservedCredits: 1, roundReserveCredits: 2 },
    });

    expect(state.providerCalls).toBe(1);
    expect(state.extendReservation).toHaveBeenCalledWith(expect.objectContaining({ requiredCredits: 3 }));
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "partial", stopReason: "credit_limit" }),
    );
  });

  it("blocks the SDK's next internal provider request after cancellation is observed at the round boundary", async () => {
    state.readCancellation.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    state.runTools = async ({ messages, completeStepAndPrepareNext }) => {
      await completeStepAndPrepareNext(streamedStep("Working.", "tool-calls"), messages);
      throw new Error("unreachable");
    };

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(1);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "cancelled", stopReason: "cancelled" }),
    );
    expect(state.extendReservation).not.toHaveBeenCalled();
  });

  it("does not reserve a future round after the current run loses its lease", async () => {
    state.heartbeat.mockResolvedValueOnce(false);
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "tool-calls",
        messages,
        steps: [streamedStep("Working.", "tool-calls")],
      });

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, reservedCredits: 1, roundReserveCredits: 2 },
    });

    expect(state.providerCalls).toBe(1);
    expect(state.extendReservation).not.toHaveBeenCalled();
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it("blocks the SDK's next internal provider request after round persistence fails", async () => {
    state.recordRound.mockRejectedValueOnce(new Error("round persistence unavailable"));
    state.runTools = async ({ messages, completeStepAndPrepareNext }) => {
      await completeStepAndPrepareNext(streamedStep("Working.", "tool-calls"), messages);
      throw new Error("unreachable");
    };

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(1);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "partial", stopReason: "turn_error" }),
    );
  });

  it("reports hosted AI as unavailable when a global gate denies a reservation extension", async () => {
    state.extendReservation.mockResolvedValueOnce({ disposition: "hosted_ai_unavailable" });
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "length",
        messages,
        steps: [streamedStep("Partial response.", "length")],
      });

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, reservedCredits: 1, roundReserveCredits: 2 },
    });

    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "partial", stopReason: "hosted_ai_unavailable" }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.hostedAiUnavailable");
  });

  it("does not reserve a next round after a terminal stop", async () => {
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "stop",
        messages,
        steps: [streamedStep("Done.", "stop")],
      });

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, reservedCredits: 1, roundReserveCredits: 2 },
    });

    expect(state.extendReservation).not.toHaveBeenCalled();
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });

  it("does not request approval after credit denial makes a pending tool impossible to resume", async () => {
    state.definitions.push({ name: "delete_records", description: "delete_records", inputSchema: { type: "object" } });
    state.normalize.mockResolvedValue({ ok: true, input: { entity: "contact", ids: ["record-1"] } });
    state.extendReservation.mockResolvedValueOnce({ disposition: "credit_limit" });
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "tool-calls",
        messages: [
          ...messages,
          {
            role: "assistant",
            content: [
              {
                type: "tool-call",
                toolName: "delete_records",
                toolCallId: "call-1",
                input: { entity: "contact", ids: ["record-1"] },
              },
            ],
          },
        ],
        steps: [streamedToolCallStep("delete_records", "call-1", { entity: "contact", ids: ["record-1"] })],
      });

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, reservedCredits: 1, roundReserveCredits: 2 },
    });

    expect(state.createApproval).not.toHaveBeenCalled();
    expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ stopReason: "credit_limit" }));
  });

  it("continues after a 32-round segment and compacts before the next segment", async () => {
    state.contextFits.mockReturnValueOnce(false).mockReturnValue(true);
    const seenMessages: unknown[][] = [];
    let segment = 0;
    state.runTools = ({ messages }) => {
      seenMessages.push(messages);
      segment += 1;
      if (segment === 1) {
        return Promise.resolve({
          finishReason: "tool-calls",
          messages,
          steps: Array.from({ length: 32 }, () => streamedStep("", "tool-calls")),
        });
      }
      return Promise.resolve({
        finishReason: "stop",
        messages,
        steps: [streamedStep("Done.", "stop")],
      });
    };

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(2);
    expect(state.recordRound).toHaveBeenCalledTimes(33);
    expect(JSON.stringify(seenMessages[1]).match(/Hello/g)).toHaveLength(1);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });

  it("retries a resolved provider error and reports it with the provider's own message", async () => {
    let segment = 0;
    state.runTools = ({ messages }) => {
      segment += 1;
      if (segment <= 2) {
        return Promise.resolve({
          finishReason: "error",
          messages: [{ role: "system", content: "instructions the SDK carries in its result" }, ...messages],
          steps: [streamedStep("", "error")],
          error: new Error("Vertex said no"),
        });
      }
      return Promise.resolve({ finishReason: "stop", messages, steps: [streamedStep("Done.", "stop")] });
    };

    await runAgentTurn(payload);

    expect(segment).toBe(3);
    expect(state.reportFailure).toHaveBeenCalledTimes(2);
    expect(state.reportFailure.mock.calls[0][1].message).toContain('finishReason "error"');
    expect(state.reportFailure.mock.calls[0][1].message).toContain("Vertex said no");
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });

  it("stops with provider_error once the resolved-error retries are spent", async () => {
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "error",
        messages,
        steps: [streamedStep("", "error")],
        error: new Error("Vertex said no again"),
      });

    await runAgentTurn(payload);

    expect(state.reportFailure).toHaveBeenCalledTimes(3);
    expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ stopReason: "provider_error" }));
  });

  it("carries a digest of earlier tool results into the compacted segment", async () => {
    state.contextFits.mockReturnValueOnce(false).mockReturnValue(true);
    state.definitions.push({ name: "list_records", description: "list_records", inputSchema: { type: "object" } });
    state.normalize.mockResolvedValue({ ok: true, input: { entity: "deal" } });
    state.execute.mockResolvedValue({
      ok: true,
      result: ["total: 42", "items[1]{id,name}:", "  11111111-2222-3333-4444-555555555555,Nova Expansion"].join("\n"),
    });
    let segment = 0;
    state.runTools = async ({ messages, executeAndCompleteTool }) => {
      segment += 1;
      if (segment === 1) {
        await executeAndCompleteTool("list_records", { entity: "deal" }, "call-digest");
        return {
          finishReason: "tool-calls",
          messages,
          steps: [
            streamedToolCallStep("list_records", "call-digest", { entity: "deal" }),
            ...Array.from({ length: 31 }, () => streamedStep("", "tool-calls")),
          ],
        };
      }
      return { finishReason: "stop", messages, steps: [streamedStep("Done.", "stop")] };
    };

    await runAgentTurn(payload);

    const compacted = state.instructions.at(-1) ?? "";
    expect(compacted).toContain("<agent_continuation_checkpoint>");
    expect(compacted).toContain("total=42");
    expect(compacted).not.toContain("Nova Expansion");
    expect(compacted).not.toContain("11111111-2222-3333-4444-555555555555");
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });

  it("adaptively retains only the current partial output when two large length steps do not fit", async () => {
    state.contextFits.mockImplementation((context: unknown, stepMessages: unknown, maxBytes: unknown) => {
      if (typeof maxBytes !== "number") return false;
      return (
        new TextEncoder().encode(JSON.stringify({ ...(context as object), messages: stepMessages })).byteLength <=
        maxBytes
      );
    });
    const firstPartial = `first:${"a".repeat(7_000)}`;
    const currentPartial = `current:${"b".repeat(7_000)}`;
    const seenMessages: unknown[][] = [];
    let segment = 0;
    state.runTools = ({ messages }) => {
      seenMessages.push(messages);
      segment += 1;
      if (segment === 1) {
        return Promise.resolve({
          finishReason: "length",
          messages: [...messages, { role: "assistant", content: firstPartial }],
          steps: [streamedStep(firstPartial, "length"), streamedStep(currentPartial, "length")],
        });
      }
      return Promise.resolve({
        finishReason: "stop",
        messages,
        steps: [streamedStep("Done.", "stop")],
      });
    };

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, maxContextBytes: 10_000 },
    });

    expect(state.providerCalls).toBe(2);
    expect(JSON.stringify(seenMessages[1])).not.toContain(firstPartial);
    expect(JSON.stringify(seenMessages[1])).toContain(currentPartial);
    expect(JSON.stringify(seenMessages[1])).toContain("agent_output_continuation");
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });

  it("drops a large completed tool result after recording it in the trusted checkpoint", async () => {
    state.contextFits.mockImplementation((context: unknown, stepMessages: unknown, maxBytes: unknown) => {
      if (typeof maxBytes !== "number") return false;
      return (
        new TextEncoder().encode(JSON.stringify({ ...(context as object), messages: stepMessages })).byteLength <=
        maxBytes
      );
    });
    state.definitions.push({ name: "list_users", description: "list_users", inputSchema: { type: "object" } });
    state.normalize.mockResolvedValue({ ok: true, input: { page: 1 } });
    const largeResult = `result:${"界".repeat(6_000)}`;
    state.execute.mockResolvedValue({ ok: true, result: largeResult });
    const seenMessages: unknown[][] = [];
    let segment = 0;
    state.runTools = async ({ messages, executeAndCompleteTool }) => {
      seenMessages.push(messages);
      segment += 1;
      if (segment === 1) {
        const output = await executeAndCompleteTool("list_users", { page: 1 }, "call-1");
        return {
          finishReason: "tool-calls",
          messages: [
            ...messages,
            {
              role: "assistant",
              content: [{ type: "tool-call", toolName: "list_users", toolCallId: "call-1", input: { page: 1 } }],
            },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolName: "list_users",
                  toolCallId: "call-1",
                  output: { type: "json", value: output },
                },
              ],
            },
          ],
          steps: [streamedToolCallStep("list_users", "call-1", { page: 1 })],
        };
      }
      return {
        finishReason: "stop",
        messages,
        steps: [streamedStep("Done.", "stop")],
      };
    };

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, maxContextBytes: 10_000 },
    });

    expect(state.providerCalls).toBe(2);
    expect(JSON.stringify(seenMessages[1])).not.toContain(largeResult);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });

  it("compacts an approval-resume message set before treating context overflow as fatal", async () => {
    state.definitions.push({ name: "navigate", description: "navigate", inputSchema: { type: "object" } });
    state.normalize.mockResolvedValue({ ok: true, input: { targetId: "nav-contacts" } });
    let segment = 0;
    state.runTools = ({ messages }) => {
      segment += 1;
      if (segment === 1) {
        return Promise.resolve({
          finishReason: "tool-calls",
          messages: [
            ...messages,
            {
              role: "assistant",
              content: [
                { type: "text", text: "x".repeat(4_000) },
                {
                  type: "tool-call",
                  toolName: "navigate",
                  toolCallId: "panel-1",
                  input: { targetId: "nav-contacts" },
                },
              ],
            },
          ],
          steps: [
            streamedStep("a".repeat(1_500), "tool-calls"),
            streamedStep("b".repeat(1_500), "tool-calls"),
            streamedToolCallStep("navigate", "panel-1", { targetId: "nav-contacts" }),
          ],
        });
      }
      return Promise.resolve({
        finishReason: "stop",
        messages,
        steps: [streamedStep("Done.", "stop")],
      });
    };

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, maxContextBytes: 3_000 },
    });

    expect(segment).toBe(2);
    expect(state.providerCalls).toBe(2);
    expect(state.takeUiResult).toHaveBeenCalled();
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", stopReason: null }),
    );
  });
});

describe("agent-turn terminal reasons", () => {
  it("classifies a provider-originated stream exception as a provider error", async () => {
    const providerFailure = Object.assign(new Error("provider unavailable"), {
      [Symbol.for("vercel.ai.gateway.error")]: true,
    });
    state.runTools = () => Promise.reject(providerFailure);

    await runAgentTurn(payload);

    expect(state.reportFailure).toHaveBeenCalledWith("agent-turn", providerFailure, payload.tenant);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "partial", stopReason: "provider_error" }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.providerError");
  });

  it("classifies a provider-round gate failure as a turn error", async () => {
    const gateFailure = new Error("round gate unavailable");
    state.gateFailure = gateFailure;

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(0);
    expect(state.reportFailure).toHaveBeenCalledWith("agent-turn", gateFailure, payload.tenant);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "partial", stopReason: "turn_error" }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.turnError");
  });

  it.each([
    ["content-filter", "content_filter", "contentFilter"],
    ["error", "provider_error", "providerError"],
    ["other", "provider_error", "providerError"],
    ["unknown", "provider_error", "providerError"],
  ] as const)("persists and emits %s as %s", async (finishReason, stopReason, messageKey) => {
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason,
        messages,
        steps: [streamedStep("Partial response.", finishReason)],
      });

    await runAgentTurn(payload);

    expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ terminalCode: "partial", stopReason }));
    expect(JSON.stringify(state.writes)).toContain(`localized:AgentChat.runner.${messageKey}`);
    expect(state.writes).toContainEqual(
      expect.objectContaining({
        type: "turn_done",
        payload: expect.objectContaining({ terminalCode: "partial", stopReason }),
      }),
    );
  });

  it("persists and emits a durable turn error", async () => {
    const failure = new Error("round persistence unavailable");
    state.recordRound.mockRejectedValueOnce(failure);
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "tool-calls",
        messages,
        steps: [streamedStep("Working.", "tool-calls")],
      });

    await runAgentTurn(payload);

    expect(state.reportFailure).toHaveBeenCalledWith(
      "agent-turn",
      expect.objectContaining({
        name: failure.name,
        message: "Agent round failed while applying its result: round persistence unavailable",
      }),
      payload.tenant,
    );
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "partial", stopReason: "turn_error" }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.turnError");
    expect(state.writes).toContainEqual(
      expect.objectContaining({
        type: "turn_done",
        payload: expect.objectContaining({ terminalCode: "partial", stopReason: "turn_error" }),
      }),
    );
  });

  it("projects an overspend safeguard breach into persisted output and the terminal event", async () => {
    state.extendReservation.mockResolvedValueOnce({ disposition: "credit_limit" });
    state.runTools = ({ messages }) =>
      Promise.resolve({
        finishReason: "stop",
        messages,
        steps: [streamedStep("Expensive response.", "stop", 100_000)],
      });

    await runAgentTurn({
      ...payload,
      turnBudget: { ...payload.turnBudget, reservedCredits: 1, roundReserveCredits: 2 },
    });

    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        usageSettlement: expect.objectContaining({
          reservedCredits: 1,
          chargedCredits: 1,
          policyBreach: true,
        }),
      }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.policyBreach");
    expect(state.writes).toContainEqual(
      expect.objectContaining({
        type: "turn_done",
        payload: expect.objectContaining({ terminalCode: "policyBreach", stopReason: "policy_breach" }),
      }),
    );
  });

  it("persists and emits cancellation before another provider request", async () => {
    state.readCancellation.mockResolvedValueOnce(true);

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(0);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "cancelled", stopReason: "cancelled" }),
    );
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.cancelled");
    expect(state.writes).toContainEqual(
      expect.objectContaining({
        type: "turn_done",
        payload: expect.objectContaining({ terminalCode: "cancelled", stopReason: "cancelled" }),
      }),
    );
  });
});

describe("agent-turn outer failure compensation", () => {
  it("reconciles the exact admitted attempt and closes after an early exception", async () => {
    state.markProviderStarted.mockRejectedValueOnce(new Error("admission interrupted"));

    await expect(runAgentTurn(payload)).rejects.toThrow("admission interrupted");

    expect(state.reconcile).toHaveBeenCalledWith({
      turnRequestId: payload.turnRequestId,
      conversationId: payload.conversationId,
      companyId: payload.companyId,
      userId: payload.userId,
      runId: payload.runId,
    });
    expect(state.finalize).not.toHaveBeenCalled();
    expect(state.providerCalls).toBe(0);
    expect(state.close).toHaveBeenCalled();
  });

  it("does not use an empty measured settlement after provider-start was persisted", async () => {
    state.toolLoadFailure = true;

    await expect(runAgentTurn(payload)).rejects.toThrow("tool shell unavailable");

    expect(state.markProviderStarted).toHaveBeenCalled();
    expect(state.reconcile).toHaveBeenCalledTimes(1);
    expect(state.finalize).not.toHaveBeenCalled();
    expect(state.providerCalls).toBe(0);
    expect(state.close).toHaveBeenCalled();
  });

  it.each(["reconcile", "reportFailure", "close"] as const)(
    "preserves the original failure when %s throws",
    async (operation) => {
      const original = new Error("admission interrupted");
      state.markProviderStarted.mockRejectedValueOnce(original);
      state[operation].mockRejectedValueOnce(new Error("cleanup unavailable"));

      await expect(runAgentTurn(payload)).rejects.toBe(original);

      expect(state.reconcile).toHaveBeenCalledTimes(1);
      expect(state.reportFailure).toHaveBeenCalledWith("agent-turn", original, payload.tenant);
      expect(state.close).toHaveBeenCalled();
    },
  );
});

describe("agent-turn authoritative tool inputs", () => {
  function executeTool(tool: WorkflowTool, input: unknown) {
    if (!tool.execute) throw new Error("Tool cannot execute.");
    return tool.execute(input, { toolCallId: "call-1" });
  }

  function define(name: string) {
    state.definitions.push({ name, description: name, inputSchema: { type: "object" } });
  }

  function pendingMessage(toolName: string, input: unknown) {
    return { role: "assistant", content: [{ type: "tool-call", toolName, toolCallId: "call-1", input }] };
  }

  function finish() {
    return { finishReason: "stop", messages: [], steps: [] };
  }

  it("executes the normalized default-filled read input once after serialized schema reconstruction", async () => {
    define("list_users");
    const raw = { searchTerm: "Sofia" };
    const normalized = { searchTerm: "Sofia", page: 1, pageSize: 100 };
    state.normalize.mockResolvedValue({ ok: true, input: normalized });
    state.runTools = async ({ tools }) => {
      expect(await tools.list_users.needsApproval(raw, { toolCallId: "call-1" })).toBe(false);
      await executeTool(tools.list_users, raw);
      return finish();
    };

    await runAgentTurn(payload);

    expect(state.normalize).toHaveBeenCalledTimes(1);
    expect(state.normalize).toHaveBeenCalledWith("list_users", raw, 1000, { locale: payload.locale });
    expect(state.execute).toHaveBeenCalledWith(normalized, { toolCallId: "call-1", messages: [] });
    expect(state.createApproval).not.toHaveBeenCalled();
  });

  it("uses normalized action values for approval policy", async () => {
    define("manage_widgets");
    const raw = { action: " list " };
    state.normalize.mockResolvedValue({ ok: true, input: { action: "list" } });
    state.runTools = async ({ tools }) => {
      expect(await tools.manage_widgets.needsApproval(raw, { toolCallId: "call-1" })).toBe(false);
      await executeTool(tools.manage_widgets, raw);
      return finish();
    };

    await runAgentTurn(payload);

    expect(state.execute).toHaveBeenCalledWith({ action: "list" }, expect.anything());
    expect(state.createApproval).not.toHaveBeenCalled();
  });

  it("does not approve or execute invalid write input", async () => {
    define("delete_records");
    const invalid = { ok: false, result: "Validation error: missing ids" };
    state.normalize.mockResolvedValue(invalid);
    state.runTools = async ({ tools }) => {
      expect(await tools.delete_records.needsApproval({}, { toolCallId: "call-1" })).toBe(false);
      expect(await executeTool(tools.delete_records, {})).toEqual(invalid);
      return finish();
    };

    await runAgentTurn(payload);

    expect(state.normalize).toHaveBeenCalledTimes(1);
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.createApproval).not.toHaveBeenCalled();
  });

  it.each(["approve", "reject", "timeout"])(
    "preserves one normalized snapshot through approval %s",
    async (decision) => {
      define("delete_records");
      const raw = { entity: "contact", ids: ["original"] };
      const normalized = { entity: "contact", ids: ["normalized-once"] };
      state.normalize.mockResolvedValue({ ok: true, input: normalized });
      state.readApproval.mockResolvedValue(decision === "timeout" ? null : { toolName: "delete_records", decision });
      let round = 0;
      let resumed = "";
      state.runTools = async ({ tools, messages }) => {
        if (round++ === 0) {
          expect(await tools.delete_records.needsApproval(raw, { toolCallId: "call-1" })).toBe(true);
          return { finishReason: "tool-calls", messages: [pendingMessage("delete_records", raw)], steps: [] };
        }
        resumed = JSON.stringify(messages);
        expect(JSON.stringify(messages)).toContain(`"approved":${decision === "approve"}`);
        if (decision === "approve") {
          expect(await tools.delete_records.needsApproval(raw, { toolCallId: "call-1" })).toBe(true);
          await executeTool(tools.delete_records, raw);
        }
        return finish();
      };

      await runAgentTurn(payload);

      expect(state.normalize).toHaveBeenCalledTimes(1);
      expect(state.createApproval).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "turn-1:call-1",
          toolName: "delete_records",
          companyId: "company-1",
          userId: "user-1",
        }),
      );
      if (decision === "approve") expect(state.execute).toHaveBeenCalledWith(normalized, expect.anything());
      else expect(state.execute).not.toHaveBeenCalled();
      if (decision === "approve") expect(resumed).not.toContain('"reason"');
      else expect(resumed).toContain(JSON.stringify(approvalDenialReason(decision as "reject" | "timeout")));
    },
  );

  function approvedDeleteThenError(thirdSegment: () => Promise<unknown>) {
    define("delete_records");
    const input = { entity: "contact", ids: ["record-1"] };
    state.normalize.mockResolvedValue({ ok: true, input });
    state.readApproval.mockResolvedValue({ toolName: "delete_records", decision: "approve" });
    const seen: string[] = [];
    let segment = 0;
    state.runTools = async ({ tools, messages, completeStepAndPrepareNext }) => {
      segment += 1;
      seen.push(JSON.stringify(messages));
      if (segment === 1) {
        await tools.delete_records.needsApproval(input, { toolCallId: "call-1" });
        await completeStepAndPrepareNext(streamedToolCallStep("delete_records", "call-1", input));
        return { finishReason: "tool-calls", messages: [pendingMessage("delete_records", input)], steps: [] };
      }
      if (segment === 2) {
        const output = await executeTool(tools.delete_records, input);
        return {
          finishReason: "error",
          messages: [
            { role: "system", content: "instructions" },
            pendingMessage("delete_records", input),
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolName: "delete_records",
                  toolCallId: "call-1",
                  output: { type: "json", value: output },
                },
              ],
            },
          ],
          steps: [streamedStep("", "error")],
          error: new Error("Vertex said no"),
        };
      }
      return thirdSegment();
    };
    return { seen, segments: () => segment };
  }

  it("retries after an approved tool ran without resending the approval or running the tool again", async () => {
    const run = approvedDeleteThenError(() => Promise.resolve(finish()));

    await runAgentTurn(payload);

    expect(run.segments()).toBe(3);
    expect(run.seen[1]).toContain("tool-approval-response");
    expect(run.seen[2]).not.toContain("tool-approval-response");
    expect(run.seen[2]).toContain('"toolCallId":"call-1"');
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "completed", affectedResources: ["contacts"] }),
    );
  });

  it("keeps an approved write that ran as successful when the retry after it also fails", async () => {
    approvedDeleteThenError(() =>
      Promise.reject(
        Object.assign(new Error("provider unavailable"), { [Symbol.for("vercel.ai.gateway.error")]: true }),
      ),
    );

    await runAgentTurn(payload);

    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ stopReason: "provider_error", affectedResources: ["contacts"] }),
    );
  });

  function novaSearched(request: string) {
    const nova = "11111111-1111-4111-8111-111111111111";
    const nova2025 = "22222222-2222-4222-8222-222222222222";
    const messages = [
      { role: "user", content: request },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "list_records",
            toolCallId: "list-1",
            input: { entity: "deal", searchTerm: "Nova Expansion" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "list-1",
            toolName: "list_records",
            output: {
              type: "json",
              value: {
                ok: true,
                result: `total: 2\nitems[2]{id,name}:\n  ${nova},Nova Expansion\n  ${nova2025},Nova Expansion 2025`,
              },
            },
          },
        ],
      },
    ];
    return { nova, nova2025, messages };
  }

  it.each([
    ["exactly one candidate", false],
    ["both candidates", true],
  ])("refuses a gated write to %s of several same-named records only when it names one", async (_label, both) => {
    define("list_records");
    define("delete_records");
    const request = "Delete the Nova Expansion deal.";
    const { nova, nova2025, messages: searched } = novaSearched(request);
    const input = { entity: "deal", ids: both ? [nova, nova2025] : [nova] };
    state.normalize.mockImplementation((_name: string, value: unknown) => Promise.resolve({ ok: true, input: value }));
    state.readApproval.mockResolvedValue({ toolName: "delete_records", decision: "reject" });
    let gated: boolean | undefined;
    let output: unknown;
    let round = 0;
    state.runTools = async ({ tools, completeStepAndPrepareNext }) => {
      if (round++ > 0) return finish();
      await completeStepAndPrepareNext(
        streamedToolCallStep("list_records", "list-1", { entity: "deal", searchTerm: "Nova Expansion" }),
        searched,
      );
      gated = await tools.delete_records.needsApproval(input, { toolCallId: "call-1" });
      if (!gated) {
        output = await executeTool(tools.delete_records, input);
        return finish();
      }
      return {
        finishReason: "tool-calls",
        messages: [...searched.slice(1), pendingMessage("delete_records", input)],
        steps: [],
      };
    };

    await runAgentTurn({ ...payload, messages: [{ role: "user", text: request }] });

    expect(gated).toBe(both);
    if (both) expect(state.createApproval).toHaveBeenCalledTimes(1);
    else {
      expect(output).toEqual({ ok: false, result: expect.stringContaining("More than one deal matches") });
      expect(state.createApproval).not.toHaveBeenCalled();
    }
    expect(state.execute).not.toHaveBeenCalled();
  });

  it.each([
    ["chat", true],
    ["routine", false],
  ] as const)(
    "on the %s surface, refuses a write to one of several same-named records: %s",
    async (surface, refused) => {
      define("list_records");
      define("update_deals");
      const request = "Mark the Nova Expansion deal as Won.";
      const { nova, messages: searched } = novaSearched(request);
      const input = { deals: [{ id: nova }] };
      state.normalize.mockImplementation((_name: string, value: unknown) =>
        Promise.resolve({ ok: true, input: value }),
      );
      let output: unknown;
      state.runTools = async ({ tools, completeStepAndPrepareNext }) => {
        await completeStepAndPrepareNext(
          streamedToolCallStep("list_records", "list-1", { entity: "deal", searchTerm: "Nova Expansion" }),
          searched,
        );
        output = await executeTool(tools.update_deals, input);
        return finish();
      };

      await runAgentTurn({ ...payload, surface, messages: [{ role: "user", text: request }] });

      const refusal = { ok: false, result: expect.stringContaining("More than one deal matches") };
      if (refused) {
        expect(output).toEqual(refusal);
        expect(state.execute).not.toHaveBeenCalled();
      } else {
        expect(output).not.toEqual(refusal);
        expect(state.execute).toHaveBeenCalled();
      }
    },
  );

  it("keeps a same-named target armed after the read that armed it has left the context", async () => {
    define("list_records");
    define("delete_records");
    const request = "Delete the Nova Expansion deal.";
    const { nova, messages: searched } = novaSearched(request);
    const input = { entity: "deal", ids: [nova] };
    state.normalize.mockImplementation((_name: string, value: unknown) => Promise.resolve({ ok: true, input: value }));
    let gated: boolean | undefined;
    let output: unknown;
    state.runTools = async ({ tools, completeStepAndPrepareNext }) => {
      await completeStepAndPrepareNext(
        streamedToolCallStep("list_records", "list-1", { entity: "deal", searchTerm: "Nova Expansion" }),
        searched,
      );
      await completeStepAndPrepareNext(streamedStep("Checking.", "tool-calls"), [
        { role: "user", content: request },
        { role: "user", content: "Continue from where the previous output stopped." },
      ]);
      gated = await tools.delete_records.needsApproval(input, { toolCallId: "call-1" });
      output = await executeTool(tools.delete_records, input);
      return finish();
    };

    await runAgentTurn({ ...payload, messages: [{ role: "user", text: request }] });

    expect(gated).toBe(false);
    expect(output).toEqual({ ok: false, result: expect.stringContaining("More than one deal matches") });
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("widens an armed target with a later read of the same phrase instead of replacing it", async () => {
    define("list_records");
    define("delete_records");
    const request = "Delete the Nova deal.";
    const [a, b, c] = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    const read = (id: string, rows: [string, string][]) => [
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "list_records",
            toolCallId: id,
            input: { entity: "deal", searchTerm: "Nova" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: id,
            toolName: "list_records",
            output: {
              type: "json",
              value: {
                ok: true,
                result: `total: ${rows.length}\nitems[${rows.length}]{id,name}:\n${rows.map(([rowId, name]) => `  ${rowId},${name}`).join("\n")}`,
              },
            },
          },
        ],
      },
    ];
    const messages = [
      { role: "user", content: request },
      ...read("wide", [
        [a, "Nova"],
        [b, "Nova East"],
        [c, "Nova West"],
      ]),
      ...read("narrow", [
        [a, "Nova"],
        [b, "Nova East"],
      ]),
    ];
    const input = { entity: "deal", ids: [c] };
    state.normalize.mockImplementation((_name: string, value: unknown) => Promise.resolve({ ok: true, input: value }));
    let gated: boolean | undefined;
    let output: unknown;
    state.runTools = async ({ tools, completeStepAndPrepareNext }) => {
      await completeStepAndPrepareNext(streamedStep("Checking.", "tool-calls"), messages);
      gated = await tools.delete_records.needsApproval(input, { toolCallId: "call-1" });
      output = await executeTool(tools.delete_records, input);
      return finish();
    };

    await runAgentTurn({ ...payload, messages: [{ role: "user", text: request }] });

    expect(gated).toBe(false);
    expect(output).toEqual({ ok: false, result: expect.stringContaining("More than one deal matches") });
    expect(state.execute).not.toHaveBeenCalled();
  });

  it.each(["length", "error"])(
    "never replays a tool call a %s step did not run, and settles it as not run",
    async (finishReason) => {
      define("list_records");
      const seen: string[] = [];
      let segment = 0;
      state.runTools = ({ messages }) => {
        segment += 1;
        seen.push(JSON.stringify(messages));
        if (segment === 1) {
          return Promise.resolve({
            finishReason,
            messages: [{ role: "user", content: "Hello" }],
            steps: [
              {
                ...streamedStep("Partial.", finishReason),
                content: [
                  { type: "text", text: "Partial." },
                  { type: "tool-call", toolName: "list_records", toolCallId: "unrun-1", input: { entity: "deal" } },
                ],
              },
            ],
            ...(finishReason === "error" ? { error: new Error("Vertex said no") } : {}),
          });
        }
        return Promise.resolve(finish());
      };

      await runAgentTurn(payload);

      expect(segment).toBe(2);
      expect(seen[1]).not.toContain("unrun-1");
      if (finishReason === "length") expect(seen[1]).toContain("Partial.");
      expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ terminalCode: "completed" }));
      expect(state.finalize.mock.calls[0][0].parts).toContainEqual(
        expect.objectContaining({ type: "activity", id: "unrun-1", status: "cancelled" }),
      );
    },
  );

  it("tells the model an unattended run declined the approval automatically", async () => {
    define("delete_records");
    const raw = { entity: "contact", ids: ["original"] };
    state.normalize.mockResolvedValue({ ok: true, input: raw });
    state.readApproval.mockResolvedValue(null);
    let round = 0;
    let resumed = "";
    state.runTools = async ({ tools, messages }) => {
      if (round++ === 0) {
        await tools.delete_records.needsApproval(raw, { toolCallId: "call-1" });
        return { finishReason: "tool-calls", messages: [pendingMessage("delete_records", raw)], steps: [] };
      }
      resumed = JSON.stringify(messages);
      return finish();
    };

    await runAgentTurn({ ...payload, surface: "routine" });

    expect(round).toBe(2);
    expect(resumed).toContain(JSON.stringify(approvalDenialReason("timeout", "routine")));
    expect(resumed).not.toContain(JSON.stringify(approvalDenialReason("timeout")));
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("refuses a navigation to one of several same-named records and still settles the gated call beside it", async () => {
    define("list_records");
    define("navigate");
    define("delete_records");
    const nova = "11111111-1111-4111-8111-111111111111";
    const nova2025 = "22222222-2222-4222-8222-222222222222";
    const guessed = { entity: "deal", recordId: nova };
    const mutationInput = { entity: "contact", ids: ["record-1"] };
    const request = "Mark the Nova Expansion deal as Won.";
    const searched = [
      { role: "user", content: request },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "list_records",
            toolCallId: "list-1",
            input: { entity: "deal", searchTerm: "Nova Expansion" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "list-1",
            toolName: "list_records",
            output: {
              type: "json",
              value: {
                ok: true,
                result: `total: 2\nitems[2]{id,name}:\n  ${nova},Nova Expansion\n  ${nova2025},Nova Expansion 2025`,
              },
            },
          },
        ],
      },
    ];
    state.normalize.mockImplementation((_name: string, input: unknown) => Promise.resolve({ ok: true, input }));
    state.readApproval.mockResolvedValue({ toolName: "delete_records", decision: "reject" });
    let round = 0;
    let resumed = "";
    state.runTools = async ({ tools, messages, completeStepAndPrepareNext }) => {
      if (round++ === 0) {
        await completeStepAndPrepareNext(
          streamedToolCallStep("list_records", "list-1", { entity: "deal", searchTerm: "Nova Expansion" }),
          searched,
        );
        await tools.delete_records.needsApproval(mutationInput, { toolCallId: "call-1" });
        return {
          finishReason: "tool-calls",
          steps: [],
          messages: [
            ...searched.slice(1),
            {
              role: "assistant",
              content: [
                { type: "tool-call", toolName: "navigate", toolCallId: "panel-1", input: guessed },
                { type: "tool-call", toolName: "delete_records", toolCallId: "call-1", input: mutationInput },
              ],
            },
          ],
        };
      }
      resumed = JSON.stringify(messages);
      return finish();
    };

    await runAgentTurn({ ...payload, messages: [{ role: "user", text: request }] });

    expect(round).toBe(2);
    expect(state.writes.filter((event) => (event as { type: string }).type === "ui_command")).toHaveLength(0);
    expect(state.takeUiResult).not.toHaveBeenCalled();
    expect(resumed).toContain("More than one deal matches");
    expect(resumed).toContain("Nova Expansion 2025");
    expect(resumed).toContain('"approved":false');
    expect(state.createApproval).toHaveBeenCalledTimes(1);
    expect(state.execute).not.toHaveBeenCalled();
  });

  it("runs an analysis without approval and never refuses it as a write, even beside an ambiguous name", async () => {
    define("list_records");
    define("analyze_records");
    const nova = "11111111-1111-4111-8111-111111111111";
    const request = "Mark the Nova Expansion deal as Won.";
    const searched = [
      { role: "user", content: request },
      {
        role: "assistant",
        content: [
          {
            type: "tool-call",
            toolName: "list_records",
            toolCallId: "list-1",
            input: { entity: "deal", searchTerm: "Nova Expansion" },
          },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "list-1",
            toolName: "list_records",
            output: {
              type: "json",
              value: {
                ok: true,
                result: `total: 2\nitems[2]{id,name}:\n  ${nova},Nova Expansion\n  22222222-2222-4222-8222-222222222222,Nova Expansion 2025`,
              },
            },
          },
        ],
      },
    ];
    const analysis = {
      reads: [{ tool: "get_records", input: JSON.stringify({ items: [{ entity: "deal", id: nova }] }) }],
      code: "(data) => data",
    };
    state.normalize.mockImplementation((_name: string, input: unknown) => Promise.resolve({ ok: true, input }));
    let gated: boolean | undefined;
    let output: unknown;
    state.runTools = async ({ tools, completeStepAndPrepareNext }) => {
      await completeStepAndPrepareNext(
        streamedToolCallStep("list_records", "list-1", { entity: "deal", searchTerm: "Nova Expansion" }),
        searched,
      );
      gated = await tools.analyze_records.needsApproval(analysis, { toolCallId: "call-1" });
      output = await executeTool(tools.analyze_records, analysis);
      return finish();
    };

    await runAgentTurn({ ...payload, messages: [{ role: "user", text: request }] });

    expect(gated).toBe(false);
    expect(output).toEqual({ ok: true, result: "done" });
    expect(state.execute).toHaveBeenCalledTimes(1);
    expect(state.createApproval).not.toHaveBeenCalled();
  });

  it.each([true, false])("validates panel commands before emission (valid=%s)", async (valid) => {
    define("navigate");
    const raw = valid ? { targetId: " nav-contacts " } : {};
    state.normalize.mockResolvedValue(
      valid
        ? { ok: true, input: { targetId: "nav-contacts" } }
        : { ok: false, result: "Validation error: missing targetId" },
    );
    let round = 0;
    state.runTools = async ({ tools, messages }) => {
      if (round++ === 0) {
        expect(await tools.navigate.needsApproval(raw, { toolCallId: "call-1" })).toBe(false);
        expect(tools.navigate.execute).toBeUndefined();
        return { finishReason: "tool-calls", messages: [pendingMessage("navigate", raw)], steps: [] };
      }
      expect(JSON.stringify(messages)).toContain(valid ? "shown" : "Validation error: missing targetId");
      return finish();
    };

    await runAgentTurn(payload);

    const commands = state.writes.filter((event) => (event as { type: string }).type === "ui_command");
    expect(commands).toEqual(
      valid
        ? [
            {
              type: "ui_command",
              payload: { commandId: "call-1", name: "navigate", input: { targetId: "nav-contacts" } },
            },
          ]
        : [],
    );
    expect(state.normalize).toHaveBeenCalledTimes(1);
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.createApproval).not.toHaveBeenCalled();
  });

  it.each([
    [true, "approve"],
    [true, "reject"],
    [true, "cancel"],
    [false, "approve"],
    [false, "reject"],
  ])("settles mixed panel and approval calls before resuming (panel=%s, decision=%s)", async (valid, decision) => {
    define("navigate");
    define("delete_records");
    const panelInput = valid ? { targetId: "nav-contacts" } : {};
    const mutationInput = { entity: "contact", ids: ["record-1"] };
    state.normalize.mockImplementation((name: string, input: unknown) =>
      Promise.resolve(
        name === "navigate" && !valid ? { ok: false, result: "Invalid panel input" } : { ok: true, input },
      ),
    );
    state.readApproval.mockResolvedValue({ toolName: "delete_records", decision });
    let round = 0;
    state.runTools = async ({ tools, messages }) => {
      if (round++ === 0) {
        expect(await tools.navigate.needsApproval(panelInput, { toolCallId: "panel-1" })).toBe(false);
        expect(await tools.delete_records.needsApproval(mutationInput, { toolCallId: "call-1" })).toBe(true);
        if (decision === "cancel") state.readCancellation.mockResolvedValue(true);
        return {
          finishReason: "tool-calls",
          steps: [],
          messages: [
            {
              role: "assistant",
              content: [
                { type: "tool-call", toolName: "navigate", toolCallId: "panel-1", input: panelInput },
                { type: "tool-call", toolName: "delete_records", toolCallId: "call-1", input: mutationInput },
              ],
            },
          ],
        };
      }
      expect(state.createApproval).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(messages)).toContain(valid ? "shown" : "Invalid panel input");
      expect(JSON.stringify(messages)).toContain(`"approved":${decision === "approve"}`);
      if (decision === "approve") await executeTool(tools.delete_records, mutationInput);
      return finish();
    };

    await runAgentTurn(payload);

    expect(round).toBe(decision === "cancel" ? 1 : 2);
    if (decision === "cancel") {
      expect(state.createApproval).not.toHaveBeenCalled();
      expect(state.finalize).toHaveBeenCalledWith(
        expect.objectContaining({ terminalCode: "cancelled", stopReason: "cancelled" }),
      );
    }
    expect(state.normalize).toHaveBeenCalledTimes(2);
    expect(state.execute).toHaveBeenCalledTimes(decision === "approve" ? 1 : 0);
    expect(state.writes.filter((event) => (event as { type: string }).type === "ui_command")).toHaveLength(
      valid ? 1 : 0,
    );
    expect(state.reportFailure).not.toHaveBeenCalled();
  });
});

describe("routine run settlement", () => {
  it("asks for the owner's routine runs to be settled once a routine turn ends", async () => {
    state.gateResults = [true, true];

    await runAgentTurn({ ...payload, surface: "routine" });

    expect(state.dispatch).toHaveBeenCalledWith("reconcile-routine-runs", { ownerUserId: payload.userId });
  });

  it("settles the owner's routine runs even when the turn throws", async () => {
    state.gateResults = [true, true];
    state.markProviderStarted.mockRejectedValue(new Error("admission interrupted"));

    await expect(runAgentTurn({ ...payload, surface: "routine" })).rejects.toThrow("admission interrupted");

    expect(state.dispatch).toHaveBeenCalledWith("reconcile-routine-runs", { ownerUserId: payload.userId });
  });

  it("leaves a chat turn alone", async () => {
    state.gateResults = [true, true];

    await runAgentTurn(payload);

    expect(state.dispatch).not.toHaveBeenCalled();
  });

  it("never lets a failed settlement dispatch mask the turn outcome", async () => {
    state.gateResults = [true, true];
    state.dispatch.mockRejectedValue(new Error("dispatch unavailable"));

    await expect(runAgentTurn({ ...payload, surface: "routine" })).resolves.toBeUndefined();
  });
});

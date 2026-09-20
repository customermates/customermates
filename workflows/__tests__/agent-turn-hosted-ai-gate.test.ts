import { beforeEach, describe, expect, it, vi } from "vitest";

type WorkflowTool = {
  needsApproval: (input: unknown, options: { toolCallId: string }) => Promise<boolean>;
  execute?: (input: unknown, options: { toolCallId: string; messages?: unknown[] }) => Promise<unknown>;
};

type StreamOptions = {
  tools: Record<string, WorkflowTool>;
  messages: unknown[];
  completeStepAndPrepareNext: (step: unknown, messages?: unknown[]) => Promise<void>;
  executeAndCompleteTool: (toolName: string, input: unknown, toolCallId: string, batch?: unknown[]) => Promise<unknown>;
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
  maxRetries: undefined as number | undefined,
  instructions: [] as string[],
  providerContexts: [] as Array<{ system: string; messages: unknown[]; tools: unknown[]; wikiCatalog?: string | null }>,
  wikiCatalogAuthorization: vi.fn(),
  tenantCompanyId: "company-1",
  prepared: null as unknown,
  readPage: vi.fn(),
  definitions: [] as {
    name: string;
    description: string;
    inputSchema: unknown;
  }[],
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
        maxRetries?: number;
        tools: Record<string, WorkflowTool>;
      },
    ) {
      state.providerOptions = options.providerOptions;
      state.maxRetries = options.maxRetries;
      state.instructions.push(options.instructions);
    }

    async stream({ messages }: { messages: unknown[] }) {
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
            state.prepared = await this.options.prepareStep({ messages: preparedMessages(nextMessages) });
            state.providerCalls += 1;
          },
          executeAndCompleteTool: async (toolName, input, toolCallId, batch) => {
            const tool = this.options.tools[toolName];
            if (!tool?.execute) throw new Error(`Tool ${toolName} cannot execute.`);
            const output = await tool.execute(input, {
              toolCallId,
              messages: batch ?? [{ role: "assistant", content: [{ type: "tool-call", toolName, toolCallId, input }] }],
            });
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
vi.mock("@/core/decorators/tenant-context", () => ({
  getTenantUser: () => ({ companyId: state.tenantCompanyId }),
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
  getGetWikiCatalogInteractor: () => ({ invoke: state.wikiCatalogAuthorization }),
}));

vi.mock("@/ee/agent-chat/agent-tools", () => ({
  getAgentAiToolDefinitions: () => {
    if (state.toolLoadFailure) throw new Error("tool shell unavailable");
    return state.definitions;
  },
  getAgentAiTools: (deps: { runInCallerContext: (run: () => Promise<unknown>) => Promise<unknown> }) =>
    Object.fromEntries(
      state.definitions.map(({ name }) => [
        name,
        {
          execute: (input: unknown, options: unknown) => deps.runInCallerContext(() => state.execute(input, options)),
        },
      ]),
    ),
  normalizeAgentAiToolInput: state.normalize,
}));
vi.mock("@/ee/agent-chat/public-page-reader", () => ({ readPublicPage: state.readPage }));
vi.mock("@/features/mcp-tools/tool-registry", () => ({
  ALL_MCP_TOOLS: [
    { name: "list_users", annotations: { readOnlyHint: true } },
    { name: "manage_widgets", annotations: { readOnlyHint: false } },
    { name: "manage_wiki_pages", annotations: { readOnlyHint: false } },
    { name: "delete_records", annotations: { readOnlyHint: false } },
  ],
}));
vi.mock("@/ee/agent-chat/system-prompt", () => ({ buildAgentSystemPrompt: () => "system" }));
vi.mock("@/ee/agent-chat/agent-provider-context", () => ({
  buildAgentProviderContext: (system: string, messages: unknown[], tools: unknown[], wikiCatalog?: string | null) => {
    state.providerContexts.push({ system, messages, tools, wikiCatalog });
    return { messages, system, tools };
  },
  isAgentStepContextWithinBudget: (...args: unknown[]) => state.contextFits(...args),
}));
vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () => Promise.resolve((key: string) => `localized:${key}`),
}));
vi.mock("@/i18n/locale-registry", () => ({ appLocaleOrDefault: (locale: string) => locale }));
vi.mock("../capture-failure", () => ({
  reportFailure: state.reportFailure,
  toWorkflowFailure: (error: unknown) => error,
}));

import { runAgentTurn, type AgentTurnWorkflowPayload } from "../agent-turn";

const payload: AgentTurnWorkflowPayload = {
  turnRequestId: "turn-1",
  conversationId: "conversation-1",
  runId: "run-1",
  companyId: "company-1",
  userId: "user-1",
  userName: "Test User",
  locale: "en",
  appBaseUrl: "http://localhost:4000",
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
  state.maxRetries = undefined;
  state.instructions = [];
  state.providerContexts = [];
  state.tenantCompanyId = "company-1";
  state.wikiCatalogAuthorization.mockReset().mockResolvedValue({ ok: true, data: {} });
  state.prepared = null;
  state.readPage.mockReset().mockResolvedValue({
    ok: true,
    url: "https://example.com/",
    title: "Example",
    text: "Useful information",
    links: [],
    truncated: false,
  });
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
  it.each(["chat", "routine"] as const)(
    "passes the exact durable AGENTS.md snapshot into the first %s provider request",
    async (surface) => {
      const wikiCatalog = JSON.stringify({
        wiki: {
          agentsMd: { title: "AGENTS.md", markdownChunk: "Read Voice first." },
          items: [],
        },
      });
      state.runTools = ({ messages }) =>
        Promise.resolve({ finishReason: "stop", messages, steps: [streamedStep("Done.", "stop")] });

      await runAgentTurn({ ...payload, surface, wikiCatalog });

      expect(state.wikiCatalogAuthorization).toHaveBeenCalledExactlyOnceWith({ page: 1 });
      expect(state.providerContexts[0]?.wikiCatalog).toBe(wikiCatalog);
      expect(state.providerContexts[0]?.system).toBe("system");
    },
  );

  it("stops before the provider and tools if the user moved to another company before execution", async () => {
    state.tenantCompanyId = "company-2";
    state.runTools = ({ messages }) =>
      Promise.resolve({ finishReason: "stop", messages, steps: [streamedStep("Done.", "stop")] });

    await runAgentTurn({ ...payload, wikiCatalog: "old-tenant AGENTS.md" });

    expect(state.markProviderStarted).not.toHaveBeenCalled();
    expect(state.wikiCatalogAuthorization).not.toHaveBeenCalled();
    expect(state.providerCalls).toBe(0);
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({ usageSettlement: null, stopReason: "hosted_ai_unavailable" }),
    );
  });

  it("denies a local tool if the user moves companies after the provider starts", async () => {
    state.definitions = [{ name: "manage_wiki_pages", description: "Wiki", inputSchema: {} }];
    let denied: unknown;
    state.runTools = async ({ executeAndCompleteTool, messages }) => {
      state.tenantCompanyId = "company-2";
      try {
        await executeAndCompleteTool("manage_wiki_pages", { action: "get", id: "page-1" }, "call-1");
      } catch (error) {
        denied = error;
      }
      return { finishReason: "stop", messages, steps: [streamedStep("Stopped.", "stop")] };
    };

    await runAgentTurn(payload);

    expect(denied).toBeInstanceOf(Error);
    expect((denied as Error).message).toMatch(/^Agent tenant changed/u);
    expect(state.execute).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "disables opaque model retries only for native search (enabled=%s)",
    async (webSearchEnabled) => {
      state.gateResults = [true, false];
      await runAgentTurn({ ...payload, webSearchEnabled });
      expect(state.maxRetries).toBe(webSearchEnabled ? 0 : undefined);
    },
  );

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
      },
      openai: { parallelToolCalls: false, store: false },
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

  it.each(["tool-result", "tool-error"])(
    "settles native %s telemetry before a local read and preserves it through continuation compaction",
    async (nativeType) => {
      state.contextFits.mockImplementation((context: unknown, stepMessages: unknown, maxBytes: unknown) => {
        if (typeof maxBytes !== "number") return false;
        return (
          new TextEncoder().encode(
            JSON.stringify({
              ...(context as object),
              messages: stepMessages,
            }),
          ).byteLength <= maxBytes
        );
      });
      state.definitions.push({
        name: "list_users",
        description: "list_users",
        inputSchema: { type: "object" },
      });
      state.normalize.mockResolvedValue({ ok: true, input: { page: 1 } });
      state.execute.mockResolvedValue({
        ok: true,
        result: `read:${"y".repeat(4_000)}`,
      });
      const nativePayload = {
        results: [{ snippet: `native:${"x".repeat(1_000)}` }],
      };
      const nativeCall = {
        type: "tool-call",
        toolName: "web_search",
        toolCallId: "web-1",
        input: { query: "public company information" },
        providerExecuted: true,
      };
      const nativeOutcome = {
        type: nativeType,
        toolName: "web_search",
        toolCallId: "web-1",
        providerExecuted: true,
        ...(nativeType === "tool-error" ? { error: nativePayload } : { output: nativePayload }),
      };
      const nativeStep = { ...streamedStep("", "tool-calls"), content: [nativeCall, nativeOutcome, nativeOutcome] };
      const seenMessages: unknown[][] = [];
      state.runTools = async ({ messages, completeStepAndPrepareNext, executeAndCompleteTool }) => {
        seenMessages.push(messages);
        if (seenMessages.length === 1) {
          const nativeMessages = [
            ...messages,
            { role: "assistant", content: [nativeCall] },
            {
              role: "tool",
              content: [
                {
                  type: "tool-result",
                  toolName: "web_search",
                  toolCallId: "web-1",
                  output: { type: nativeType === "tool-error" ? "error-json" : "json", value: nativePayload },
                },
              ],
            },
          ];
          await completeStepAndPrepareNext(nativeStep, nativeMessages);
          const output = await executeAndCompleteTool("list_users", { page: 1 }, "read-1");
          const localStep = streamedToolCallStep("list_users", "read-1", { page: 1 });
          return {
            finishReason: "tool-calls",
            messages: [
              ...nativeMessages,
              { role: "assistant", content: localStep.content },
              {
                role: "tool",
                content: [
                  {
                    type: "tool-result",
                    toolName: "list_users",
                    toolCallId: "read-1",
                    output: { type: "json", value: output },
                  },
                ],
              },
            ],
            steps: [nativeStep, localStep],
          };
        }
        return { finishReason: "stop", messages, steps: [streamedStep("Done.", "stop")] };
      };

      await runAgentTurn({ ...payload, turnBudget: { ...payload.turnBudget, maxContextBytes: 3_500 } });

      expect(state.providerCalls).toBe(3);
      expect(state.recordRound).toHaveBeenCalledTimes(3);
      expect(state.execute).toHaveBeenCalledOnce();
      expect(state.createApproval).not.toHaveBeenCalled();
      expect(state.instructions[1]).toContain('"completedSteps":2');
      expect(state.instructions[1]).toContain(`"successfulActivities":${nativeType === "tool-error" ? 1 : 2}`);
      expect(state.instructions[1]).toContain(`"errors":${nativeType === "tool-error" ? 1 : 0}`);
      expect(state.instructions[1]).toContain('"toolName":"web_search"');
      expect(JSON.stringify(seenMessages[1])).not.toContain("web-1");
      expect(JSON.stringify(seenMessages[1])).not.toContain(nativePayload.results[0].snippet);
      expect(JSON.stringify(seenMessages[1])).not.toContain("read-1");
      expect(state.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          terminalCode: "completed",
          stopReason: null,
          parts: expect.arrayContaining([
            expect.objectContaining({
              id: "web-1",
              status: nativeType === "tool-error" ? "error" : "done",
            }),
            expect.objectContaining({ id: "read-1", status: "done" }),
          ]),
        }),
      );
    },
  );

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

    expect(state.reportFailure).toHaveBeenCalledWith("agent-turn", failure, payload.tenant);
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
    expect(state.normalize).toHaveBeenCalledWith("list_users", raw, 1000, {
      wikiHomepageSetup: false,
      webSearchEnabled: undefined,
      surface: undefined,
    });
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
      state.runTools = async ({ tools, messages }) => {
        if (round++ === 0) {
          expect(await tools.delete_records.needsApproval(raw, { toolCallId: "call-1" })).toBe(true);
          return { finishReason: "tool-calls", messages: [pendingMessage("delete_records", raw)], steps: [] };
        }
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
    },
  );

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

describe("routine browse-or-mutate batch safety", () => {
  const read = { url: "https://example.com/" };
  const write = { action: "create", pages: [{ title: "Tone", markdown: "Be clear." }] };
  const call = (toolName: string, toolCallId: string, input: unknown) => ({
    type: "tool-call",
    toolName,
    toolCallId,
    input,
  });
  const finish = () => ({ finishReason: "stop", messages: [], steps: [] });

  beforeEach(() => {
    state.definitions = ["read_public_page", "manage_wiki_pages", "list_users"].map((name) => ({
      name,
      description: name,
      inputSchema: { type: "object" },
    }));
    state.normalize.mockImplementation((_name, input) => Promise.resolve({ ok: true, input }));
  });

  it.each(["web-first", "write-first", "parallel"])("denies mutation for the complete %s web batch", async (order) => {
    state.runTools = async ({ executeAndCompleteTool }) => {
      const calls = [call("read_public_page", "read-1", read), call("manage_wiki_pages", "write-1", write)];
      if (order === "write-first") calls.reverse();
      const batch = [{ role: "assistant", content: calls }];
      const results =
        order === "parallel"
          ? await Promise.all(
              calls.map((item) => executeAndCompleteTool(item.toolName, item.input, item.toolCallId, batch)),
            )
          : await calls.reduce(
              async (prior, item) => [
                ...(await prior),
                await executeAndCompleteTool(item.toolName, item.input, item.toolCallId, batch),
              ],
              Promise.resolve([] as unknown[]),
            );
      expect(results).toContainEqual(expect.objectContaining({ ok: false }));
      return finish();
    };
    await runAgentTurn({ ...payload, surface: "routine" });
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.readPage).toHaveBeenCalledOnce();
  });

  it("keeps a successful browse boundary across later steps, while Wiki reads remain available", async () => {
    state.runTools = async ({ executeAndCompleteTool, completeStepAndPrepareNext }) => {
      await executeAndCompleteTool("read_public_page", read, "read-1");
      await completeStepAndPrepareNext(streamedStep("", "tool-calls"));
      expect(await executeAndCompleteTool("manage_wiki_pages", write, "write-1")).toMatchObject({ ok: false });
      expect(await executeAndCompleteTool("manage_wiki_pages", { action: "get", id: "page-1" }, "get-1")).toMatchObject(
        { ok: true },
      );
      return finish();
    };
    await runAgentTurn({ ...payload, surface: "routine" });
    expect(state.execute).toHaveBeenCalledOnce();
    expect(state.execute.mock.calls[0][0]).toMatchObject({ action: "get" });
  });

  const nativeSearchStep = (failed = false) => ({
    ...streamedStep("Homepage evidence.", "length"),
    content: [
      {
        type: "tool-call",
        toolName: "web_search",
        toolCallId: "web-1",
        input: {},
        providerExecuted: true,
      },
      {
        type: "tool-result",
        toolName: "web_search",
        toolCallId: "web-1",
        input: {},
        providerExecuted: true,
        output: failed
          ? { error: "timeout", message: "Search timed out" }
          : {
              results: [{ url: "https://example.com/current", snippet: "Evidence" }],
            },
      },
      { type: "text", text: "Homepage evidence." },
    ],
    providerMetadata: {
      gateway: {
        routing: {
          finalProvider: "vertex",
          modelAttempts: [
            {
              providerAttempts: [{ provider: "vertex", credentialType: "system", success: true }],
            },
          ],
        },
        gatewayCost: "0.00580279",
        cost: "0.00570279",
        inferenceCost: "0.00070279",
        surchargeCost: "0.0001",
        gatewayToolCalls: { perplexity_search: 1 },
      },
    },
  });

  it.each([false, true])(
    "preserves native browsing across a length continuation and allows a later mutation only after failure (failed=%s)",
    async (failed) => {
      let segment = 0;
      state.runTools = async ({ messages, executeAndCompleteTool }) => {
        if (segment++ === 0) {
          return {
            finishReason: "length",
            messages,
            steps: [nativeSearchStep(failed)],
          };
        }
        expect(await executeAndCompleteTool("manage_wiki_pages", write, "write-1")).toMatchObject({ ok: failed });
        return finish();
      };
      await runAgentTurn({
        ...payload,
        surface: "routine",
        webSearchEnabled: true,
      });
      expect(state.providerCalls).toBe(2);
      expect(state.execute).toHaveBeenCalledTimes(failed ? 1 : 0);
      expect(state.recordRound).toHaveBeenCalledWith(expect.objectContaining({ costMicrocents: 580_279 }));
      expect(state.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          usageSettlement: expect.objectContaining({
            costMicrocents: 580_279,
            costSource: "measured",
          }),
        }),
      );
      const parts = JSON.stringify(state.finalize.mock.calls[0][0].parts);
      expect(parts).toContain(`"status":"${failed ? "error" : "done"}"`);
      if (!failed) expect(parts).toContain("https://example.com/current");
      expect(state.createApproval).not.toHaveBeenCalled();
    },
  );

  it("settles completed native search before cooperative cancellation without starting another request", async () => {
    state.readCancellation.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    state.runTools = async ({ messages, completeStepAndPrepareNext }) => {
      await completeStepAndPrepareNext(nativeSearchStep(), messages);
      throw new Error("unreachable");
    };
    await runAgentTurn({
      ...payload,
      surface: "routine",
      webSearchEnabled: true,
    });
    expect(state.providerCalls).toBe(1);
    expect(state.execute).not.toHaveBeenCalled();
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalCode: "cancelled",
        stopReason: "cancelled",
        usageSettlement: expect.objectContaining({
          costMicrocents: 580_279,
          costSource: "measured",
        }),
      }),
    );
    expect(state.recordRound).toHaveBeenCalledOnce();
    expect(state.extendReservation).not.toHaveBeenCalled();
    expect(JSON.stringify(state.finalize.mock.calls[0][0].parts)).toContain("https://example.com/current");
  });

  it.each(["chat", "routine"] as const)(
    "keeps measured Search charges when a later %s round lacks cost metadata",
    async (surface) => {
      const search = nativeSearchStep();
      search.providerMetadata.gateway.gatewayCost = "0.01080279";
      search.providerMetadata.gateway.cost = "0.01070279";
      search.providerMetadata.gateway.gatewayToolCalls.perplexity_search = 2;
      let segment = 0;
      state.runTools = ({ messages }) =>
        Promise.resolve({
          finishReason: segment === 0 ? "length" : "stop",
          messages,
          steps: [segment++ === 0 ? search : streamedStep("Answer.", "stop")],
        });

      await runAgentTurn({ ...payload, surface, webSearchEnabled: true });

      expect(state.providerCalls).toBe(2);
      const persistedCost = state.recordRound.mock.calls.reduce((total, [round]) => total + round.costMicrocents, 0);
      expect(persistedCost).toBeGreaterThan(1_080_279);
      expect(state.finalize).toHaveBeenCalledWith(
        expect.objectContaining({
          usageSettlement: expect.objectContaining({
            costMicrocents: persistedCost,
            costSource: "estimated",
            chargedCredits: 2,
            policyBreach: false,
          }),
        }),
      );
    },
  );

  it("denies a failed browse batch but permits a later mutation after failure is established", async () => {
    state.readPage.mockResolvedValue({ ok: false, reason: "network_failure" });
    state.runTools = async ({ executeAndCompleteTool, completeStepAndPrepareNext }) => {
      const batch = [
        {
          role: "assistant",
          content: [call("read_public_page", "read-1", read), call("manage_wiki_pages", "write-1", write)],
        },
      ];
      await executeAndCompleteTool("read_public_page", read, "read-1", batch);
      expect(await executeAndCompleteTool("manage_wiki_pages", write, "write-1", batch)).toMatchObject({ ok: false });
      await completeStepAndPrepareNext(streamedStep("", "tool-calls"));
      expect(await executeAndCompleteTool("manage_wiki_pages", write, "write-2")).toMatchObject({ ok: true });
      return finish();
    };
    await runAgentTurn({ ...payload, surface: "routine" });
    expect(state.execute).toHaveBeenCalledOnce();
  });

  it("removes web tools before the next provider request after a successful mutation and denies direct reads", async () => {
    state.runTools = async ({ executeAndCompleteTool, completeStepAndPrepareNext }) => {
      expect(await executeAndCompleteTool("manage_wiki_pages", write, "write-1")).toMatchObject({ ok: true });
      await completeStepAndPrepareNext(streamedStep("", "tool-calls"));
      expect(state.prepared).toEqual({ activeTools: ["manage_wiki_pages", "list_users"] });
      expect(await executeAndCompleteTool("read_public_page", read, "read-1")).toMatchObject({ ok: false });
      return finish();
    };
    await runAgentTurn({ ...payload, surface: "routine" });
    expect(state.readPage).not.toHaveBeenCalled();
  });

  it("does not apply the routine mutation boundary to ordinary chat", async () => {
    state.runTools = async ({ executeAndCompleteTool }) => {
      await executeAndCompleteTool("read_public_page", read, "read-1");
      expect(await executeAndCompleteTool("manage_wiki_pages", write, "write-1")).toMatchObject({ ok: true });
      return finish();
    };
    await runAgentTurn(payload);
    expect(state.execute).toHaveBeenCalledOnce();
    expect(JSON.stringify(state.finalize.mock.calls[0][0].parts)).toContain("https://example.com/");
  });

  it("does not create setup pages before a usable homepage read", async () => {
    state.runTools = async ({ executeAndCompleteTool }) => {
      expect(await executeAndCompleteTool("manage_wiki_pages", write, "write-1")).toMatchObject({ ok: false });
      return finish();
    };
    await runAgentTurn({
      ...payload,
      wikiHomepageSetup: { url: "https://example.com/", registrableDomain: "example.com" },
    });
    expect(state.execute).not.toHaveBeenCalled();
  });
});

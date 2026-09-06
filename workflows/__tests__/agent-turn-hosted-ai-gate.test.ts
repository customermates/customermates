import { beforeEach, describe, expect, it, vi } from "vitest";

type WorkflowTool = {
  needsApproval: (input: unknown, options: { toolCallId: string }) => Promise<boolean>;
  execute?: (input: unknown, options: { toolCallId: string }) => Promise<unknown>;
};

type StreamOptions = { tools: Record<string, WorkflowTool>; messages: unknown[] };

const state = vi.hoisted(() => ({
  gateResults: [] as boolean[],
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
}));

vi.mock("@ai-sdk/workflow", () => ({
  WorkflowAgent: class {
    constructor(
      private readonly options: {
        prepareStep: () => Promise<unknown>;
        providerOptions: unknown;
        tools: Record<string, WorkflowTool>;
      },
    ) {
      state.providerOptions = options.providerOptions;
    }

    async stream({ messages }: { messages: unknown[] }) {
      if (state.runTools) return state.runTools({ tools: this.options.tools, messages });
      await this.options.prepareStep();
      state.providerCalls += 1;

      await this.options.prepareStep();
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
    canStartNextHostedAiProviderRoundUnscoped: vi.fn(() => Promise.resolve(state.gateResults.shift() ?? false)),
    finalizeAgentTurnOrThrowUnscoped: state.finalize,
    reconcileInterruptedAgentTurnUnscoped: state.reconcile,
    isAgentTurnCancellationRequestedUnscoped: state.readCancellation,
    markAgentTurnProviderStartedUnscoped: state.markProviderStarted,
    extendAgentRunLeaseForSuspensionUnscoped: vi.fn().mockResolvedValue(undefined),
    createPendingApprovalRequestOrThrowUnscoped: state.createApproval,
    findApprovalDecisionUnscoped: state.readApproval,
    discardPendingApprovalRequestUnscoped: vi.fn().mockResolvedValue(undefined),
    takeUiCommandResultUnscoped: state.takeUiResult,
  }),
}));

vi.mock("@/ee/agent-chat/agent-tools", () => ({
  getAgentAiToolDefinitions: () => {
    if (state.toolLoadFailure) throw new Error("tool shell unavailable");
    return state.definitions;
  },
  getAgentAiTools: () => Object.fromEntries(state.definitions.map(({ name }) => [name, { execute: state.execute }])),
  normalizeAgentAiToolInput: state.normalize,
}));
vi.mock("@/features/mcp-tools/tool-registry", () => ({
  ALL_MCP_TOOLS: [
    { name: "list_users", annotations: { readOnlyHint: true } },
    { name: "manage_widgets", annotations: { readOnlyHint: false } },
    { name: "delete_records", annotations: { readOnlyHint: false } },
  ],
}));
vi.mock("@/ee/agent-chat/system-prompt", () => ({ buildAgentSystemPrompt: () => "system" }));
vi.mock("@/ee/agent-chat/agent-provider-context", () => ({
  buildAgentProviderContext: (_system: string, messages: unknown[]) => ({ messages }),
  isAgentStepContextWithinBudget: () => true,
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
    modelSpec: "openai/gpt-5-nano",
    servingProvider: "openai",
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
  state.reconcile.mockReset().mockResolvedValue({ reconciled: true });
  state.close.mockReset().mockResolvedValue(undefined);
  state.reportFailure.mockReset().mockResolvedValue(undefined);
  state.markProviderStarted.mockReset().mockResolvedValue(true);
  state.finalize.mockReset().mockImplementation((args) =>
    Promise.resolve({
      assistantMessage: { id: "assistant-1" },
      terminalCode: args.terminalCode,
      affectedResources: args.affectedResources,
      chargedCredits: 0,
    }),
  );
});

describe("agent-turn hosted-AI provider gates", () => {
  it("makes no provider call when the provider-start admission is rejected", async () => {
    state.markProviderStarted.mockResolvedValueOnce(false);

    await runAgentTurn(payload);

    expect(state.providerCalls).toBe(0);
    expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ usageSettlement: null }));
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
        zeroDataRetention: true,
        disallowPromptTraining: true,
      },
      openai: { parallelToolCalls: false },
    });
    expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ terminalCode: "partial" }));
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.hostedAiUnavailable");
    expect(JSON.stringify(state.writes)).not.toMatch(/operator_paused|global_spend_cap/u);
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
    expect(state.normalize).toHaveBeenCalledWith("list_users", raw, 1000);
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
      expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ terminalCode: "cancelled" }));
    }
    expect(state.normalize).toHaveBeenCalledTimes(2);
    expect(state.execute).toHaveBeenCalledTimes(decision === "approve" ? 1 : 0);
    expect(state.writes.filter((event) => (event as { type: string }).type === "ui_command")).toHaveLength(
      valid ? 1 : 0,
    );
    expect(state.reportFailure).not.toHaveBeenCalled();
  });
});

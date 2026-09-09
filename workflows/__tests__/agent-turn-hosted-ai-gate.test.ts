import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  gateResults: [] as boolean[],
  providerCalls: 0,
  agentOptions: [] as Record<string, unknown>[],
  toolDefinitions: [] as Record<string, unknown>[],
  messages: [] as unknown[],
  steps: [] as unknown[],
  writes: [] as unknown[],
  markProviderStarted: vi.fn<() => Promise<boolean>>(),
  finalize: vi.fn(),
}));

vi.mock("@ai-sdk/workflow", () => ({
  WorkflowAgent: class {
    constructor(
      private readonly options: {
        prepareStep: () => Promise<unknown>;
      },
    ) {
      state.agentOptions.push(options as unknown as Record<string, unknown>);
    }

    async stream() {
      await this.options.prepareStep();
      state.providerCalls += 1;

      await this.options.prepareStep();
      state.providerCalls += 1;

      return {
        finishReason: "stop",
        messages: state.messages,
        steps: state.steps,
      };
    }
  },
}));

vi.mock("workflow", () => ({
  createHook: () => ({ dispose: vi.fn() }),
  getWritable: () => ({
    close: vi.fn().mockResolvedValue(undefined),
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
  tool: (definition: unknown) => definition,
}));

vi.mock("@/core/decorators/background-tenant", () => ({
  runAsBackgroundTenant: (_userId: string, run: () => unknown) => Promise.resolve(run()),
}));

vi.mock("@/core/di", () => ({
  getAgentChatRepo: () => ({
    canStartNextHostedAiProviderRoundUnscoped: vi.fn(() => Promise.resolve(state.gateResults.shift() ?? false)),
    finalizeAgentTurnOrThrowUnscoped: state.finalize,
    heartbeatAgentRunUnscoped: vi.fn().mockResolvedValue(true),
    isAgentTurnCancellationRequestedUnscoped: vi.fn().mockResolvedValue(false),
    markAgentTurnProviderStartedUnscoped: state.markProviderStarted,
    recordAgentRunRoundUnscoped: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/ee/agent-chat/agent-tools", () => ({
  getAgentAiToolDefinitions: () => state.toolDefinitions,
  getAgentAiTools: () => ({}),
}));
vi.mock("@/features/mcp-tools/tool-registry", () => ({ ALL_MCP_TOOLS: [] }));
vi.mock("@/ee/agent-chat/system-prompt", () => ({
  buildAgentSystemPrompt: () => "system",
}));
vi.mock("@/ee/agent-chat/agent-provider-context", () => ({
  buildAgentProviderContext: (_system: string, messages: unknown[]) => ({
    messages,
  }),
  isAgentStepContextWithinBudget: () => true,
}));
vi.mock("@/i18n/get-translator", () => ({
  getTranslator: () => Promise.resolve((key: string) => `localized:${key}`),
}));
vi.mock("@/i18n/locale-registry", () => ({
  appLocaleOrDefault: (locale: string) => locale,
}));
vi.mock("../capture-failure", () => ({
  reportFailure: vi.fn().mockResolvedValue(undefined),
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
    servingProvider: "azure",
    reservedCredits: 10,
    roundReserveCredits: 2,
    maxOutputTokens: 100,
    maxContextTokens: 8_000,
    maxContextBytes: 32_000,
    maxToolResultChars: 1_000,
    webSearchEnabled: true,
  },
  tenant: { userId: "user-1", companyId: "company-1" },
};

function measuredAzureProviderMetadata(cost: unknown = "0.000041") {
  return {
    gateway: {
      routing: {
        finalProvider: "azure",
        modelAttempts: [
          {
            providerAttempts: [{ provider: "azure", credentialType: "system", success: true }],
          },
        ],
      },
      cost,
    },
  };
}

beforeEach(() => {
  state.gateResults = [];
  state.providerCalls = 0;
  state.agentOptions = [];
  state.toolDefinitions = [];
  state.messages = [];
  state.steps = [];
  state.writes = [];
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
    expect(state.finalize).toHaveBeenCalledWith(expect.objectContaining({ terminalCode: "partial" }));
    expect(JSON.stringify(state.writes)).toContain("localized:AgentChat.runner.hostedAiUnavailable");
    expect(JSON.stringify(state.writes)).not.toMatch(/operator_paused|global_spend_cap/u);
  });

  it("reconstructs native web search with its provider metadata and pins Azure with ZDR", async () => {
    state.gateResults = [true, true];
    state.toolDefinitions = [
      {
        name: "web_search",
        description: undefined,
        inputSchema: {},
        type: "provider",
        isProviderExecuted: true,
        id: "openai.web_search",
        args: { externalWebAccess: true, searchContextSize: "low" },
      },
    ];

    await runAgentTurn(payload);

    expect(state.agentOptions).toHaveLength(1);
    expect(state.agentOptions[0]).toMatchObject({
      tools: {
        web_search: {
          type: "provider",
          isProviderExecuted: true,
          id: "openai.web_search",
          args: { externalWebAccess: true, searchContextSize: "low" },
        },
      },
      providerOptions: {
        gateway: {
          only: ["azure"],
          zeroDataRetention: true,
          disallowPromptTraining: true,
        },
        openai: { parallelToolCalls: false, store: false, maxToolCalls: 1 },
      },
    });
  });

  it.each([
    ["missing", {}, "the gateway reported no cost metadata"],
    ["unreadable", measuredAzureProviderMetadata("not-a-cost"), "the gateway reported no usable cost figure"],
  ])("fails closed when a native web-search round has %s Gateway cost metadata", async (_case, metadata, reason) => {
    state.gateResults = [true, true];
    state.toolDefinitions = [
      {
        name: "web_search",
        description: undefined,
        inputSchema: {},
        type: "provider",
        isProviderExecuted: true,
        id: "openai.web_search",
        args: { externalWebAccess: true, searchContextSize: "low" },
      },
    ];
    state.steps = [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            providerExecuted: true,
          },
          {
            type: "tool-result",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            output: {
              action: { type: "search", queries: ["current answer"] },
              sources: [],
            },
            providerExecuted: true,
          },
        ],
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            output: {
              action: { type: "search", queries: ["current answer"] },
              sources: [],
            },
            providerExecuted: true,
          },
        ],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        providerMetadata: metadata,
      },
    ];

    await expect(runAgentTurn(payload)).rejects.toThrow(
      `Native web search requires authoritative Gateway cost metadata: ${reason}.`,
    );
    expect(state.finalize).not.toHaveBeenCalled();
  });

  it("preserves estimated-cost settlement for a round that did not use native web search", async () => {
    state.gateResults = [true, true];
    state.steps = [
      {
        content: [{ type: "text", text: "A plain answer." }],
        toolResults: [],
        finishReason: "stop",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        providerMetadata: {},
      },
    ];

    await runAgentTurn(payload);

    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        usageSettlement: expect.objectContaining({ costSource: "estimated" }),
      }),
    );
  });

  it("streams and persists the canonical HTTPS source footer", async () => {
    state.gateResults = [true, true];
    state.toolDefinitions = [
      {
        name: "web_search",
        description: undefined,
        inputSchema: {},
        type: "provider",
        isProviderExecuted: true,
        id: "openai.web_search",
        args: { externalWebAccess: true, searchContextSize: "low" },
      },
    ];
    state.messages = [
      {
        role: "assistant",
        content: [{ type: "text", text: "A current answer." }],
      },
    ];
    state.steps = [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            providerExecuted: true,
          },
          { type: "text", text: "A current answer." },
          {
            type: "source",
            sourceType: "url",
            id: "source-1",
            url: "https://example.com/current#section",
          },
          {
            type: "tool-result",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            output: {
              action: { type: "search", queries: ["current answer"] },
              sources: [{ type: "url", url: "https://example.com/current#section" }],
            },
            providerExecuted: true,
          },
        ],
        toolResults: [
          {
            type: "tool-result",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            output: {
              action: { type: "search", queries: ["current answer"] },
              sources: [{ type: "url", url: "https://example.com/current#section" }],
            },
            providerExecuted: true,
          },
        ],
        finishReason: "stop",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        providerMetadata: measuredAzureProviderMetadata(),
      },
    ];

    await runAgentTurn(payload);

    const footer = "\n\n### Sources\n- <https://example.com/current>";
    expect(JSON.stringify(state.writes)).toContain(footer.replaceAll("\n", "\\n"));
    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "text",
            text: expect.stringContaining(footer),
          }),
          expect.objectContaining({
            type: "activity",
            id: "web-1",
            status: "done",
          }),
        ]),
        usageSettlement: expect.objectContaining({
          costMicrocents: 4_100,
          costSource: "measured",
        }),
      }),
    );
  });

  it("settles a failed provider tool from its real result envelope without adding sources", async () => {
    state.gateResults = [true, true];
    state.toolDefinitions = [
      {
        name: "web_search",
        description: undefined,
        inputSchema: {},
        type: "provider",
        isProviderExecuted: true,
        id: "openai.web_search",
        args: { externalWebAccess: true, searchContextSize: "low" },
      },
    ];
    state.messages = [];
    state.steps = [
      {
        content: [
          {
            type: "tool-call",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            providerExecuted: true,
          },
          {
            type: "tool-error",
            toolCallId: "web-1",
            toolName: "web_search",
            input: {},
            error: {
              message: "Search failed",
              sources: [{ type: "url", url: "https://example.com/must-not-appear" }],
            },
            providerExecuted: true,
          },
        ],
        toolResults: [],
        finishReason: "stop",
        usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
        providerMetadata: measuredAzureProviderMetadata(),
      },
    ];

    await runAgentTurn(payload);

    expect(state.finalize).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "web-1",
            status: "error",
          }),
        ]),
      }),
    );
    expect(JSON.stringify(state.writes)).not.toContain("must-not-appear");
    expect(JSON.stringify(state.writes)).not.toContain("### Sources");
  });
});

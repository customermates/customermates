import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  gateResults: [] as boolean[],
  providerCalls: 0,
  writes: [] as unknown[],
  markProviderStarted: vi.fn<() => Promise<void>>(),
  finalize: vi.fn(),
}));

vi.mock("@ai-sdk/workflow", () => ({
  WorkflowAgent: class {
    constructor(
      private readonly options: {
        prepareStep: () => Promise<unknown>;
      },
    ) {}

    async stream() {
      await this.options.prepareStep();
      state.providerCalls += 1;

      await this.options.prepareStep();
      state.providerCalls += 1;

      return { finishReason: "stop", messages: [], steps: [] };
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
}));

vi.mock("@/core/decorators/background-tenant", () => ({
  runAsBackgroundTenant: (_userId: string, run: () => unknown) => Promise.resolve(run()),
}));

vi.mock("@/core/di", () => ({
  getAgentChatRepo: () => ({
    canStartNextHostedAiProviderRoundUnscoped: vi.fn(() => Promise.resolve(state.gateResults.shift() ?? false)),
    finalizeAgentTurnOrThrowUnscoped: state.finalize,
    isAgentTurnCancellationRequestedUnscoped: vi.fn().mockResolvedValue(false),
    markAgentTurnProviderStartedUnscoped: state.markProviderStarted,
  }),
}));

vi.mock("@/ee/agent-chat/agent-tools", () => ({
  getAgentAiToolDefinitions: () => [],
  getAgentAiTools: () => ({}),
}));
vi.mock("@/features/mcp-tools/tool-registry", () => ({ ALL_MCP_TOOLS: [] }));
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
  reportFailure: vi.fn().mockResolvedValue(undefined),
  toWorkflowFailure: (error: unknown) => error,
}));

import { HostedAiAdmissionBlockedError } from "@/ee/agent-chat/hosted-ai-admission";
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
  state.markProviderStarted.mockReset().mockResolvedValue(undefined);
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
    state.markProviderStarted.mockRejectedValueOnce(new HostedAiAdmissionBlockedError("operator_paused"));

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
});

import { describe, it, expect, vi, beforeEach } from "vitest";

const repoMock = vi.hoisted(() => ({
  createPendingApprovalRequestOrThrowUnscoped: vi.fn().mockResolvedValue(undefined),
  discardPendingApprovalRequestUnscoped: vi.fn().mockResolvedValue(undefined),
  findApprovalDecisionUnscoped: vi.fn(),
  takeUiCommandResultUnscoped: vi.fn(),
  markAgentTurnProviderStartedUnscoped: vi.fn().mockResolvedValue(undefined),
  finalizeAgentTurnOrThrowUnscoped: vi.fn(),
}));
const aiMock = vi.hoisted(() => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn(() => ({})),
}));
const llmMock = vi.hoisted(() => ({
  laneModel: vi.fn(() => ({}) as never),
  buildLaneUsageSettlement: vi.fn(),
  hasProviderUsageEvidence: vi.fn(
    (usage: { inputTokens?: unknown; outputTokens?: unknown }) =>
      typeof usage.inputTokens === "number" && typeof usage.outputTokens === "number",
  ),
  usageToTokenCounts: vi.fn(() => ({
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  })),
}));
const toolsMock = vi.hoisted(() => ({
  captured: null as unknown,
  error: null as Error | null,
}));
const interactorMock = vi.hoisted(() => ({
  createSupportTicket: vi.fn().mockResolvedValue({ ok: true, data: { number: 1 } }),
}));

vi.mock("@/env", () => ({
  env: {
    AGENT_MAX_OUTPUT_TOKENS: 4096,
    AGENT_MAX_STEPS: 12,
    AGENT_CRM_TOOL_RESULT_MAX_CHARS: 6000,
  },
}));
vi.mock("ai", () => aiMock);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));
let sessionUser: { id: string; companyId: string } = { id: "u1", companyId: "c1" };

vi.mock("@/core/di", () => ({
  getAgentChatRepo: () => repoMock,
  getCreateChatSupportTicketInteractor: () => ({
    invoke: interactorMock.createSupportTicket,
  }),
  getUserService: () => ({
    getActiveUserOrThrow: () => Promise.resolve(sessionUser),
  }),
}));
vi.mock("../llm.service", () => llmMock);
vi.mock("../system-prompt", () => ({ buildAgentSystemPrompt: () => "system" }));
vi.mock("../agent-tools", () => ({
  isAgentToolCancellation: (value: unknown) =>
    Boolean(
      value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        (value as { agentToolStatus?: string }).agentToolStatus === "cancelled",
    ),
  getAgentAiTools: (deps: unknown) => {
    toolsMock.captured = deps;
    if (toolsMock.error) throw toolsMock.error;
    return {};
  },
  describeAgentAiTools: () => [],
}));
vi.mock("../agent-stream-utils", () => ({
  sse: (seq: number, type: string, payload: Record<string, unknown>) =>
    new TextEncoder().encode(`id: ${seq}\ndata: ${JSON.stringify({ seq, type, ...payload })}\n\n`),
  toModelMessages: (messages: { role: string; text: string }[]) =>
    messages.map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.text,
    })),
}));

import { runAgentLane, type AgentRunContext } from "../agent-runner";

type Deps = {
  requestApproval: (requestId: string, toolName: string, input: unknown) => Promise<string>;
  isPreAuthorized: (name: string) => boolean;
  runUiCommand: (
    commandId: string,
    name: string,
    input: Record<string, unknown>,
  ) => Promise<{ ok: boolean; result: string }>;
  createSupportTicket: (toolCallId: string, subject: string, body: string) => Promise<{ ok: boolean; result: string }>;
};

function scripted(driver: () => AsyncGenerator<object> | Generator<object>, finishReason = "stop") {
  return {
    fullStream: (async function* () {
      for await (const part of driver()) yield part;
      yield {
        type: "finish-step",
        usage: { inputTokens: 10, outputTokens: 5 },
        finishReason,
      };
      yield { type: "finish", finishReason };
    })(),
  };
}

function ctx(overrides: Partial<AgentRunContext> = {}): AgentRunContext {
  return {
    companyId: "c1",
    userId: "u1",
    runId: "run1",
    turnRequestId: "turn1",
    userMessageId: "message1",
    clientRequestId: "request1",
    userName: "Max Mustermann",
    conversationId: "cv1",
    locale: "en",
    appBaseUrl: "http://localhost",
    toolNames: ["list_records", "request_support"],
    messages: [{ role: "user", text: "create a contact named Anna" }],
    turnBudget: {
      reservedCredits: 36,
      maxSteps: 8,
      maxOutputTokens: 2048,
      maxContextBytes: 200_000,
      maxToolResultChars: 6_000,
    },
    approvalTimeoutMs: 0,
    approvalPollMs: 1,
    ...overrides,
  };
}

async function runAndRead(context: AgentRunContext, signal = new AbortController().signal) {
  const stream = runAgentLane(context, signal);
  const text = await new Response(stream).text();
  return text
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((frame) => JSON.parse((frame.split("\n").find((line) => line.startsWith("data: ")) ?? "data: {}").slice(6)));
}

beforeEach(() => {
  vi.clearAllMocks();
  toolsMock.captured = null;
  toolsMock.error = null;
  interactorMock.createSupportTicket.mockResolvedValue({
    ok: true,
    data: { number: 1 },
  });
  repoMock.takeUiCommandResultUnscoped.mockResolvedValue(null);
  repoMock.createPendingApprovalRequestOrThrowUnscoped.mockResolvedValue(undefined);
  repoMock.discardPendingApprovalRequestUnscoped.mockResolvedValue(undefined);
  repoMock.markAgentTurnProviderStartedUnscoped.mockResolvedValue(undefined);
  repoMock.finalizeAgentTurnOrThrowUnscoped.mockImplementation((args) =>
    Promise.resolve({
      assistantMessage: {
        id: "assistant1",
        parts: args.parts,
        createdAt: new Date(),
      },
      terminalCode: args.terminalCode,
      affectedResources: args.affectedResources,
      chargedCredits: args.usageSettlement?.chargedCredits ?? 0,
    }),
  );
  llmMock.buildLaneUsageSettlement.mockImplementation((_lane, tokens, options) => ({
    ...tokens,
    model: "model-1",
    costMicrocents: options?.retainReservation ? 20_000_000 : 100_000,
    reservedCredits: options.reservedCredits,
    chargedCredits: options?.retainReservation ? options.reservedCredits : 1,
    policyBreach: false,
  }));
});

describe("agent runner approval rendezvous", () => {
  it("emits approval_request, resolves on a recorded approve decision, then persists the reply", async () => {
    repoMock.findApprovalDecisionUnscoped.mockResolvedValue({
      decision: "approve",
      toolName: "delete_records",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        yield {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "delete_records",
          input: { entity: "contact", ids: ["00000000-0000-4000-8000-000000000001"], apiKey: "never-show" },
        };
        const decision = await (toolsMock.captured as Deps).requestApproval("t1", "delete_records", {
          entity: "contact",
          ids: ["00000000-0000-4000-8000-000000000001"],
          apiKey: "never-show",
        });
        yield {
          type: "tool-result",
          toolCallId: "t1",
          output: `decision:${decision}`,
        };
        yield { type: "text-delta", text: "Removed the contact." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(
      events.some(
        (e) => e.type === "activity" && e.activity?.kind === "records.delete" && e.activity?.resource === "contacts",
      ),
    ).toBe(true);
    const approvalRequest = events.find((event) => event.type === "approval_request");
    expect(approvalRequest).toMatchObject({ requestId: expect.any(String) });
    expect(approvalRequest).not.toHaveProperty("toolName");
    expect(approvalRequest?.activity).toMatchObject({
      kind: "records.delete",
      resource: "contacts",
      risk: "sensitive",
    });
    expect(JSON.stringify(events)).not.toContain("never-show");
    expect(JSON.stringify(events)).not.toContain("00000000-0000-4000-8000-000000000001");
    expect(
      events.some(
        (e) => e.type === "approval_resolved" && e.decision === "approve" && e.requestId === approvalRequest?.requestId,
      ),
    ).toBe(true);
    expect(events.some((e) => e.type === "activity_result" && e.isError === false)).toBe(true);
    expect(events.some((e) => e.type === "delta" && e.text === "Removed the contact.")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: false });
    expect(aiMock.streamText).toHaveBeenCalledWith(expect.objectContaining({ maxRetries: 0 }));
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          {
            type: "activity",
            id: "t1",
            activity: {
              affectedResources: ["contacts"],
              consequence: { action: "records.delete", count: 1 },
              count: 1,
              kind: "records.delete",
              resource: "contacts",
              risk: "sensitive",
            },
            status: "done",
          },
          {
            type: "approval",
            id: expect.any(String),
            activity: {
              affectedResources: ["contacts"],
              consequence: { action: "records.delete", count: 1 },
              count: 1,
              kind: "records.delete",
              resource: "contacts",
              risk: "sensitive",
            },
            status: "approved",
          },
          { type: "text", text: "Removed the contact." },
        ],
      }),
    );
    expect(repoMock.markAgentTurnProviderStartedUnscoped.mock.invocationCallOrder[0]).toBeLessThan(
      repoMock.finalizeAgentTurnOrThrowUnscoped.mock.invocationCallOrder[0],
    );
  });

  it("rejects when the recorded decision was made for a different tool", async () => {
    repoMock.findApprovalDecisionUnscoped.mockResolvedValue({
      decision: "approve",
      toolName: "update_contacts",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        const decision = await (toolsMock.captured as Deps).requestApproval("t2", "delete_records", {});
        yield { type: "text-delta", text: `got:${decision}` };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((e) => e.type === "approval_resolved" && e.decision === "reject")).toBe(true);
    expect(events.some((e) => e.type === "delta" && e.text === "got:reject")).toBe(true);
  });

  it("never emits or persists split page context markup or internal identifiers", async () => {
    const internalId = "00000000-0000-4000-8000-000000000001";
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield { type: "text-delta", text: "I checked <page_con" };
        yield {
          type: "text-delta",
          text: `text route="/en/contacts"/>${internalId} and found it.`,
        };
      }),
    );

    const events = await runAndRead(ctx());
    const visible = events
      .filter((event) => event.type === "delta")
      .map((event) => event.text)
      .join("");

    expect(visible).toBe("I checked [internal reference] and found it.");
    expect(JSON.stringify(events)).not.toContain("page_context");
    expect(JSON.stringify(events)).not.toContain(internalId);
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          {
            type: "text",
            text: "I checked [internal reference] and found it.",
          },
        ],
      }),
    );
  });

  it("resolves the approval to timeout when no decision is ever recorded", async () => {
    repoMock.findApprovalDecisionUnscoped.mockResolvedValue(null);
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        const decision = await (toolsMock.captured as Deps).requestApproval("t9", "delete_records", {});
        yield { type: "text-delta", text: `got:${decision}` };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((e) => e.type === "approval_resolved" && e.decision === "timeout")).toBe(true);
    expect(events.some((e) => e.type === "delta" && e.text === "got:timeout")).toBe(true);
    expect(repoMock.discardPendingApprovalRequestUnscoped).toHaveBeenCalledOnce();
  });

  it("marks a rejected tool execution as cancelled instead of completed", async () => {
    repoMock.findApprovalDecisionUnscoped.mockResolvedValue({
      decision: "reject",
      toolName: "delete_records",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        yield {
          type: "tool-call",
          toolCallId: "t-cancelled",
          toolName: "delete_records",
          input: { entity: "contact", ids: ["00000000-0000-4000-8000-000000000001"] },
        };
        await (toolsMock.captured as Deps).requestApproval("t-cancelled", "delete_records", {
          entity: "contact",
          ids: ["00000000-0000-4000-8000-000000000001"],
        });
        yield {
          type: "tool-result",
          toolCallId: "t-cancelled",
          output: {
            agentToolStatus: "cancelled",
            reason: "rejected",
            message: "Nothing changed.",
          },
        };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "activity_result",
        id: "t-cancelled",
        status: "cancelled",
        isError: false,
      }),
    );
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "t-cancelled",
            status: "cancelled",
          }),
          expect.objectContaining({ type: "approval", status: "rejected" }),
        ]),
      }),
    );
  });

  it("surfaces tool errors as a safe activity result and still finishes the turn", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "t1",
          toolName: "update_deals",
          input: {},
        };
        yield {
          type: "tool-error",
          toolCallId: "t1",
          error: new Error("boom"),
        };
        yield { type: "text-delta", text: "Sorry." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((e) => e.type === "activity_result" && e.isError)).toBe(true);
    expect(events.some((e) => JSON.stringify(e).includes("boom"))).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: false });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            type: "activity",
            id: "t1",
            status: "error",
          }),
          { type: "text", text: "Sorry." },
        ],
      }),
    );
  });

  it("marks a rejected support escalation as an error activity", async () => {
    interactorMock.createSupportTicket.mockResolvedValueOnce({
      ok: false,
      error: {},
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        yield {
          type: "tool-call",
          toolCallId: "support-1",
          toolName: "request_support",
          input: {
            subject: "Need help",
            body: "Please connect me with a human.",
          },
        };
        const output = await (toolsMock.captured as Deps).createSupportTicket(
          "support-1",
          "Need help",
          "Please connect me with a human.",
        );
        yield { type: "tool-result", toolCallId: "support-1", output };
        yield { type: "text-delta", text: output.result };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "activity_result",
        id: "support-1",
        isError: true,
        status: "error",
      }),
    );
    expect(interactorMock.createSupportTicket).toHaveBeenCalledWith({
      conversationId: "cv1",
      turnRequestId: "turn1",
      toolCallId: "support-1",
      subject: "Need help",
      body: "Please connect me with a human.",
    });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "support-1",
            status: "error",
          }),
        ]),
      }),
    );
  });

  it("persists the exact deterministic workspace plan that the user reviews", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "setup-1",
          toolName: "open_workspace_setup",
          input: {
            useCase: "b2bSales",
            businessName: "Acme GmbH",
            goal: "Build a useful first sales pipeline",
          },
        };
        yield {
          type: "tool-result",
          toolCallId: "setup-1",
          output: "plan opened",
        };
      }),
    );

    await runAndRead(ctx());

    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            type: "activity",
            id: "setup-1",
            status: "done",
          }),
          expect.objectContaining({
            type: "workspace_setup",
            id: "setup-1",
            status: "ready",
            plan: expect.objectContaining({
              schemaVersion: 1,
              revision: 1,
              useCase: "b2bSales",
              columns: expect.any(Array),
              records: expect.any(Object),
              widgets: expect.any(Array),
            }),
            planHash: expect.stringMatching(/^[a-f0-9]{64}$/),
          }),
        ],
      }),
    );
  });

  it("retains the full reservation when a later provider step errors after reporting partial usage", async () => {
    llmMock.usageToTokenCounts.mockReturnValueOnce({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield {
          type: "finish-step",
          usage: { inputTokens: 100, outputTokens: 20 },
          finishReason: "tool-calls",
        };
        yield { type: "error", error: new Error("upstream 529") };
      })(),
    });

    const events = await runAndRead(ctx());

    expect(llmMock.buildLaneUsageSettlement).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({ inputTokens: 100, outputTokens: 20 }),
      { reservedCredits: 36, retainReservation: true },
    );
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        usageSettlement: expect.objectContaining({
          costMicrocents: 20_000_000,
        }),
      }),
    );
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: true });
  });

  it("retains the full reservation when an in-flight turn is aborted after a completed step", async () => {
    const abortController = new AbortController();
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield {
          type: "finish-step",
          usage: { inputTokens: 100, outputTokens: 20 },
          finishReason: "tool-calls",
        };
        abortController.abort();
      })(),
    });

    const events = await runAndRead(ctx(), abortController.signal);

    expect(llmMock.buildLaneUsageSettlement).toHaveBeenCalledWith("agent", expect.anything(), {
      reservedCredits: 36,
      retainReservation: true,
    });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalCode: "cancelled",
        usageSettlement: expect.any(Object),
      }),
    );
    expect(events.some((event) => event.type === "turn_done")).toBe(false);
  });

  it("aborts provider work and still finalizes when the stream consumer cancels", async () => {
    let providerSignal: AbortSignal | null = null;
    aiMock.streamText.mockImplementation((options: { abortSignal: AbortSignal }) => {
      providerSignal = options.abortSignal;
      return {
        fullStream: (async function* () {
          await new Promise<void>((resolve) => {
            if (options.abortSignal.aborted) resolve();
            else {
              options.abortSignal.addEventListener("abort", () => resolve(), {
                once: true,
              });
            }
          });
        })(),
      };
    });

    const stream = runAgentLane(ctx(), new AbortController().signal);
    const reader = stream.getReader();
    await vi.waitFor(() => expect(aiMock.streamText).toHaveBeenCalledOnce());
    await reader.cancel();
    await vi.waitFor(() => expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledOnce());

    expect((providerSignal as unknown as AbortSignal).aborted).toBe(true);
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalCode: "cancelled",
        usageSettlement: expect.any(Object),
      }),
    );
  });

  it("persists a canonical pre-provider error when the admitted replay lacks its user tail", async () => {
    const events = await runAndRead(
      ctx({
        messages: [
          { role: "user", text: "hi" },
          { role: "assistant", text: "hello" },
        ],
      }),
    );

    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      numTurns: 1,
    });
    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(repoMock.markAgentTurnProviderStartedUnscoped).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ usageSettlement: null, terminalCode: "error" }),
    );
  });

  it("does not call the provider or charge when durable provider-start marking fails", async () => {
    repoMock.markAgentTurnProviderStartedUnscoped.mockRejectedValueOnce(new Error("provider marker failed"));
    aiMock.streamText.mockReturnValue(scripted(function* () {}));

    await runAndRead(ctx());

    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(llmMock.buildLaneUsageSettlement).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ usageSettlement: null, terminalCode: "error" }),
    );
  });

  it("resolves model configuration before recording provider start", async () => {
    llmMock.laneModel.mockImplementationOnce(() => {
      throw new Error("model configuration failed");
    });

    await runAndRead(ctx());

    expect(repoMock.markAgentTurnProviderStartedUnscoped).not.toHaveBeenCalled();
    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(llmMock.buildLaneUsageSettlement).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ usageSettlement: null, terminalCode: "error" }),
    );
  });

  it("rejects an oversized initial context before recording provider start", async () => {
    const turn = ctx();

    await runAndRead(
      ctx({
        turnBudget: {
          ...turn.turnBudget,
          maxContextBytes: 1,
        },
      }),
    );

    expect(llmMock.laneModel).not.toHaveBeenCalled();
    expect(repoMock.markAgentTurnProviderStartedUnscoped).not.toHaveBeenCalled();
    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(llmMock.buildLaneUsageSettlement).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ usageSettlement: null, terminalCode: "error" }),
    );
  });

  it("retains the reservation when the provider may have billed without reporting usage", async () => {
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: "error", error: new Error("provider unavailable") };
      })(),
    });

    const events = await runAndRead(ctx());

    expect(llmMock.buildLaneUsageSettlement).toHaveBeenCalledWith("agent", expect.anything(), {
      reservedCredits: 36,
      retainReservation: true,
    });
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: true });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          {
            type: "text",
            text: "I couldn't complete that request. Please try again.",
          },
        ],
      }),
    );
  });

  it("retains the reservation after a successful provider response with unproven usage", async () => {
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: "text-delta", text: "Done." };
        yield { type: "finish-step", usage: {}, finishReason: "stop" };
        yield { type: "finish", finishReason: "stop" };
      })(),
    });

    await runAndRead(ctx());

    expect(llmMock.buildLaneUsageSettlement).toHaveBeenCalledWith("agent", expect.anything(), {
      reservedCredits: 36,
      retainReservation: true,
    });
  });

  it("retains the reservation when a successful multi-step response mixes known and unknown usage", async () => {
    llmMock.usageToTokenCounts
      .mockReturnValueOnce({
        inputTokens: 100,
        outputTokens: 20,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      })
      .mockReturnValueOnce({
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: "text-delta", text: "Working on it." };
        yield {
          type: "finish-step",
          usage: { inputTokens: 100, outputTokens: 20 },
          finishReason: "tool-calls",
        };
        yield { type: "text-delta", text: " Done." };
        yield { type: "finish-step", usage: {}, finishReason: "stop" };
        yield { type: "finish", finishReason: "stop" };
      })(),
    });

    const events = await runAndRead(ctx());

    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: false });
    expect(llmMock.buildLaneUsageSettlement).toHaveBeenCalledWith(
      "agent",
      expect.objectContaining({ inputTokens: 100, outputTokens: 20 }),
      { reservedCredits: 36, retainReservation: true },
    );
  });

  it("finalizes an already-aborted request without model or provider access", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await runAndRead(ctx(), abortController.signal);

    expect(llmMock.laneModel).not.toHaveBeenCalled();
    expect(repoMock.markAgentTurnProviderStartedUnscoped).not.toHaveBeenCalled();
    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(llmMock.buildLaneUsageSettlement).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        terminalCode: "cancelled",
        usageSettlement: null,
      }),
    );
  });

  it("persists a truthful terminal fallback after partial provider output errors", async () => {
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: "text-delta", text: "I started checking." };
        yield { type: "error", error: new Error("provider unavailable") };
      })(),
    });

    const events = await runAndRead(ctx());

    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: true });
    expect(events.some((event) => event.type === "error")).toBe(false);
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          {
            type: "text",
            text: "I started checking.\n\nI couldn't complete that request. Please try again.",
          },
        ],
      }),
    );
  });

  it("persists a renderable assistant outcome when the provider finishes without output", async () => {
    aiMock.streamText.mockReturnValue(scripted(function* () {}));

    const events = await runAndRead(ctx());

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "delta",
        text: "I couldn't produce a response. Please try again.",
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      errorMessage: "empty_response",
    });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          {
            type: "text",
            text: "I couldn't produce a response. Please try again.",
          },
        ],
      }),
    );
  });

  it("releases the reservation and persists a canonical reply after a proven pre-provider failure", async () => {
    toolsMock.error = new Error("tool construction failed");

    const events = await runAndRead(ctx());

    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(llmMock.buildLaneUsageSettlement).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          {
            type: "text",
            text: "I couldn't complete that request. Please try again.",
          },
        ],
        usageSettlement: null,
      }),
    );
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: true });
  });

  it("localizes terminal fallback copy to the conversation locale", async () => {
    aiMock.streamText.mockReturnValue(scripted(function* () {}));

    await runAndRead(ctx({ locale: "de" }));

    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          {
            type: "text",
            text: "Ich konnte keine Antwort erstellen. Bitte versuche es erneut.",
          },
        ],
      }),
    );
  });

  it("runs an unapproved create straight through without an approval rendezvous", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "c1",
          toolName: "create_contacts",
          input: { contacts: [{ firstName: "Anna" }] },
        };
        yield { type: "tool-result", toolCallId: "c1", output: "Created 1 contact." };
        yield { type: "text-delta", text: "Anna is in your contacts now." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((event) => event.type === "approval_request")).toBe(false);
    expect(
      events.some(
        (event) =>
          event.type === "activity" && event.activity?.kind === "records.create" && event.activity?.risk === "write",
      ),
    ).toBe(true);
    expect(events.some((event) => event.type === "activity_result" && event.status === "done")).toBe(true);
    const done = events.at(-1);
    expect(done).toMatchObject({ type: "turn_done", isError: false });
    expect(done?.affectedResources).toContain("contacts");
    expect(repoMock.createPendingApprovalRequestOrThrowUnscoped).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.not.arrayContaining([expect.objectContaining({ type: "approval" })]),
      }),
    );
  });

  it("links records and verifies with a read, all without approvals", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "l1",
          toolName: "manage_record_links",
          input: { action: "add", entity: "contact", sourceId: "s", relation: "organizations", ids: ["o"] },
        };
        yield { type: "tool-result", toolCallId: "l1", output: "Linked 1 organizations to contact s (was 0, now 1)" };
        yield {
          type: "tool-call",
          toolCallId: "l2",
          toolName: "list_records",
          input: { entity: "contact" },
        };
        yield { type: "tool-result", toolCallId: "l2", output: "1 contact" };
        yield { type: "text-delta", text: "Linked and verified." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((event) => event.type === "approval_request")).toBe(false);
    const kinds = events
      .filter((event) => event.type === "activity")
      .map((event) => (event.activity as { kind?: string })?.kind);
    expect(kinds).toEqual(["records.link", "records.read"]);
    expect(
      events.some(
        (event) =>
          event.type === "activity" && event.activity?.kind === "records.link" && event.activity?.risk === "write",
      ),
    ).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: false });
  });

  it("round-trips a configure_view command through the browser mailbox", async () => {
    repoMock.takeUiCommandResultUnscoped.mockResolvedValueOnce(null).mockResolvedValueOnce({
      name: "configure_view",
      ok: true,
      result: "Adjusted the deals view: kanban layout, grouped by Status.",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        yield {
          type: "tool-call",
          toolCallId: "view1",
          toolName: "configure_view",
          input: { view: "deals", layout: "kanban", groupBy: "Status" },
        };
        const output = await (toolsMock.captured as Deps).runUiCommand("view1", "configure_view", {
          view: "deals",
          layout: "kanban",
          groupBy: "Status",
        });
        expect(output).toEqual({
          ok: true,
          result: "Adjusted the deals view: kanban layout, grouped by Status.",
        });
        yield { type: "tool-result", toolCallId: "view1", output };
        yield { type: "text-delta", text: "Your deals are now a kanban board." };
      }),
    );

    const events = await runAndRead(ctx());

    const command = events.find((event) => event.type === "ui_command");
    expect(command).toMatchObject({
      name: "configure_view",
      input: { view: "deals", layout: "kanban", groupBy: "Status" },
    });
    expect(events.some((event) => event.type === "activity" && event.activity?.kind === "interface.configure")).toBe(
      true,
    );
    expect(events.some((event) => event.type === "activity_result" && event.status === "done")).toBe(true);
    expect(events.some((event) => event.type === "approval_request")).toBe(false);
  });

  it("fails closed when the browser answers a configure_view with a different command name", async () => {
    repoMock.takeUiCommandResultUnscoped.mockResolvedValue({
      name: "navigate",
      ok: true,
      result: "Navigated.",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        const output = await (toolsMock.captured as Deps).runUiCommand("view2", "configure_view", {
          view: "deals",
        });
        expect(output.ok).toBe(false);
        yield { type: "text-delta", text: "done" };
      }),
    );

    await runAndRead(ctx());
  });

  it("waits for the browser result and returns its exact failure to the model", async () => {
    repoMock.takeUiCommandResultUnscoped.mockResolvedValueOnce(null).mockResolvedValueOnce({
      name: "highlight_element",
      ok: false,
      result: "Target contacts-add is not visible.",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        yield {
          type: "tool-call",
          toolCallId: "ui1",
          toolName: "highlight_element",
          input: { targetId: "contacts-add" },
        };
        const output = await (toolsMock.captured as Deps).runUiCommand("ui1", "highlight_element", {
          targetId: "contacts-add",
        });
        expect(output).toEqual({
          ok: false,
          result: "Target contacts-add is not visible.",
        });
        yield { type: "tool-result", toolCallId: "ui1", output };
        yield { type: "text-delta", text: output.result };
      }),
    );

    const events = await runAndRead(ctx());

    const commandIndex = events.findIndex((event) => event.type === "ui_command");
    const resultIndex = events.findIndex((event) => event.type === "activity_result");
    expect(commandIndex).toBeGreaterThanOrEqual(0);
    expect(resultIndex).toBeGreaterThan(commandIndex);
    expect(events[resultIndex]).toMatchObject({
      type: "activity_result",
      id: "ui1",
      isError: true,
      status: "error",
    });
    expect(events.some((event) => event.type === "delta" && event.text === "Target contacts-add is not visible.")).toBe(
      true,
    );
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "ui1",
            status: "error",
          }),
        ]),
      }),
    );
  });

  it("marks a workspace setup review as failed when its browser command fails", async () => {
    repoMock.takeUiCommandResultUnscoped.mockResolvedValue({
      name: "open_workspace_setup",
      ok: false,
      result: "The setup review could not be opened.",
    });
    const input = {
      useCase: "b2bSales",
      businessName: "Acme",
      goal: "Build a small sales workspace",
    };
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        yield {
          type: "tool-call",
          toolCallId: "setup-1",
          toolName: "open_workspace_setup",
          input,
        };
        const output = await (toolsMock.captured as Deps).runUiCommand("setup-1", "open_workspace_setup", input);
        yield { type: "tool-result", toolCallId: "setup-1", output };
        yield { type: "text-delta", text: output.result };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events).toContainEqual(
      expect.objectContaining({
        type: "activity_result",
        id: "setup-1",
        isError: true,
        status: "error",
      }),
    );
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "setup-1",
            status: "error",
          }),
          expect.objectContaining({
            type: "workspace_setup",
            id: "setup-1",
            status: "failed",
          }),
        ]),
      }),
    );
  });

  it("fails closed when the browser responds for a different command name", async () => {
    repoMock.takeUiCommandResultUnscoped.mockResolvedValue({
      name: "navigate",
      ok: true,
      result: "Navigated.",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        const output = await (toolsMock.captured as Deps).runUiCommand("ui2", "start_tour", { steps: [] });
        yield { type: "text-delta", text: output.result };
      }),
    );

    const events = await runAndRead(ctx());

    expect(
      events
        .filter((event) => event.type === "delta")
        .map((event) => String(event.text))
        .join(""),
    ).toContain("did not match");
  });

  it("marks every terminal tool-calls finish as incomplete even when the model already emitted text", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield { type: "text-delta", text: "I'll check that." };
        yield {
          type: "tool-call",
          toolCallId: "last",
          toolName: "list_records",
          input: {},
        };
      }, "tool-calls"),
    );

    const events = await runAndRead(ctx());

    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      errorMessage: "max_turns",
    });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: [
          { type: "text", text: "I'll check that." },
          expect.objectContaining({
            type: "activity",
            id: "last",
            status: "error",
          }),
          {
            type: "text",
            text: expect.stringContaining("I couldn't finish this within the allowed number of steps."),
          },
        ],
      }),
    );
  });

  it("hard-caps configured model steps and output tokens", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield { type: "text-delta", text: "Done." };
      }),
    );

    await runAndRead(ctx());

    expect(aiMock.stepCountIs).toHaveBeenCalledWith(8);
    expect(aiMock.streamText).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 2048 }));
  });

  it("never streams or persists tool input", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "secret-tool",
          toolName: "list_records",
          input: {
            entity: "contact",
            apiKey: "do-not-disclose",
            nested: { password: "also-secret" },
          },
        };
        yield {
          type: "tool-result",
          toolCallId: "secret-tool",
          output: "done",
        };
      }),
    );

    const events = await runAndRead(ctx());
    const serializedEvents = JSON.stringify(events);
    const persisted = JSON.stringify(repoMock.finalizeAgentTurnOrThrowUnscoped.mock.calls);

    expect(serializedEvents).not.toContain("do-not-disclose");
    expect(serializedEvents).not.toContain("also-secret");
    expect(persisted).not.toContain("do-not-disclose");
    expect(persisted).not.toContain("also-secret");
    expect(serializedEvents).toContain("records.read");
    expect(serializedEvents).not.toContain("apiKey");
    expect(persisted).not.toContain("apiKey");
  });

  it("emits no terminal success when the atomic finalizer fails", async () => {
    repoMock.finalizeAgentTurnOrThrowUnscoped.mockRejectedValue(new Error("db unavailable"));
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield { type: "text-delta", text: "Done." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((event) => event.type === "turn_done")).toBe(false);
    expect(events.some((event) => event.type === "message_committed")).toBe(false);
  });

  it("refuses to run a turn whose admitted workspace is not the one the session now carries", async () => {
    sessionUser = { id: "u1", companyId: "other-company" };

    await runAndRead(ctx());

    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: expect.not.stringMatching(/^ok$/) }),
    );

    sessionUser = { id: "u1", companyId: "c1" };
  });
});

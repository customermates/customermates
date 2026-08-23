import { describe, it, expect, vi, beforeEach } from "vitest";

import { AppErrorCode, ForbiddenError } from "@/core/errors/app-errors";
import { createZodError } from "@/core/validation/validation.utils";

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
  buildTurnUsageSettlement: vi.fn(),
  hasProviderUsageEvidence: vi.fn(
    (usage: {
      inputTokens?: unknown;
      inputTokenDetails?: {
        noCacheTokens?: unknown;
        cacheReadTokens?: unknown;
        cacheWriteTokens?: unknown;
      };
      outputTokens?: unknown;
    }) => {
      const details = usage.inputTokenDetails;
      return (
        typeof usage.inputTokens === "number" &&
        typeof usage.outputTokens === "number" &&
        typeof details?.noCacheTokens === "number" &&
        typeof details.cacheReadTokens === "number" &&
        typeof details.cacheWriteTokens === "number" &&
        details.noCacheTokens + details.cacheReadTokens + details.cacheWriteTokens === usage.inputTokens
      );
    },
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
  createSupportTicket: vi.fn().mockResolvedValue({ ok: true, data: { sent: true } }),
}));
const sentryMock = vi.hoisted(() => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));
const userServiceMock = vi.hoisted(() => ({
  getActiveUserOrThrow: vi.fn(),
}));

vi.mock("@/env", () => ({
  env: {
    AGENT_MAX_OUTPUT_TOKENS: 4096,
    AGENT_MAX_STEPS: 12,
    AGENT_CRM_TOOL_RESULT_MAX_CHARS: 6000,
  },
}));
vi.mock("ai", () => aiMock);
vi.mock("@sentry/nextjs", () => sentryMock);
let sessionUser: { id: string; companyId: string } = {
  id: "u1",
  companyId: "c1",
};

vi.mock("@/core/di", () => ({
  getAgentChatRepo: () => repoMock,
  getCreateChatSupportTicketInteractor: () => ({
    invoke: interactorMock.createSupportTicket,
  }),
  getUserService: () => userServiceMock,
}));
vi.mock("../agent-external-approval-context", () => ({
  resolveAgentApprovalContext: (_toolName: string, input: unknown) => Promise.resolve({ ok: true, input }),
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
  resolveApprovalContext: (toolName: string, input: unknown) => Promise<{ ok: true; input: unknown }>;
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
        usage: {
          inputTokens: 10,
          inputTokenDetails: {
            noCacheTokens: 10,
            cacheReadTokens: 0,
            cacheWriteTokens: 0,
          },
          outputTokens: 5,
        },
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
    messages: [{ role: "user", text: "create a contact named Anna" }],
    turnBudget: {
      modelSpec: "openai/gpt-5.6-luna",
      servingProvider: "openai",
      reservedCredits: 44,
      maxSteps: 8,
      maxOutputTokens: 2048,
      maxContextTokens: 66_000,
      maxContextBytes: 198_000,
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
  userServiceMock.getActiveUserOrThrow.mockImplementation(() => Promise.resolve(sessionUser));
  interactorMock.createSupportTicket.mockResolvedValue({
    ok: true,
    data: { sent: true },
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
  llmMock.buildTurnUsageSettlement.mockImplementation((_lane, tokens, options) => ({
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
          input: {
            entity: "contact",
            ids: ["00000000-0000-4000-8000-000000000001"],
            apiKey: "never-show",
          },
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
    expect(aiMock.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 0,
        providerOptions: { gateway: { only: ["openai"] }, openai: { parallelToolCalls: false } },
        system: "system",
        timeout: { totalMs: 240_000 },
      }),
    );
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

  it("keeps tools available through the last funded provider step", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield { type: "text-delta", text: "Done." };
      }),
    );

    const context = ctx();
    await runAndRead(
      ctx({
        turnBudget: { ...context.turnBudget, maxSteps: 4 },
      }),
    );

    const options = aiMock.streamText.mock.calls[0]?.[0] as {
      prepareStep: (args: { messages: unknown[]; stepNumber: number; steps?: unknown[] }) => unknown;
    };
    expect(options.prepareStep({ messages: [], stepNumber: 2 })).toEqual({
      system: "system",
      messages: [{ role: "user", content: "create a contact named Anna" }],
    });
    expect(options.prepareStep({ messages: [], stepNumber: 3 })).toEqual({
      system: "system",
      messages: [{ role: "user", content: "create a contact named Anna" }],
    });
  });

  const compactionHarness = (oldResult: string) => {
    let prepared: { system?: string; messages?: unknown[] } | undefined;
    aiMock.streamText.mockImplementation(
      (options: {
        prepareStep: (args: { steps: unknown[] }) => {
          system?: string;
          messages?: unknown[];
        };
      }) => {
        const step = (label: string, result: string) => ({
          finishReason: "tool-calls",
          content: [
            {
              type: "tool-call",
              toolCallId: `${label}-call`,
              toolName: "list_records",
              input: { entity: "contact" },
            },
            {
              type: "tool-result",
              toolCallId: `${label}-call`,
              toolName: "list_records",
              output: { ok: true, result },
            },
          ],
          response: { messages: [{ role: "assistant", content: result }] },
        });

        prepared = options.prepareStep({
          steps: [
            step("old", oldResult),
            step("recent-one", "recent-result-one"),
            step("recent-two", "recent-result-two"),
          ],
        });
        return scripted(function* () {
          yield { type: "text-delta", text: "Done." };
        });
      },
    );
    return () => prepared;
  };

  it("keeps every step of the transcript while it fits the step budget", async () => {
    const read = compactionHarness("older-result");

    await runAndRead(ctx());

    expect(read()?.system).not.toContain("<agent_continuation_checkpoint>");
    expect(read()?.messages).toEqual([
      { role: "user", content: "create a contact named Anna" },
      { role: "assistant", content: "older-result" },
      { role: "assistant", content: "recent-result-one" },
      { role: "assistant", content: "recent-result-two" },
    ]);
  });

  it("compacts older steps into a checkpoint once the transcript exceeds the step budget", async () => {
    const read = compactionHarness(`private-old-result-${"x".repeat(220_000)}`);

    await runAndRead(ctx());

    expect(read()?.system).toContain("<agent_continuation_checkpoint>");
    expect(read()?.system).not.toContain("private-old-result");
    expect(read()?.messages).toEqual([
      { role: "user", content: "create a contact named Anna" },
      { role: "assistant", content: "recent-result-one" },
      { role: "assistant", content: "recent-result-two" },
    ]);
  });

  it("stops a repeating tool loop with a truthful partial response", async () => {
    aiMock.streamText.mockImplementation((options: { stopWhen: Array<(args: { steps: unknown[] }) => boolean> }) => {
      const repeatedSteps = Array.from({ length: 3 }, (_, index) => ({
        finishReason: "tool-calls",
        content: [
          {
            type: "tool-call",
            toolCallId: `repeat-${index}`,
            toolName: "get_workspace_context",
            input: {},
          },
          {
            type: "tool-result",
            toolCallId: `repeat-${index}`,
            toolName: "get_workspace_context",
            output: { ok: true, result: "done" },
          },
        ],
        response: { messages: [] },
      }));
      expect(options.stopWhen[1]?.({ steps: repeatedSteps })).toBe(true);
      return scripted(function* () {
        yield { type: "text-delta", text: "I completed the safe work." };
      }, "tool-calls");
    });

    const events = await runAndRead(ctx());
    const visibleText = events
      .filter((event) => event.type === "delta")
      .map((event) => event.text)
      .join("");

    expect(visibleText).toContain("stopped because the latest steps were repeating");
    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      terminalCode: "partial",
      errorMessage: "safety_limit",
    });
    expect(sentryMock.captureException).not.toHaveBeenCalled();
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
          input: {
            entity: "contact",
            ids: ["00000000-0000-4000-8000-000000000001"],
          },
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
    const error = new Error("boom");
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
          error,
        };
        yield { type: "text-delta", text: "Sorry." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((e) => e.type === "activity_result" && e.isError)).toBe(true);
    expect(events.some((e) => JSON.stringify(e).includes("boom"))).toBe(false);
    expect(sentryMock.captureException).toHaveBeenCalledOnce();
    expect(sentryMock.captureException).toHaveBeenCalledWith(error);
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

  it.each([
    ["direct", new ForbiddenError()],
    ["cause", new Error("Safe tool wrapper", { cause: new ForbiddenError() })],
    [
      "nested cause",
      new Error("Outer framework wrapper", {
        cause: new Error("Safe tool wrapper", { cause: new ForbiddenError() }),
      }),
    ],
  ])("does not capture an expected access failure from a tool %s", async (_kind, error) => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "expected-1",
          toolName: "update_deals",
          input: {},
        };
        yield {
          type: "tool-error",
          toolCallId: "expected-1",
          toolName: "update_deals",
          error,
        };
        yield { type: "text-delta", text: "That action is not available." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((event) => event.type === "activity_result" && event.isError)).toBe(true);
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("does not capture an invalid model tool call or its paired tool error", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "invalid-1",
          toolName: "update_deals",
          input: {},
          invalid: true,
        };
        yield {
          type: "tool-error",
          toolCallId: "invalid-1",
          toolName: "update_deals",
          error: new Error("Model generated invalid tool input"),
        };
        yield { type: "text-delta", text: "I need different input." };
      }),
    );

    await runAndRead(ctx());

    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("reports success after the support email is accepted", async () => {
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

    await runAndRead(ctx());

    expect(interactorMock.createSupportTicket).toHaveBeenCalledWith({
      conversationId: "cv1",
      subject: "Need help",
      body: "Please connect me with a human.",
    });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          {
            type: "text",
            text: "Support request email accepted for delivery. The Customermates team will reply to the email address on your account.",
          },
        ]),
      }),
    );
  });

  it("marks a rejected support email as an error activity", async () => {
    interactorMock.createSupportTicket.mockResolvedValueOnce({
      ok: false,
      error: createZodError("Support request rejected."),
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

  it("retains the full reservation when a later provider step errors after reporting partial usage", async () => {
    llmMock.usageToTokenCounts.mockReturnValueOnce({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    aiMock.streamText.mockImplementation((options: { experimental_onStepStart: () => void }) => ({
      fullStream: (function* () {
        options.experimental_onStepStart();
        yield {
          type: "finish-step",
          usage: {
            inputTokens: 100,
            inputTokenDetails: {
              noCacheTokens: 100,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            outputTokens: 20,
          },
          finishReason: "tool-calls",
        };
        options.experimental_onStepStart();
        yield { type: "error", error: new Error("upstream 529") };
      })(),
    }));

    const context = ctx();
    const events = await runAndRead(
      ctx({
        turnBudget: {
          ...context.turnBudget,
          reservedCredits: 110,
          maxSteps: 20,
          maxOutputTokens: 2048,
          maxContextBytes: 200_000,
        },
      }),
    );

    expect(llmMock.buildTurnUsageSettlement).toHaveBeenCalledWith(
      "openai/gpt-5.6-luna",
      expect.objectContaining({ inputTokens: 100, outputTokens: 20 }),
      { reservedCredits: 110, retainReservation: true },
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

  it("retains when the next provider step starts before the prior finish event is consumed", async () => {
    aiMock.streamText.mockImplementation((options: { experimental_onStepStart: () => void }) => ({
      fullStream: (function* () {
        options.experimental_onStepStart();
        options.experimental_onStepStart();
        yield {
          type: "finish-step",
          usage: {
            inputTokens: 100,
            inputTokenDetails: {
              noCacheTokens: 100,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            outputTokens: 20,
          },
          finishReason: "tool-calls",
        };
        yield {
          type: "error",
          error: new Error("step two failed before usage"),
        };
      })(),
    }));

    await runAndRead(ctx());

    expect(llmMock.buildTurnUsageSettlement).toHaveBeenCalledWith("openai/gpt-5.6-luna", expect.anything(), {
      reservedCredits: 44,
      retainReservation: true,
    });
  });

  it("retains the full reservation when an in-flight turn is aborted after a completed step", async () => {
    const abortController = new AbortController();
    aiMock.streamText.mockImplementation((options: { experimental_onStepStart: () => void }) => ({
      fullStream: (function* () {
        options.experimental_onStepStart();
        yield {
          type: "finish-step",
          usage: {
            inputTokens: 100,
            inputTokenDetails: {
              noCacheTokens: 100,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            outputTokens: 20,
          },
          finishReason: "tool-calls",
        };
        options.experimental_onStepStart();
        abortController.abort();
      })(),
    }));

    const events = await runAndRead(ctx(), abortController.signal);

    expect(llmMock.buildTurnUsageSettlement).toHaveBeenCalledWith("openai/gpt-5.6-luna", expect.anything(), {
      reservedCredits: 44,
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

  it("settles reported usage when a local context guard blocks the next provider step", async () => {
    llmMock.usageToTokenCounts.mockReturnValueOnce({
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
    aiMock.streamText.mockImplementation(
      (options: {
        experimental_onStepStart: () => void;
        prepareStep: (args: { messages: Array<{ role: string; content: string }>; stepNumber: number }) => unknown;
      }) => ({
        fullStream: (function* () {
          options.experimental_onStepStart();
          yield {
            type: "finish-step",
            usage: {
              inputTokens: 100,
              inputTokenDetails: {
                noCacheTokens: 100,
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
              },
              outputTokens: 20,
            },
            finishReason: "tool-calls",
          };
          options.prepareStep({
            messages: [{ role: "user", content: "x".repeat(250_000) }],
            stepNumber: 1,
          });
        })(),
      }),
    );

    const events = await runAndRead(ctx());

    expect(llmMock.buildTurnUsageSettlement).toHaveBeenCalledWith(
      "openai/gpt-5.6-luna",
      expect.objectContaining({ inputTokens: 100, outputTokens: 20 }),
      { reservedCredits: 44, retainReservation: false },
    );
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        usageSettlement: expect.objectContaining({ chargedCredits: 1 }),
      }),
    );
    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      creditsUsed: 1,
    });
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
    expect(llmMock.buildTurnUsageSettlement).not.toHaveBeenCalled();
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

    expect(repoMock.markAgentTurnProviderStartedUnscoped).not.toHaveBeenCalled();
    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(llmMock.buildTurnUsageSettlement).not.toHaveBeenCalled();
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ usageSettlement: null, terminalCode: "error" }),
    );
  });

  it("retains the reservation when the provider may have billed without reporting usage", async () => {
    const error = new Error("provider unavailable");
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: "error", error };
      })(),
    });

    const events = await runAndRead(ctx());

    expect(llmMock.buildTurnUsageSettlement).toHaveBeenCalledWith("openai/gpt-5.6-luna", expect.anything(), {
      reservedCredits: 44,
      retainReservation: true,
    });
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: true });
    expect(sentryMock.captureException).toHaveBeenCalledOnce();
    expect(sentryMock.captureException).toHaveBeenCalledWith(error);
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

  it("retains the reservation after a successful provider response without explicit cache-write evidence", async () => {
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: "text-delta", text: "Done." };
        yield {
          type: "finish-step",
          usage: {
            inputTokens: 100,
            inputTokenDetails: { noCacheTokens: 100, cacheReadTokens: 0 },
            outputTokens: 20,
          },
          finishReason: "stop",
        };
        yield { type: "finish", finishReason: "stop" };
      })(),
    });

    await runAndRead(ctx());

    expect(llmMock.buildTurnUsageSettlement).toHaveBeenCalledWith("openai/gpt-5.6-luna", expect.anything(), {
      reservedCredits: 44,
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
          usage: {
            inputTokens: 100,
            inputTokenDetails: {
              noCacheTokens: 100,
              cacheReadTokens: 0,
              cacheWriteTokens: 0,
            },
            outputTokens: 20,
          },
          finishReason: "tool-calls",
        };
        yield { type: "text-delta", text: " Done." };
        yield { type: "finish-step", usage: {}, finishReason: "stop" };
        yield { type: "finish", finishReason: "stop" };
      })(),
    });

    const events = await runAndRead(ctx());

    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: false });
    expect(llmMock.buildTurnUsageSettlement).toHaveBeenCalledWith(
      "openai/gpt-5.6-luna",
      expect.objectContaining({ inputTokens: 100, outputTokens: 20 }),
      { reservedCredits: 44, retainReservation: true },
    );
  });

  it("finalizes an already-aborted request without model or provider access", async () => {
    const abortController = new AbortController();
    abortController.abort();

    await runAndRead(ctx(), abortController.signal);

    expect(repoMock.markAgentTurnProviderStartedUnscoped).not.toHaveBeenCalled();
    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(llmMock.buildTurnUsageSettlement).not.toHaveBeenCalled();
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

  it("treats a provider timeout as a controlled partial turn", async () => {
    const timeout = new Error("The bounded agent run timed out.");
    timeout.name = "TimeoutError";
    aiMock.streamText.mockReturnValue({
      fullStream: (function* () {
        yield { type: "text-delta", text: "I completed the first check." };
        yield { type: "error", error: timeout };
      })(),
    });

    const events = await runAndRead(ctx());

    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      terminalCode: "partial",
      errorMessage: "safety_limit",
    });
    expect(JSON.stringify(events)).toContain("reached a safety limit");
    expect(sentryMock.captureException).not.toHaveBeenCalled();
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
    expect(llmMock.buildTurnUsageSettlement).not.toHaveBeenCalled();
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

  it("does not capture an inactive user rejected before provider access", async () => {
    userServiceMock.getActiveUserOrThrow.mockRejectedValue(
      new ForbiddenError("User is not active", AppErrorCode.inactiveUser),
    );

    const events = await runAndRead(ctx());

    expect(aiMock.streamText).not.toHaveBeenCalled();
    expect(sentryMock.captureException).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      errorMessage: "error",
    });
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

  it("supersedes a validation-failed call once the model retries the same tool", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "f1",
          toolName: "create_contacts",
          input: { contacts: [{}] },
        };
        yield {
          type: "tool-result",
          toolCallId: "f1",
          toolName: "create_contacts",
          output: { ok: false, result: "Validation error: firstName" },
        };
        yield {
          type: "tool-call",
          toolCallId: "f2",
          toolName: "create_contacts",
          input: { contacts: [{ firstName: "Anna" }] },
        };
        yield {
          type: "tool-result",
          toolCallId: "f2",
          toolName: "create_contacts",
          output: { ok: true, result: "Created 1 contact." },
        };
        yield { type: "text-delta", text: "Anna is in your contacts now." };
      }),
    );

    const events = await runAndRead(ctx());

    const supersededIndex = events.findIndex((event) => event.type === "activity_superseded" && event.id === "f1");
    const retryIndex = events.findIndex((event) => event.type === "activity" && event.id === "f2");
    expect(supersededIndex).toBeGreaterThan(-1);
    expect(supersededIndex).toBeLessThan(retryIndex);
    expect(sentryMock.captureException).not.toHaveBeenCalled();
    expect(events.at(-1)).toMatchObject({ type: "turn_done", isError: false });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.not.arrayContaining([expect.objectContaining({ type: "activity", id: "f1" })]),
      }),
    );
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "f2",
            status: "done",
          }),
        ]),
      }),
    );
  });

  it("keeps a validation failure that no same-tool retry ever superseded", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "f1",
          toolName: "create_contacts",
          input: { contacts: [{}] },
        };
        yield {
          type: "tool-result",
          toolCallId: "f1",
          toolName: "create_contacts",
          output: { ok: false, result: "Validation error: firstName" },
        };
        yield {
          type: "tool-call",
          toolCallId: "r1",
          toolName: "list_records",
          input: { entity: "contact" },
        };
        yield {
          type: "tool-result",
          toolCallId: "r1",
          toolName: "list_records",
          output: "0 contacts",
        };
        yield { type: "text-delta", text: "I could not create the contact." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((event) => event.type === "activity_superseded")).toBe(false);
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "f1",
            status: "error",
          }),
        ]),
      }),
    );
  });

  it("never supersedes a thrown tool error, even when the same tool runs again", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "tool-call",
          toolCallId: "b1",
          toolName: "update_deals",
          input: {},
        };
        yield {
          type: "tool-error",
          toolCallId: "b1",
          error: new Error("boom"),
        };
        yield {
          type: "tool-call",
          toolCallId: "b2",
          toolName: "update_deals",
          input: {},
        };
        yield {
          type: "tool-result",
          toolCallId: "b2",
          toolName: "update_deals",
          output: { ok: true, result: "Updated 1 deal." },
        };
        yield { type: "text-delta", text: "Second attempt worked." };
      }),
    );

    const events = await runAndRead(ctx());

    expect(events.some((event) => event.type === "activity_superseded")).toBe(false);
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "activity",
            id: "b1",
            status: "error",
          }),
          expect.objectContaining({
            type: "activity",
            id: "b2",
            status: "done",
          }),
        ]),
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
        yield {
          type: "tool-result",
          toolCallId: "c1",
          output: "Created 1 contact.",
        };
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
          input: {
            action: "add",
            entity: "contact",
            sourceId: "s",
            relation: "organizations",
            ids: ["o"],
          },
        };
        yield {
          type: "tool-result",
          toolCallId: "l1",
          output: "Linked 1 organizations to contact s (was 0, now 1)",
        };
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

  it("round-trips a click_ui_target command through the browser mailbox", async () => {
    repoMock.takeUiCommandResultUnscoped.mockResolvedValueOnce(null).mockResolvedValueOnce({
      name: "click_ui_target",
      ok: true,
      result: "Activated deals-layout-kanban.",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        yield {
          type: "tool-call",
          toolCallId: "view1",
          toolName: "click_ui_target",
          input: { targetId: "deals-layout-kanban" },
        };
        const output = await (toolsMock.captured as Deps).runUiCommand("view1", "click_ui_target", {
          targetId: "deals-layout-kanban",
        });
        expect(output).toEqual({
          ok: true,
          result: "Activated deals-layout-kanban.",
        });
        yield { type: "tool-result", toolCallId: "view1", output };
        yield {
          type: "text-delta",
          text: "Your deals are now a kanban board.",
        };
      }),
    );

    const events = await runAndRead(ctx());

    const command = events.find((event) => event.type === "ui_command");
    expect(command).toMatchObject({
      name: "click_ui_target",
      input: { targetId: "deals-layout-kanban" },
    });
    expect(events.some((event) => event.type === "activity" && event.activity?.kind === "interface.interact")).toBe(
      true,
    );
    expect(events.some((event) => event.type === "activity_result" && event.status === "done")).toBe(true);
    expect(events.some((event) => event.type === "approval_request")).toBe(false);
  });

  it("fails closed when the browser answers a click_ui_target with a different command name", async () => {
    repoMock.takeUiCommandResultUnscoped.mockResolvedValue({
      name: "navigate",
      ok: true,
      result: "Navigated.",
    });
    aiMock.streamText.mockReturnValue(
      scripted(async function* () {
        const output = await (toolsMock.captured as Deps).runUiCommand("view2", "click_ui_target", {
          targetId: "deals-display-options",
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
            text: expect.stringContaining("I completed part of this request"),
          },
        ],
      }),
    );
  });

  it("removes visible provider tool protocol and fails the turn safely", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "text-delta",
          text: "I prepared the first batch. to=customer_",
        };
        yield {
          type: "text-delta",
          text: 'records.create_contacts (json)\n{"email":"private@example.com","apiKey":"never-show"}',
        };
      }),
    );

    const events = await runAndRead(ctx());
    const serializedEvents = JSON.stringify(events);
    const persisted = repoMock.finalizeAgentTurnOrThrowUnscoped.mock.calls[0]?.[0];
    const serializedPersisted = JSON.stringify(persisted?.parts);

    expect(serializedEvents).toContain("I prepared the first batch.");
    expect(serializedEvents).toContain("I couldn't complete that request");
    expect(serializedEvents).not.toMatch(/customer_records|create_contacts|private@example|never-show|apiKey/);
    expect(serializedPersisted).not.toMatch(/customer_records|create_contacts|private@example|never-show|apiKey/);
    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      terminalCode: "error",
      errorMessage: "error",
    });
    expect(repoMock.finalizeAgentTurnOrThrowUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ terminalCode: "error" }),
    );
    expect(sentryMock.captureException).toHaveBeenCalledOnce();
    expect(sentryMock.captureException.mock.calls[0]?.[0]).toMatchObject({
      message: "The assistant emitted tool protocol as visible text.",
    });
  });

  it("classifies protocol-only output as a safe provider error instead of an empty response", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield {
          type: "text-delta",
          text: "to=customer_records.create_contacts (json)\n",
        };
        yield { type: "text-delta", text: '{"email":"private@example.com"}' };
      }),
    );

    const events = await runAndRead(ctx());
    const serialized = JSON.stringify(events);

    expect(serialized).toContain("I couldn't complete that request");
    expect(serialized).not.toMatch(/customer_records|create_contacts|private@example/);
    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      terminalCode: "error",
      errorMessage: "error",
    });
    expect(sentryMock.captureException).toHaveBeenCalledOnce();
  });

  it("marks output-token exhaustion as partial", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield { type: "text-delta", text: "I completed the first part." };
      }, "length"),
    );

    const events = await runAndRead(ctx());

    expect(events.at(-1)).toMatchObject({
      type: "turn_done",
      isError: true,
      terminalCode: "partial",
      errorMessage: "output_limit",
    });
    expect(JSON.stringify(events)).toContain("reached this turn's output limit");
    expect(sentryMock.captureException).not.toHaveBeenCalled();
  });

  it("hard-caps configured model steps and output tokens", async () => {
    aiMock.streamText.mockReturnValue(
      scripted(function* () {
        yield { type: "text-delta", text: "Done." };
      }),
    );

    await runAndRead(ctx());

    expect(aiMock.stepCountIs).toHaveBeenCalledWith(8);
    expect(aiMock.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxOutputTokens: 2048,
        timeout: { totalMs: 240_000 },
      }),
    );
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
      expect.objectContaining({
        terminalCode: expect.not.stringMatching(/^ok$/),
      }),
    );

    sessionUser = { id: "u1", companyId: "c1" };
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import { mockEntitlementService } from "@/tests/helpers/mock-entitlement-service";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUserWithPermissions([]);

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, APP_MODE: "cloud" as const, AGENT_MODEL: "anthropic:claude-test" },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), setTag: vi.fn(), setUser: vi.fn() }));

import { AgentLimitExceededError, AgentSessionUnavailableError } from "@/core/errors/app-errors";

import { GetAgentConversationInteractor } from "../get-agent-conversation.interactor";
import { RespondToUiCommandInteractor } from "../respond-to-ui-command.interactor";
import { SendAgentMessageInteractor } from "../send-agent-message.interactor";

const CONVERSATION_ID = "00000000-0000-4000-8000-000000000001";
const MESSAGE_ID = "00000000-0000-4000-8000-000000000002";
const CLIENT_REQUEST_ID = "00000000-0000-4000-8000-000000000003";
const messagePage = (messages: unknown[]) => ({ messages, nextCursor: null });

function usageService() {
  const summary = {
    creditsUsed: 0,
    creditsRemaining: 500,
    creditsLimit: 500,
    usedPct: 0,
    plan: "pro",
    periodStart: new Date("2026-08-01T00:00:00Z"),
    resetAt: new Date("2026-09-01T00:00:00Z"),
    recentTurnCredits: null,
    blockedReason: null,
  };
  return {
    prepareTurn: vi.fn().mockResolvedValue({
      summary,
      reservation: {
        reservedCredits: 36,
        planSnapshot: "pro",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 500,
        periodStart: summary.periodStart,
        periodEnd: summary.resetAt,
        budget: {
          reservedCredits: 36,
          maxSteps: 8,
          maxOutputTokens: 2048,
          maxContextBytes: 200_000,
          maxToolResultChars: 6_000,
        },
      },
    }),
    reserveUsage: vi.fn().mockResolvedValue(undefined),
    releaseReservation: vi.fn().mockResolvedValue(undefined),
  };
}

describe("agent access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    expect(mockUser.role?.isSystemRole).toBe(false);
    expect(mockUser.role?.permissions).toEqual([]);
  });

  it("admits a new turn, keeps page context private, and preserves the complete current message", async () => {
    const currentText = "x".repeat(2000);
    let persistedUserMessageId = "";
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      createConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      createAgentTurnRequest: vi.fn().mockImplementation((args) => {
        persistedUserMessageId = args.userMessageId;
        return Promise.resolve();
      }),
      touchConversation: vi.fn().mockResolvedValue(undefined),
      listRecentMessages: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            id: "old",
            role: "assistant",
            parts: [{ type: "text", text: "y".repeat(2000) }],
          },
          {
            id: persistedUserMessageId,
            role: "user",
            parts: [{ type: "text", text: currentText }],
          },
        ]),
      ),
    };

    const result = await new SendAgentMessageInteractor(
      repo as never,
      usageService() as never,
      mockEntitlementService(),
    ).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: currentText,
      pageContext: { route: "/en/contacts" },
      locale: "de",
      retry: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.disposition !== "run") return;
    expect(result.data.messages[0]?.text).toHaveLength(1200);
    expect(result.data.messages[1]?.text).toBe(`<page_context route="/en/contacts"/>\n${currentText}`);
    expect(result.data.locale).toBe("de");
    expect(repo.createAgentTurnRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: CONVERSATION_ID,
        text: currentText,
        pageRoute: "/en/contacts",
        userMessageId: expect.any(String),
      }),
    );
    expect(repo.claimAgentRunLease).toHaveBeenCalledWith(expect.any(String), expect.any(Date));
  });

  it("checks reservation headroom only after replay admission", async () => {
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn(),
    };
    const usage = usageService();
    usage.prepareTurn.mockResolvedValue({
      summary: {
        creditsUsed: 500,
        creditsRemaining: 0,
        creditsLimit: 500,
        usedPct: 100,
        plan: "pro",
        periodStart: new Date("2026-08-01T00:00:00Z"),
        resetAt: new Date("2026-09-01T00:00:00Z"),
        recentTurnCredits: 1,
        blockedReason: "credits_exhausted",
      },
      reservation: null,
    });

    await expect(
      new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "hello",
        retry: false,
      }),
    ).rejects.toBeInstanceOf(AgentLimitExceededError);

    expect(repo.findAgentTurnRequestForAdmission).toHaveBeenCalledBefore(usage.prepareTurn);
    expect(repo.claimAgentRunLease).not.toHaveBeenCalled();
  });

  it("continues only an explicitly owned conversation and never silently switches chats", async () => {
    let persistedUserMessageId = "";
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      createConversation: vi.fn(),
      createAgentTurnRequest: vi.fn().mockImplementation((args) => {
        persistedUserMessageId = args.userMessageId;
        return Promise.resolve();
      }),
      touchConversation: vi.fn().mockResolvedValue(undefined),
      listRecentMessages: vi.fn().mockImplementation(() =>
        Promise.resolve([
          {
            id: persistedUserMessageId,
            role: "user",
            parts: [{ type: "text", text: "continue" }],
          },
        ]),
      ),
    };

    const result = await new SendAgentMessageInteractor(
      repo as never,
      usageService() as never,
      mockEntitlementService(),
    ).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      conversationId: CONVERSATION_ID,
      text: "continue",
      retry: false,
    });

    expect(result.ok && result.data.disposition).toBe("run");
    expect(repo.findConversation).toHaveBeenCalledWith(CONVERSATION_ID);
    expect(repo.createConversation).not.toHaveBeenCalled();
  });

  it("carries bounded prior user intent into a multi-turn action tool profile", async () => {
    let persistedUserMessageId = "";
    let messageRead = 0;
    const priorMessage = {
      id: "prior-user-message",
      role: "user",
      parts: [{ type: "text", text: "Please create a contact for this customer." }],
    };
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      createAgentTurnRequest: vi.fn().mockImplementation((args) => {
        persistedUserMessageId = args.userMessageId;
        return Promise.resolve();
      }),
      touchConversation: vi.fn().mockResolvedValue(undefined),
      listRecentMessages: vi.fn().mockImplementation(() => {
        messageRead += 1;
        return Promise.resolve(
          messageRead === 1
            ? [priorMessage]
            : [
                priorMessage,
                {
                  id: persistedUserMessageId,
                  role: "user",
                  parts: [{ type: "text", text: "Alice Smith" }],
                },
              ],
        );
      }),
    };

    const result = await new SendAgentMessageInteractor(
      repo as never,
      usageService() as never,
      mockEntitlementService(),
    ).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      conversationId: CONVERSATION_ID,
      text: "Alice Smith",
      pageContext: { route: "/en/contacts" },
      retry: false,
    });

    expect(result.ok && result.data.disposition).toBe("run");
    if (!result.ok || result.data.disposition !== "run") return;
    expect(result.data.toolNames).toEqual(expect.arrayContaining(["create_contacts", "update_contacts"]));
    expect(repo.listRecentMessages).toHaveBeenCalledTimes(2);
  });

  it("replays a completed turn before budget, lease, reservation, or provider work", async () => {
    const usage = usageService();
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue({
        snapshot: {
          id: "turn-1",
          conversationId: CONVERSATION_ID,
          clientRequestId: CLIENT_REQUEST_ID,
          text: "same",
          pageRoute: null,
          status: "completed",
          runId: "run-1",
          attemptCount: 1,
          providerStartedAt: new Date(),
          userMessageId: MESSAGE_ID,
          assistantMessageId: "assistant-1",
          terminalCode: "completed",
          affectedResources: ["contacts"],
          hasLaterMessages: false,
        },
        assistantMessage: {
          id: "assistant-1",
          parts: [{ type: "text", text: 'Done <page_context route="/secret"/>' }],
          createdAt: new Date(0),
        },
      }),
      claimAgentRunLease: vi.fn(),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke(
      {
        clientRequestId: CLIENT_REQUEST_ID,
        text: "same",
        retry: false,
      },
    );

    expect(result.ok && result.data.disposition).toBe("completedReplay");
    if (!result.ok || result.data.disposition !== "completedReplay") return;
    expect(result.data.assistantMessage.parts).toEqual([{ type: "text", text: "Done " }]);
    expect(usage.prepareTurn).not.toHaveBeenCalled();
    expect(usage.reserveUsage).not.toHaveBeenCalled();
    expect(repo.claimAgentRunLease).not.toHaveBeenCalled();
  });

  it("fails closed when a completed replay has no client-renderable canonical content", async () => {
    const usage = usageService();
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue({
        snapshot: {
          id: "turn-1",
          conversationId: CONVERSATION_ID,
          clientRequestId: CLIENT_REQUEST_ID,
          text: "same",
          pageRoute: null,
          status: "completed",
          runId: "run-1",
          attemptCount: 1,
          providerStartedAt: new Date(),
          userMessageId: MESSAGE_ID,
          assistantMessageId: "assistant-1",
          terminalCode: "completed",
          affectedResources: [],
          hasLaterMessages: false,
        },
        assistantMessage: {
          id: "assistant-1",
          parts: [{ type: "text", text: '<page_context route="/secret"/>' }],
          createdAt: new Date(0),
        },
      }),
      claimAgentRunLease: vi.fn(),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke(
      {
        clientRequestId: CLIENT_REQUEST_ID,
        text: "same",
        retry: false,
      },
    );

    expect(result.ok && result.data.disposition).toBe("uncertain");
    expect(usage.prepareTurn).not.toHaveBeenCalled();
    expect(repo.claimAgentRunLease).not.toHaveBeenCalled();
  });

  it("retries only a failed pre-provider turn and reuses its durable user message", async () => {
    const failedTurn = {
      id: "turn-1",
      conversationId: CONVERSATION_ID,
      clientRequestId: CLIENT_REQUEST_ID,
      text: "retry this",
      pageRoute: null,
      status: "failed",
      runId: "run-1",
      attemptCount: 1,
      providerStartedAt: null,
      userMessageId: MESSAGE_ID,
      assistantMessageId: null,
      terminalCode: null,
      affectedResources: [],
      hasLaterMessages: false,
    };
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue({ snapshot: failedTurn, assistantMessage: null }),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      retryAgentTurnRequest: vi.fn().mockResolvedValue(true),
      createAgentTurnRequest: vi.fn(),
      touchConversation: vi.fn().mockResolvedValue(undefined),
      listRecentMessages: vi.fn().mockResolvedValue([
        {
          id: MESSAGE_ID,
          role: "user",
          parts: [{ type: "text", text: "retry this" }],
        },
      ]),
    };

    const result = await new SendAgentMessageInteractor(
      repo as never,
      usageService() as never,
      mockEntitlementService(),
    ).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "retry this",
      retry: true,
    });

    expect(result.ok && result.data.disposition).toBe("run");
    expect(repo.retryAgentTurnRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        turnRequestId: "turn-1",
        priorRunId: "run-1",
        priorAttemptCount: 1,
      }),
    );
    expect(repo.createAgentTurnRequest).not.toHaveBeenCalled();
    expect(result.ok && result.data.disposition === "run" && result.data.userMessageId).toBe(MESSAGE_ID);
  });

  it("returns a conflict for reused request data without touching budget or persistence", async () => {
    const usage = usageService();
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue({
        snapshot: {
          id: "turn-1",
          conversationId: CONVERSATION_ID,
          clientRequestId: CLIENT_REQUEST_ID,
          text: "original",
          pageRoute: null,
          status: "failed",
          runId: "run-1",
          attemptCount: 1,
          providerStartedAt: null,
          userMessageId: MESSAGE_ID,
          assistantMessageId: null,
          terminalCode: null,
          affectedResources: [],
          hasLaterMessages: false,
        },
        assistantMessage: null,
      }),
      claimAgentRunLease: vi.fn(),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke(
      {
        clientRequestId: CLIENT_REQUEST_ID,
        text: "different",
        retry: true,
      },
    );

    expect(result.ok && result.data.disposition).toBe("conflict");
    expect(usage.prepareTurn).not.toHaveBeenCalled();
    expect(repo.claimAgentRunLease).not.toHaveBeenCalled();
  });

  it("rejects an archived or foreign conversation before persisting the turn", async () => {
    const usage = usageService();
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      findConversation: vi.fn().mockResolvedValue(null),
      createConversation: vi.fn(),
      createAgentTurnRequest: vi.fn(),
    };

    await expect(
      new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: CONVERSATION_ID,
        text: "continue",
        retry: false,
      }),
    ).rejects.toBeInstanceOf(AgentSessionUnavailableError);
    expect(repo.createConversation).not.toHaveBeenCalled();
    expect(repo.createAgentTurnRequest).not.toHaveBeenCalled();
    expect(usage.prepareTurn).not.toHaveBeenCalled();
    expect(usage.reserveUsage).not.toHaveBeenCalled();
    expect(repo.claimAgentRunLease).not.toHaveBeenCalled();
  });

  it("rejects a second concurrent turn before persisting another turn", async () => {
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(false),
      createConversation: vi.fn(),
      createAgentTurnRequest: vi.fn(),
    };

    await expect(
      new SendAgentMessageInteractor(repo as never, usageService() as never, mockEntitlementService()).invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "hello",
        retry: false,
      }),
    ).rejects.toBeInstanceOf(AgentSessionUnavailableError);
    expect(repo.createConversation).not.toHaveBeenCalled();
    expect(repo.createAgentTurnRequest).not.toHaveBeenCalled();
  });

  it("releases the reservation and lease when pre-provider persistence fails", async () => {
    const failure = new Error("conversation persistence failed");
    const usage = usageService();
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      createConversation: vi.fn().mockRejectedValue(failure),
      releaseAgentRunLeaseUnscoped: vi.fn().mockResolvedValue(undefined),
    };

    await expect(
      new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "hello",
        retry: false,
      }),
    ).rejects.toBe(failure);

    const reservation = usage.reserveUsage.mock.calls[0]?.[0];
    expect(reservation).toEqual(
      expect.objectContaining({
        companyId: mockUser.companyId,
        userId: mockUser.id,
        reservationId: expect.any(String),
      }),
    );
    expect(usage.releaseReservation).toHaveBeenCalledWith({
      reservationId: reservation?.reservationId,
      companyId: mockUser.companyId,
      userId: mockUser.id,
    });
    expect(repo.releaseAgentRunLeaseUnscoped).toHaveBeenCalledWith({
      companyId: mockUser.companyId,
      userId: mockUser.id,
      runId: reservation?.reservationId,
    });
  });

  it("allows a signed-in non-admin to load their conversation", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID, title: "Hello" }),
      markConversationRead: vi.fn().mockResolvedValue(undefined),
      listMessagePage: vi.fn().mockResolvedValue(
        messagePage([
          {
            id: "m1",
            role: "assistant",
            parts: [
              {
                type: "tool_use",
                id: "tool-1",
                name: "list_records",
                input: { entity: "contact", accountId: "private-uuid" },
                resultPreview: "private-result",
                status: "done",
              },
              { type: "text", text: "Hello" },
            ],
            createdAt: new Date(0),
          },
        ]),
      ),
    };

    const result = await new GetAgentConversationInteractor(repo as never, mockEntitlementService()).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.messages[0]?.parts).toEqual([
      {
        type: "activity",
        id: "tool-1",
        activity: expect.objectContaining({
          kind: "records.read",
          resource: "contacts",
        }),
        status: "done",
      },
      { type: "text", text: "Hello" },
    ]);
    expect(JSON.stringify(result.data)).not.toContain("private-uuid");
    expect(JSON.stringify(result.data)).not.toContain("private-result");
    expect(repo.markConversationRead).not.toHaveBeenCalled();
  });

  it("strips only the legacy server-injected page context prefix from user messages", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({
        id: CONVERSATION_ID,
        title: '\uFEFF <page_context route="/en/dashboard"/>\nLegacy title',
      }),
      listMessagePage: vi.fn().mockResolvedValue(
        messagePage([
          {
            id: "m1",
            role: "user",
            parts: [
              {
                type: "text",
                text: '<page_context route="/en/dashboard"/>\nShow 00000000-0000-4000-8000-000000000123 around <page_context route="typed-by-user"/>',
              },
            ],
            createdAt: new Date(0),
          },
        ]),
      ),
    };

    const result = await new GetAgentConversationInteractor(repo as never, mockEntitlementService()).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(result.ok && result.data.messages[0]?.parts).toEqual([
      {
        type: "text",
        text: 'Show 00000000-0000-4000-8000-000000000123 around <page_context route="typed-by-user"/>',
      },
    ]);
    expect(result.ok && result.data.title).toBe("Legacy title");
  });

  it("records UI feedback only for an owned conversation", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      recordUiCommandResult: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new RespondToUiCommandInteractor(repo as never, mockEntitlementService()).invoke({
      conversationId: CONVERSATION_ID,
      commandId: "command-1",
      name: "navigate",
      ok: true,
      result: "Navigated to /contacts.",
    });

    expect(result.ok).toBe(true);
    expect(repo.recordUiCommandResult).toHaveBeenCalledOnce();
  });
});

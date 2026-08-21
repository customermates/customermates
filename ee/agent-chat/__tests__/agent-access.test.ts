import { beforeEach, describe, expect, it, vi } from "vitest";
import * as Sentry from "@sentry/nextjs";
import { z } from "zod";

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
  env: {
    ...MOCK_ENV_MODULE.env,
    APP_MODE: "cloud" as const,
    AGENT_MODEL: "anthropic:claude-test",
  },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: () => Promise.resolve({ raw: (key: string) => key }),
}));
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setTag: vi.fn(),
  setUser: vi.fn(),
}));

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
        reservedCredits: 44,
        planSnapshot: "pro",
        subscriptionStatusSnapshot: "active",
        allowanceCreditsSnapshot: 500,
        periodStart: summary.periodStart,
        periodEnd: summary.resetAt,
        budget: {
          reservedCredits: 44,
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

  it("denies a direct send invocation before admission or usage work when the kill switch is active", async () => {
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn(),
      findAgentTurnRequestForAdmission: vi.fn(),
      claimAgentRunLease: vi.fn(),
      admitAgentTurnOrThrow: vi.fn(),
    };
    const usage = usageService();
    const entitlements = {
      require: vi.fn().mockResolvedValue({
        ok: false,
        error: new z.ZodError([
          {
            code: "custom",
            path: [],
            message: "The Assistant is unavailable.",
          },
        ]),
        code: "agentChatDisabled",
      }),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usage as never, entitlements as never).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "hello",
      retry: false,
    });

    expect(result.ok).toBe(false);
    expect(entitlements.require).toHaveBeenCalledWith("agentChat");
    expect(repo.normalizeExpiredAgentRunLease).not.toHaveBeenCalled();
    expect(repo.findAgentTurnRequestForAdmission).not.toHaveBeenCalled();
    expect(usage.prepareTurn).not.toHaveBeenCalled();
    expect(usage.reserveUsage).not.toHaveBeenCalled();
  });

  it("admits a new turn, keeps page context private, and preserves the complete current message", async () => {
    const currentText = "x".repeat(2000);
    let persistedUserMessageId = "";
    const usage = usageService();
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      admitAgentTurnOrThrow: vi.fn().mockImplementation((args) => {
        persistedUserMessageId = args.turn.userMessageId;
        return Promise.resolve({
          conversationId: CONVERSATION_ID,
          userMessageId: persistedUserMessageId,
          recentMessages: [
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
          ],
        });
      }),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke(
      {
        clientRequestId: CLIENT_REQUEST_ID,
        text: currentText,
        pageContext: { route: "/en/contacts" },
        locale: "de",
        retry: false,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok || result.data.disposition !== "run") return;
    expect(result.data.messages[0]?.text).toHaveLength(1200);
    expect(result.data.messages[1]?.text).toBe(`<page_context route="/en/contacts"/>\n${currentText}`);
    expect(result.data.locale).toBe("de");
    expect(repo.admitAgentTurnOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: null,
        runId: expect.any(String),
        turn: expect.objectContaining({
          kind: "create",
          clientRequestId: CLIENT_REQUEST_ID,
          text: currentText,
          pageRoute: "/en/contacts",
          userMessageId: expect.any(String),
        }),
      }),
    );
    expect(repo.claimAgentRunLease).toHaveBeenCalledWith(expect.any(String), expect.any(Date));
    expect(repo.claimAgentRunLease).toHaveBeenCalledBefore(usage.reserveUsage);
    expect(usage.reserveUsage).toHaveBeenCalledBefore(repo.admitAgentTurnOrThrow);
    expect(MOCK_PRISMA_DB_MODULE.prisma.$transaction).toHaveBeenCalledOnce();
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

    const result = await new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke(
      {
        clientRequestId: CLIENT_REQUEST_ID,
        text: "hello",
        retry: false,
      },
    );

    expect(result).toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "agentLimitReached" } }] },
    });

    expect(repo.findAgentTurnRequestForAdmission).toHaveBeenCalledBefore(usage.prepareTurn);
    expect(repo.claimAgentRunLease).not.toHaveBeenCalled();
  });

  it("continues only an explicitly owned conversation and never silently switches chats", async () => {
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      listRecentMessages: vi.fn().mockResolvedValue([]),
      admitAgentTurnOrThrow: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          conversationId: CONVERSATION_ID,
          userMessageId: args.turn.userMessageId,
          recentMessages: [
            {
              id: args.turn.userMessageId,
              role: "user",
              parts: [{ type: "text", text: "continue" }],
            },
          ],
        }),
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
    expect(repo.admitAgentTurnOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: CONVERSATION_ID }),
    );
  });

  it("does not query prior messages to decide which capabilities are available", async () => {
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      listRecentMessages: vi.fn(),
      admitAgentTurnOrThrow: vi.fn().mockImplementation((args) =>
        Promise.resolve({
          conversationId: CONVERSATION_ID,
          userMessageId: args.turn.userMessageId,
          recentMessages: [
            {
              id: args.turn.userMessageId,
              role: "user",
              parts: [{ type: "text", text: "Decide yourself." }],
            },
          ],
        }),
      ),
    };

    const usage = usageService();
    const result = await new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke(
      {
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: CONVERSATION_ID,
        text: "Decide yourself.",
        pageContext: { route: "/en/organizations" },
        retry: false,
      },
    );

    expect(result.ok && result.data.disposition).toBe("run");
    if (!result.ok || result.data.disposition !== "run") return;
    expect(result.data).not.toHaveProperty("toolNames");
    expect(repo.listRecentMessages).not.toHaveBeenCalled();
    expect(usage.prepareTurn).toHaveBeenCalledWith(mockUser.id, expect.any(Date), expect.any(Number), 4);
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
    expect(MOCK_PRISMA_DB_MODULE.prisma.$transaction).not.toHaveBeenCalled();
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
      listRecentMessages: vi.fn().mockResolvedValue([
        {
          id: MESSAGE_ID,
          role: "user",
          parts: [{ type: "text", text: "retry this" }],
        },
      ]),
      admitAgentTurnOrThrow: vi.fn().mockResolvedValue({
        conversationId: CONVERSATION_ID,
        userMessageId: MESSAGE_ID,
        recentMessages: [
          {
            id: MESSAGE_ID,
            role: "user",
            parts: [{ type: "text", text: "retry this" }],
          },
        ],
      }),
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
    expect(repo.admitAgentTurnOrThrow).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONVERSATION_ID,
        turn: {
          kind: "retry",
          turnRequestId: "turn-1",
          priorRunId: "run-1",
          priorAttemptCount: 1,
          userMessageId: MESSAGE_ID,
        },
      }),
    );
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
      admitAgentTurnOrThrow: vi.fn(),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke(
      {
        clientRequestId: CLIENT_REQUEST_ID,
        conversationId: CONVERSATION_ID,
        text: "continue",
        retry: false,
      },
    );
    expect(result).toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "agentConversationNotFound" } }] },
    });
    expect(repo.admitAgentTurnOrThrow).not.toHaveBeenCalled();
    expect(usage.prepareTurn).not.toHaveBeenCalled();
    expect(usage.reserveUsage).not.toHaveBeenCalled();
    expect(repo.claimAgentRunLease).not.toHaveBeenCalled();
  });

  it("rejects a second concurrent turn before persisting another turn", async () => {
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(false),
      admitAgentTurnOrThrow: vi.fn(),
      releasePreProviderAdmissionOrThrowUnscoped: vi.fn().mockResolvedValue({ disposition: "released" }),
    };

    const result = await new SendAgentMessageInteractor(
      repo as never,
      usageService() as never,
      mockEntitlementService(),
    ).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "hello",
      retry: false,
    });
    expect(result).toMatchObject({
      ok: false,
      error: { issues: [{ params: { error: "agentTurnAlreadyRunning" } }] },
    });
    expect(repo.admitAgentTurnOrThrow).not.toHaveBeenCalled();
    expect(repo.releasePreProviderAdmissionOrThrowUnscoped).not.toHaveBeenCalled();
  });

  it("atomically cleans up phase-one state when chat admission fails", async () => {
    const failure = new Error("conversation persistence failed");
    const usage = usageService();
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      admitAgentTurnOrThrow: vi.fn().mockRejectedValue(failure),
      releasePreProviderAdmissionOrThrowUnscoped: vi.fn().mockResolvedValue({ disposition: "released" }),
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
    expect(repo.releasePreProviderAdmissionOrThrowUnscoped).toHaveBeenCalledWith({
      companyId: mockUser.companyId,
      userId: mockUser.id,
      runId: reservation?.reservationId,
    });
  });

  it("does not admit a chat turn when phase-one credit reservation fails", async () => {
    const failure = new Error("credit reservation failed");
    const usage = usageService();
    usage.reserveUsage.mockRejectedValue(failure);
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      admitAgentTurnOrThrow: vi.fn(),
      releasePreProviderAdmissionOrThrowUnscoped: vi.fn().mockResolvedValue({ disposition: "released" }),
    };

    await expect(
      new SendAgentMessageInteractor(repo as never, usage as never, mockEntitlementService()).invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "hello",
        retry: false,
      }),
    ).rejects.toBe(failure);

    expect(repo.claimAgentRunLease).toHaveBeenCalledBefore(usage.reserveUsage);
    expect(repo.admitAgentTurnOrThrow).not.toHaveBeenCalled();
    expect(repo.releasePreProviderAdmissionOrThrowUnscoped).toHaveBeenCalledWith({
      companyId: mockUser.companyId,
      userId: mockUser.id,
      runId: expect.any(String),
    });
  });

  it("reports cleanup failure without replacing the admission error", async () => {
    const admissionFailure = new Error("admission failed");
    const cleanupFailure = new Error("cleanup failed");
    const repo = {
      normalizeExpiredAgentRunLease: vi.fn().mockResolvedValue(undefined),
      findAgentTurnRequestForAdmission: vi.fn().mockResolvedValue(null),
      claimAgentRunLease: vi.fn().mockResolvedValue(true),
      admitAgentTurnOrThrow: vi.fn().mockRejectedValue(admissionFailure),
      releasePreProviderAdmissionOrThrowUnscoped: vi.fn().mockRejectedValue(cleanupFailure),
    };

    await expect(
      new SendAgentMessageInteractor(repo as never, usageService() as never, mockEntitlementService()).invoke({
        clientRequestId: CLIENT_REQUEST_ID,
        text: "hello",
        retry: false,
      }),
    ).rejects.toBe(admissionFailure);

    expect(Sentry.captureException).toHaveBeenCalledWith(cleanupFailure, {
      tags: { kind: "agent-admission-cleanup-failure" },
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

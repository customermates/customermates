import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockUserWithPermissions } from "@/tests/helpers/mock-user";
import {
  createMockDiModule,
  MOCK_ENV_MODULE,
  MOCK_PRISMA_DB_MODULE,
  MOCK_ZOD_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUserWithPermissions([]);

vi.mock("@/env", () => ({
  env: { ...MOCK_ENV_MODULE.env, AGENT_MODEL: "anthropic:claude-test" },
}));
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

import { AgentLimitExceededError, AgentSessionUnavailableError, ForbiddenError } from "@/core/errors/app-errors";

import { GetAgentConversationInteractor } from "../get-agent-conversation.interactor";
import { RespondToApprovalInteractor } from "../respond-to-approval.interactor";
import { RespondToUiCommandInteractor } from "../respond-to-ui-command.interactor";
import { SendAgentMessageInteractor } from "../send-agent-message.interactor";
import { buildAgentWorkspaceSetupPlan } from "../agent-workspace-setup";

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
      getUserAgentSettingsOrThrow: vi.fn().mockResolvedValue({ preAuthorizedAgentTools: [] }),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usageService() as never).invoke({
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
      new SendAgentMessageInteractor(repo as never, usage as never).invoke({
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
      getUserAgentSettingsOrThrow: vi.fn().mockResolvedValue({ preAuthorizedAgentTools: [] }),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usageService() as never).invoke({
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
      getUserAgentSettingsOrThrow: vi.fn().mockResolvedValue({ preAuthorizedAgentTools: [] }),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usageService() as never).invoke({
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

    const result = await new SendAgentMessageInteractor(repo as never, usage as never).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "same",
      retry: false,
    });

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

    const result = await new SendAgentMessageInteractor(repo as never, usage as never).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "same",
      retry: false,
    });

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
      getUserAgentSettingsOrThrow: vi.fn().mockResolvedValue({ preAuthorizedAgentTools: [] }),
    };

    const result = await new SendAgentMessageInteractor(repo as never, usageService() as never).invoke({
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

    const result = await new SendAgentMessageInteractor(repo as never, usage as never).invoke({
      clientRequestId: CLIENT_REQUEST_ID,
      text: "different",
      retry: true,
    });

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
      new SendAgentMessageInteractor(repo as never, usage as never).invoke({
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
      new SendAgentMessageInteractor(repo as never, usageService() as never).invoke({
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
      new SendAgentMessageInteractor(repo as never, usage as never).invoke({
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

    const result = await new GetAgentConversationInteractor(
      repo as never,
      { listConversationSetupStates: vi.fn(() => Promise.resolve([])) } as never,
    ).invoke({ conversationId: CONVERSATION_ID });

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

    const result = await new GetAgentConversationInteractor(
      repo as never,
      { listConversationSetupStates: vi.fn(() => Promise.resolve([])) } as never,
    ).invoke({ conversationId: CONVERSATION_ID });

    expect(result.ok && result.data.messages[0]?.parts).toEqual([
      {
        type: "text",
        text: 'Show 00000000-0000-4000-8000-000000000123 around <page_context route="typed-by-user"/>',
      },
    ]);
    expect(result.ok && result.data.title).toBe("Legacy title");
  });

  it("marks older unapplied setup reviews as superseded on reload", async () => {
    const setup = {
      useCase: "clientProjects" as const,
      businessName: "Acme",
      goal: "Track delivery",
    };
    const plan = buildAgentWorkspaceSetupPlan(setup);
    const setupPart = (id: string) => ({
      type: "workspace_setup",
      id,
      setup,
      plan,
      planHash: "a".repeat(64),
      status: "ready",
    });
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID, title: "Setup" }),
      listMessagePage: vi.fn().mockResolvedValue(
        messagePage([
          {
            id: "m1",
            role: "assistant",
            parts: [setupPart("older")],
            createdAt: new Date(0),
          },
          {
            id: "m2",
            role: "assistant",
            parts: [setupPart("latest")],
            createdAt: new Date(1),
          },
        ]),
      ),
    };
    const setupRepo = {
      listConversationSetupStates: vi.fn().mockResolvedValue([]),
    };

    const result = await new GetAgentConversationInteractor(repo as never, setupRepo as never).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(result.ok && result.data.messages.map((message) => message.parts)).toEqual([
      [expect.objectContaining({ id: "older", status: "superseded" })],
      [expect.objectContaining({ id: "latest", status: "ready" })],
    ]);
  });

  it("overlays durable partial cleanup state without rewriting assistant message JSON", async () => {
    const setup = {
      useCase: "clientProjects" as const,
      businessName: "Acme",
      goal: "Track delivery",
    };
    const plan = buildAgentWorkspaceSetupPlan(setup);
    const persistedPart = {
      type: "workspace_setup",
      id: "setup-command",
      setup,
      plan,
      planHash: "a".repeat(64),
      status: "ready",
    };
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID, title: "Setup" }),
      listMessagePage: vi.fn().mockResolvedValue(
        messagePage([
          {
            id: "m1",
            role: "assistant",
            parts: [persistedPart],
            createdAt: new Date(0),
          },
        ]),
      ),
    };
    const cleanupSummary = {
      deletedResources: 18,
      retainedResources: 2,
      missingResources: 0,
      retainedReasons: ["edited" as const, "dependent" as const],
    };
    const setupRepo = {
      listConversationSetupStates: vi.fn().mockResolvedValue([
        {
          setupId: "00000000-0000-4000-8000-000000000010",
          reviewMessageId: "m1",
          commandId: "setup-command",
          planHash: "a".repeat(64),
          status: "partiallyCleaned",
          cleanupSummary,
        },
      ]),
    };

    const result = await new GetAgentConversationInteractor(repo as never, setupRepo as never).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(result.ok && result.data.messages[0]?.parts).toEqual([
      expect.objectContaining({
        id: "setup-command",
        setupId: "00000000-0000-4000-8000-000000000010",
        status: "partiallyCleaned",
        cleanupSummary,
      }),
    ]);
    expect(persistedPart.status).toBe("ready");
  });

  it("does not bind durable setup state to a reused provider command id with a different plan hash", async () => {
    const setup = {
      useCase: "clientProjects" as const,
      businessName: "Acme",
      goal: "Track delivery",
    };
    const plan = buildAgentWorkspaceSetupPlan(setup);
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID, title: "Setup" }),
      listMessagePage: vi.fn().mockResolvedValue(
        messagePage([
          {
            id: "m2",
            role: "assistant",
            parts: [
              {
                type: "workspace_setup",
                id: "reused-command",
                setup,
                plan,
                planHash: "b".repeat(64),
                status: "ready",
              },
            ],
            createdAt: new Date(1),
          },
        ]),
      ),
    };
    const setupRepo = {
      listConversationSetupStates: vi.fn().mockResolvedValue([
        {
          setupId: "00000000-0000-4000-8000-000000000010",
          reviewMessageId: "m1",
          commandId: "reused-command",
          planHash: "a".repeat(64),
          status: "applied",
          cleanupSummary: null,
        },
      ]),
    };

    const result = await new GetAgentConversationInteractor(repo as never, setupRepo as never).invoke({
      conversationId: CONVERSATION_ID,
    });

    expect(result.ok && result.data.messages[0]?.parts).toEqual([
      expect.objectContaining({
        id: "reused-command",
        planHash: "b".repeat(64),
        status: "ready",
      }),
    ]);
  });

  it("allows an owned approval and records an always preference for a signed-in non-admin", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      resolvePendingApprovalRequest: vi.fn().mockResolvedValue({ toolName: "create_contacts", resolved: true }),
      getUserAgentSettingsOrThrow: vi.fn().mockResolvedValue({ preAuthorizedAgentTools: [] }),
      setPreAuthorizedAgentTools: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new RespondToApprovalInteractor(repo as never).invoke({
      conversationId: CONVERSATION_ID,
      requestId: "request-1",
      decision: "always",
    });

    expect(result.ok).toBe(true);
    expect(repo.setPreAuthorizedAgentTools).toHaveBeenCalledWith(["create_contacts"]);
    expect(repo.resolvePendingApprovalRequest).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      requestId: "request-1",
      decision: "approve",
      requireRememberable: true,
    });
  });

  it("removes legacy sensitive and duplicate preferences when recording Always allow", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      resolvePendingApprovalRequest: vi.fn().mockResolvedValue({ toolName: "update_deals", resolved: true }),
      getUserAgentSettingsOrThrow: vi.fn().mockResolvedValue({
        preAuthorizedAgentTools: ["delete_records", "create_contacts", "request_support", "create_contacts"],
      }),
      setPreAuthorizedAgentTools: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new RespondToApprovalInteractor(repo as never).invoke({
      conversationId: CONVERSATION_ID,
      requestId: "request-legacy",
      decision: "always",
    });

    expect(result.ok).toBe(true);
    expect(repo.setPreAuthorizedAgentTools).toHaveBeenCalledWith(["create_contacts", "update_deals"]);
  });

  it.each(["approve", "reject"] as const)("does not change remembered approvals on a one-time %s", async (decision) => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      resolvePendingApprovalRequest: vi.fn().mockResolvedValue({ toolName: "create_contacts", resolved: true }),
      getUserAgentSettingsOrThrow: vi.fn(),
      setPreAuthorizedAgentTools: vi.fn(),
    };

    const result = await new RespondToApprovalInteractor(repo as never).invoke({
      conversationId: CONVERSATION_ID,
      requestId: `request-${decision}`,
      decision,
    });

    expect(result.ok).toBe(true);
    expect(repo.resolvePendingApprovalRequest).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      requestId: `request-${decision}`,
      decision,
      requireRememberable: false,
    });
    expect(repo.getUserAgentSettingsOrThrow).not.toHaveBeenCalled();
    expect(repo.setPreAuthorizedAgentTools).not.toHaveBeenCalled();
  });

  it.each(["same-company other user", "different company"])(
    "rejects an always approval for a %s conversation before any mutation",
    async () => {
      const repo = {
        findConversation: vi.fn().mockResolvedValue(null),
        getUserAgentSettingsOrThrow: vi.fn(),
        setPreAuthorizedAgentTools: vi.fn(),
        resolvePendingApprovalRequest: vi.fn(),
      };

      await expect(
        new RespondToApprovalInteractor(repo as never).invoke({
          conversationId: CONVERSATION_ID,
          requestId: "request-2",
          decision: "always",
        }),
      ).rejects.toBeInstanceOf(AgentSessionUnavailableError);
      expect(repo.getUserAgentSettingsOrThrow).not.toHaveBeenCalled();
      expect(repo.setPreAuthorizedAgentTools).not.toHaveBeenCalled();
      expect(repo.resolvePendingApprovalRequest).not.toHaveBeenCalled();
    },
  );

  it.each([
    "delete_records",
    "manage_custom_columns",
    "manage_record_links",
    "manage_team",
    "manage_webhooks",
    "manage_widgets",
    "request_support",
    "send_email",
    "update_record_notes",
    "unknown_tool",
  ])("never stores persistent approval for sensitive or unknown action %s", async (toolName) => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      resolvePendingApprovalRequest: vi.fn().mockResolvedValue({ toolName, resolved: false }),
      getUserAgentSettingsOrThrow: vi.fn(),
      setPreAuthorizedAgentTools: vi.fn(),
    };

    await expect(
      new RespondToApprovalInteractor(repo as never).invoke({
        conversationId: CONVERSATION_ID,
        requestId: "request-sensitive",
        decision: "always",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(repo.resolvePendingApprovalRequest).toHaveBeenCalledWith({
      conversationId: CONVERSATION_ID,
      requestId: "request-sensitive",
      decision: "approve",
      requireRememberable: true,
    });
    expect(repo.getUserAgentSettingsOrThrow).not.toHaveBeenCalled();
    expect(repo.setPreAuthorizedAgentTools).not.toHaveBeenCalled();
  });

  it("rejects a forged or expired approval request before granting a preference", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      resolvePendingApprovalRequest: vi.fn().mockResolvedValue(null),
      getUserAgentSettingsOrThrow: vi.fn(),
      setPreAuthorizedAgentTools: vi.fn(),
    };

    await expect(
      new RespondToApprovalInteractor(repo as never).invoke({
        conversationId: CONVERSATION_ID,
        requestId: "forged-request",
        decision: "always",
      }),
    ).rejects.toBeInstanceOf(AgentSessionUnavailableError);
    expect(repo.getUserAgentSettingsOrThrow).not.toHaveBeenCalled();
    expect(repo.setPreAuthorizedAgentTools).not.toHaveBeenCalled();
  });

  it("records UI feedback only for an owned conversation", async () => {
    const repo = {
      findConversation: vi.fn().mockResolvedValue({ id: CONVERSATION_ID }),
      recordUiCommandResult: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new RespondToUiCommandInteractor(repo as never).invoke({
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

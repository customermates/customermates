import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser({
  id: "00000000-0000-4000-8000-000000000010",
  companyId: "00000000-0000-4000-8000-000000000011",
});

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);
vi.mock("next-intl/server", () => ({
  getTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    return Promise.resolve(Object.assign(t, { raw: t }));
  },
  getLocale: () => Promise.resolve("en"),
}));

import { ROUTINE_TRIGGER_EVENTS, UpsertRoutineSchema } from "../routine.schema";
import { RunRoutineNowInteractor } from "../run-routine-now.interactor";
import { FailRoutineRunInteractor } from "../fail-routine-run.interactor";
import { StartRoutineRunInteractor } from "../start-routine-run.interactor";
import { SweepDueRoutinesInteractor } from "../sweep-due-routines.interactor";
import { ReconcileRoutineRunsInteractor } from "../reconcile-routine-runs.interactor";
import { UpsertRoutineInteractor } from "../upsert-routine.interactor";
import { PruneRoutineRunsInteractor } from "../prune-routine-runs.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";
import { WebhookEventSchema } from "@/features/webhook/webhook.schema";
import { RoutineLimitExceededError, type RoutineCountLimit } from "../routine-run-limits";

const ROUTINE_ID = "00000000-0000-4000-8000-000000000001";
const RUN_ID = "00000000-0000-4000-8000-000000000002";

function issuesOf(input: unknown) {
  const result = UpsertRoutineSchema.safeParse(input);
  if (result.success) return [];

  return result.error.issues.map((issue) => ({
    error: issue.code === "custom" ? issue.params?.error : undefined,
    path: issue.path,
  }));
}

describe("UpsertRoutineSchema", () => {
  it("requires the core fields when creating", () => {
    expect(issuesOf({})).toEqual([
      { error: CustomErrorCode.mustNotBeBlank, path: ["name"] },
      { error: CustomErrorCode.mustNotBeBlank, path: ["prompt"] },
      { error: CustomErrorCode.mustNotBeBlank, path: ["triggerKind"] },
    ]);
  });

  it("requires a schedule for a scheduled routine", () => {
    expect(issuesOf({ name: "Daily", prompt: "Summarise", triggerKind: "schedule" })).toEqual([
      {
        error: CustomErrorCode.routineScheduleRequired,
        path: ["cronExpression"],
      },
    ]);
  });

  it("requires at least one event for an event routine", () => {
    expect(
      issuesOf({
        name: "React",
        prompt: "Do",
        triggerKind: "event",
        triggerEvents: [],
      }),
    ).toEqual([
      {
        error: CustomErrorCode.routineTriggerEventsRequired,
        path: ["triggerEvents"],
      },
    ]);
  });

  it("excludes messaging deletions that lack an access snapshot while keeping soft-deleted messages", () => {
    expect(WebhookEventSchema.options).toEqual(
      expect.arrayContaining(["messaging.email.deleted", "messaging.chat.deleted"]),
    );
    expect(ROUTINE_TRIGGER_EVENTS).toContain("messaging.message.deleted");
    expect(ROUTINE_TRIGGER_EVENTS).not.toContain("messaging.email.deleted");
    expect(ROUTINE_TRIGGER_EVENTS).not.toContain("messaging.chat.deleted");

    const routine = {
      name: "Deletion watcher",
      prompt: "Summarise the deletion",
      triggerKind: "event",
    } as const;
    expect(
      UpsertRoutineSchema.safeParse({
        ...routine,
        triggerEvents: ["messaging.message.deleted"],
      }).success,
    ).toBe(true);
    expect(
      UpsertRoutineSchema.safeParse({
        ...routine,
        triggerEvents: ["messaging.email.deleted"],
      }).success,
    ).toBe(false);
    expect(
      UpsertRoutineSchema.safeParse({
        ...routine,
        triggerEvents: ["messaging.chat.deleted"],
      }).success,
    ).toBe(false);
  });

  it("rejects an unparseable cron expression", () => {
    expect(
      issuesOf({
        name: "Bad",
        prompt: "Do",
        triggerKind: "schedule",
        cronExpression: "not a cron",
      }),
    ).toEqual([
      {
        error: CustomErrorCode.routineScheduleInvalid,
        path: ["cronExpression"],
      },
    ]);
  });

  it("rejects a schedule that breaches the interval floor", () => {
    expect(
      issuesOf({
        name: "Hot",
        prompt: "Do",
        triggerKind: "schedule",
        cronExpression: "* * * * *",
      }),
    ).toEqual([
      {
        error: CustomErrorCode.routineScheduleTooFrequent,
        path: ["cronExpression"],
      },
    ]);
  });

  it("rejects a clustered schedule whose average gap looks acceptable", () => {
    expect(
      issuesOf({
        name: "Burst",
        prompt: "Do",
        triggerKind: "schedule",
        cronExpression: "0,1 9 * * *",
      }),
    ).toEqual([
      {
        error: CustomErrorCode.routineScheduleTooFrequent,
        path: ["cronExpression"],
      },
    ]);
  });

  it("rejects an unknown time zone", () => {
    expect(
      issuesOf({
        name: "Zoned",
        prompt: "Do",
        triggerKind: "schedule",
        cronExpression: "0 9 * * *",
        timezone: "Mars/Olympus",
      }),
    ).toEqual([{ error: CustomErrorCode.routineTimeZoneInvalid, path: ["timezone"] }]);
  });

  it("accepts a complete scheduled routine", () => {
    expect(
      UpsertRoutineSchema.safeParse({
        name: "Daily digest",
        prompt: "Summarise yesterday",
        triggerKind: "schedule",
        cronExpression: "0 9 * * *",
        timezone: "Europe/Berlin",
      }).success,
    ).toBe(true);
  });

  it("allows a partial update without re-sending the schedule", () => {
    expect(UpsertRoutineSchema.safeParse({ id: ROUTINE_ID, enabled: false }).success).toBe(true);
  });
});

function routineFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: ROUTINE_ID,
    ownerUserId: mockUser.id,
    owner: {
      id: mockUser.id,
      firstName: mockUser.firstName,
      lastName: mockUser.lastName,
      avatarUrl: mockUser.avatarUrl,
      status: "active",
    },
    name: "Daily digest",
    prompt: "Summarise yesterday",
    modelKey: null,
    enabled: true,
    triggerKind: "schedule",
    cronExpression: "0 9 * * *",
    timezone: "UTC",
    runOnceAt: null,
    triggerEvents: [],
    changedFields: [],
    triggerFilters: [],
    debounceSeconds: 300,
    maxRunsPerHour: 4,
    maxCreditsPerRun: 10,
    nextRunAt: null,
    lastRunAt: null,
    lastRunStatus: null,
    disabledReason: null,
    suppressedEventCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("RunRoutineNowInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  function fixtures(overrides: Record<string, unknown> = {}) {
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(routineFixture(overrides)),
      createManualRoutineRunOrThrow: vi.fn().mockResolvedValue({
        id: RUN_ID,
        companyId: mockUser.companyId,
        executedByUserId: mockUser.id,
      }),
    };
    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };

    return { repo, background };
  }

  it("starts a manual test for a scheduled routine", async () => {
    const { repo, background } = fixtures();

    const result = await new RunRoutineNowInteractor(repo as never, background as never).invoke({
      routineId: ROUTINE_ID,
    });

    expect(result).toEqual({ ok: true, data: RUN_ID });
    expect(repo.createManualRoutineRunOrThrow).toHaveBeenCalledWith(ROUTINE_ID, mockUser.id, expect.any(Date));
    expect(background.dispatch).toHaveBeenCalledWith("run-routine", {
      routineRunId: RUN_ID,
      companyId: mockUser.companyId,
      ownerUserId: mockUser.id,
    });
  });

  it("rejects a context-free manual test for an event routine", async () => {
    const { repo, background } = fixtures({ triggerKind: "event" });

    const result = await new RunRoutineNowInteractor(repo as never, background as never).invoke({
      routineId: ROUTINE_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the event routine test to be rejected");
    expect(result.error.issues[0]).toMatchObject({
      path: ["routineId"],
      params: {
        error: CustomErrorCode.routineRunNowRequiresSchedule,
        kind: "conflict",
      },
    });
    expect(repo.createManualRoutineRunOrThrow).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("does not let a non-owner administrator test a routine", async () => {
    const { repo, background } = fixtures({
      ownerUserId: "00000000-0000-4000-8000-000000000099",
      triggerKind: "event",
    });

    const result = await new RunRoutineNowInteractor(repo as never, background as never).invoke({
      routineId: ROUTINE_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the non-owner routine test to be rejected");
    expect(result.error.issues[0]).toMatchObject({
      params: {
        error: CustomErrorCode.routineRunNotOwner,
        kind: "authorization",
      },
    });
    expect(repo.createManualRoutineRunOrThrow).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("requires an active scheduled routine before spending credits on a test", async () => {
    const { repo, background } = fixtures({ enabled: false });

    const result = await new RunRoutineNowInteractor(repo as never, background as never).invoke({
      routineId: ROUTINE_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the paused routine test to be rejected");
    expect(result.error.issues[0]).toMatchObject({
      path: ["routineId"],
      params: {
        error: CustomErrorCode.routineTestRequiresEnabled,
        kind: "conflict",
      },
    });
    expect(repo.createManualRoutineRunOrThrow).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });
});

describe("FailRoutineRunInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  function fixtures(executedByUserId = mockUser.id) {
    const repo = {
      findRoutineRunForStartUnscoped: vi.fn().mockResolvedValue({
        id: RUN_ID,
        executedByUserId,
        status: "queued",
        routine: { id: ROUTINE_ID },
      }),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    };

    return { repo, interactor: new FailRoutineRunInteractor(repo as never) };
  }

  it("does not let a stale workflow payload block another executor's run", async () => {
    const { repo, interactor } = fixtures("00000000-0000-4000-8000-000000000099");

    await interactor.invoke({
      routineRunId: RUN_ID,
      expectedExecutorUserId: mockUser.id,
      reason: "startFailed",
    });

    expect(repo.settleRoutineRunUnscoped).not.toHaveBeenCalled();
  });

  it("blocks a queued run when its snapshotted executor cannot start it", async () => {
    const { repo, interactor } = fixtures();

    await interactor.invoke({
      routineRunId: RUN_ID,
      expectedExecutorUserId: mockUser.id,
      reason: "ownerInactive",
    });

    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith({
      routineRunId: RUN_ID,
      routineId: ROUTINE_ID,
      expectedStatus: "queued",
      expectedTurnRequestId: null,
      status: "blocked",
      error: "ownerInactive",
      now: expect.any(Date),
    });
  });

  it("blocks a claimed run only while it still has no admitted turn", async () => {
    const { repo, interactor } = fixtures();
    repo.findRoutineRunForStartUnscoped.mockResolvedValue({
      id: RUN_ID,
      executedByUserId: mockUser.id,
      status: "running",
      routine: { id: ROUTINE_ID },
    });

    await interactor.invoke({
      routineRunId: RUN_ID,
      expectedExecutorUserId: mockUser.id,
      reason: "startFailed",
    });

    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith({
      routineRunId: RUN_ID,
      routineId: ROUTINE_ID,
      expectedStatus: "running",
      expectedTurnRequestId: null,
      status: "blocked",
      error: "startFailed",
      now: expect.any(Date),
    });
  });
});

function startFixtures(
  overrides: {
    run?: Record<string, unknown>;
    routine?: Record<string, unknown>;
  } = {},
) {
  const claimedRoutine = routineFixture(overrides.routine);
  const repo = {
    findRoutineRunForStartUnscoped: vi.fn().mockResolvedValue({
      id: RUN_ID,
      companyId: mockUser.companyId,
      executedByUserId: mockUser.id,
      status: "queued",
      triggerEvent: null,
      triggerEntityId: null,
      triggerPayload: null,
      routine: claimedRoutine,
      ...overrides.run,
    }),
    countRecentRoutineRunsUnscoped: vi.fn().mockResolvedValue(0),
    claimQueuedRoutineRunForOwnerUnscoped: vi.fn().mockResolvedValue({ routine: claimedRoutine }),
    markRoutineRunStartedUnscoped: vi.fn().mockResolvedValue(true),
    settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
  };
  const conversations = {
    createAndLinkRoutineConversationForRun: vi.fn().mockResolvedValue(undefined),
    deleteUnusedAgentConversation: vi.fn().mockResolvedValue(undefined),
  };
  const filterMatcher = {
    matchesCurrentUser: vi.fn().mockResolvedValue(true),
    matchesUserUnscoped: vi.fn().mockResolvedValue(true),
    canUserAccessUnscoped: vi.fn().mockResolvedValue(true),
  };
  const sendAgentMessage = {
    invokeRoutine: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        disposition: "run",
        conversationId: "00000000-0000-4000-8000-000000000009",
        turnRequestId: "00000000-0000-4000-8000-00000000000a",
      },
    }),
  };

  return { repo, conversations, sendAgentMessage, filterMatcher };
}

describe("StartRoutineRunInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts the turn in a routine-origin conversation", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({ ok: true, data: { started: true } });
    expect(conversations.createAndLinkRoutineConversationForRun).toHaveBeenCalledWith(
      expect.objectContaining({
        routineRunId: RUN_ID,
        title: "Daily digest",
        creditCeiling: 10,
      }),
    );
    expect(sendAgentMessage.invokeRoutine).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: RUN_ID }));
    expect(conversations.createAndLinkRoutineConversationForRun).toHaveBeenCalledBefore(sendAgentMessage.invokeRoutine);
    expect(repo.markRoutineRunStartedUnscoped).toHaveBeenCalled();
  });

  it("does not send when the run cannot be atomically linked to its routine conversation", async () => {
    const { conversations, repo, sendAgentMessage, filterMatcher } = startFixtures();
    conversations.createAndLinkRoutineConversationForRun.mockRejectedValue(new Error("Routine run changed"));
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    await expect(interactor.invoke({ routineRunId: RUN_ID })).rejects.toThrow("Routine run changed");

    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
    expect(conversations.deleteUnusedAgentConversation).not.toHaveBeenCalled();
  });

  it("uses the configuration returned by the atomic claim instead of the stale preflight read", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({
      run: {
        routine: routineFixture({
          name: "Old name",
          prompt: "Old prompt",
          maxCreditsPerRun: 99,
        }),
      },
      routine: {
        name: "Claimed name",
        prompt: "Claimed prompt",
        maxCreditsPerRun: 3,
      },
    });
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    await interactor.invoke({ routineRunId: RUN_ID });

    expect(conversations.createAndLinkRoutineConversationForRun).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Claimed name", creditCeiling: 3 }),
    );
    expect(sendAgentMessage.invokeRoutine).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Claimed prompt"),
      }),
    );
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining("Old prompt") }),
    );
  });

  it("does not start a run that is no longer queued", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({ run: { status: "running" } });
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "runNotQueued" },
    });
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("does not spend credits when a stale workflow payload names a different executor", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({
      run: { executedByUserId: "00000000-0000-4000-8000-000000000099" },
    });
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "executorMismatch" },
    });
    expect(repo.claimQueuedRoutineRunForOwnerUnscoped).not.toHaveBeenCalled();
    expect(conversations.createAndLinkRoutineConversationForRun).not.toHaveBeenCalled();
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("skips a disabled routine", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({ routine: { enabled: false } });
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "routineDisabled" },
    });
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("leaves chat capacity for the owner by capping in-flight routine runs", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    repo.claimQueuedRoutineRunForOwnerUnscoped.mockResolvedValue("ownerRunLimit");
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "ownerRunLimit" },
    });
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("enforces the hourly run ceiling", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    repo.countRecentRoutineRunsUnscoped.mockResolvedValue(5);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "hourlyRunLimit" },
    });
  });

  it("refuses to spend anything when the run was already claimed by another dispatch", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    repo.claimQueuedRoutineRunForOwnerUnscoped.mockResolvedValue("runNotQueued");
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "runAlreadyClaimed" },
    });
    expect(conversations.createAndLinkRoutineConversationForRun).not.toHaveBeenCalled();
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("does not spend anything when the routine trigger changed before the queued run was claimed", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    repo.claimQueuedRoutineRunForOwnerUnscoped.mockResolvedValue("triggerChanged");
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "triggerChanged" },
    });
    expect(conversations.createAndLinkRoutineConversationForRun).not.toHaveBeenCalled();
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("caps the turn budget with the routine's per-run credit ceiling", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({
      routine: { maxCreditsPerRun: 3 },
    });
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    await interactor.invoke({ routineRunId: RUN_ID });

    expect(conversations.createAndLinkRoutineConversationForRun).toHaveBeenCalledWith(
      expect.objectContaining({ creditCeiling: 3 }),
    );
  });

  it("skips a run whose record no longer matches the routine's conditions", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({
      run: { triggerEvent: "contact.updated", triggerEntityId: "contact-1" },
      routine: {
        triggerFilters: [{ field: "stage", operator: "equals", value: "won" }],
      },
    });
    filterMatcher.matchesCurrentUser.mockResolvedValue(false);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "filtersNotMatched" },
    });
    expect(repo.claimQueuedRoutineRunForOwnerUnscoped).toHaveBeenCalled();
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("rechecks record visibility even when an event routine has no filters", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({
      run: { triggerEvent: "contact.updated", triggerEntityId: "contact-1" },
    });
    filterMatcher.matchesCurrentUser.mockResolvedValue(false);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(filterMatcher.matchesCurrentUser).toHaveBeenCalledWith({
      event: "contact.updated",
      entityId: "contact-1",
      triggerPayload: null,
      filters: [],
    });
    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "filtersNotMatched" },
    });
    expect(sendAgentMessage.invokeRoutine).not.toHaveBeenCalled();
  });

  it("fails a filtered deleted-record trigger closed when its required deletion snapshot is missing", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({
      run: { triggerEvent: "contact.deleted", triggerEntityId: "contact-1" },
      routine: {
        triggerFilters: [{ field: "stage", operator: "equals", value: "won" }],
      },
    });
    filterMatcher.matchesCurrentUser.mockResolvedValue(false);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(filterMatcher.matchesCurrentUser).toHaveBeenCalledWith({
      event: "contact.deleted",
      entityId: "contact-1",
      triggerPayload: null,
      filters: [{ field: "stage", operator: "equals", value: "won" }],
    });
    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "filtersNotMatched" },
    });
  });

  it("discards the empty conversation when the agent refuses to start", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    sendAgentMessage.invokeRoutine.mockResolvedValue({
      ok: false,
      error: { issues: [{ message: "You have used all your AI credits." }] },
    });
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    await interactor.invoke({ routineRunId: RUN_ID });

    expect(conversations.deleteUnusedAgentConversation).toHaveBeenCalledWith(
      conversations.createAndLinkRoutineConversationForRun.mock.calls[0][0].conversationId,
    );
  });

  it("discards the empty conversation when the agent throws", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    sendAgentMessage.invokeRoutine.mockRejectedValue(new Error("transaction expired"));
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    await expect(interactor.invoke({ routineRunId: RUN_ID })).rejects.toThrow("transaction expired");
    expect(conversations.deleteUnusedAgentConversation).toHaveBeenCalledWith(
      conversations.createAndLinkRoutineConversationForRun.mock.calls[0][0].conversationId,
    );
  });

  it("keeps the conversation when the turn actually starts", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    await interactor.invoke({ routineRunId: RUN_ID });

    expect(conversations.deleteUnusedAgentConversation).not.toHaveBeenCalled();
  });

  it("does not report a start when owner lifecycle cleanup wins the post-admission linkage race", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    repo.markRoutineRunStartedUnscoped.mockResolvedValue(false);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "runNoLongerRunning" },
    });
    expect(repo.markRoutineRunStartedUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ executedByUserId: mockUser.id }),
    );
    expect(conversations.deleteUnusedAgentConversation).not.toHaveBeenCalled();
  });

  it("records a blocked run when the agent refuses to start", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    sendAgentMessage.invokeRoutine.mockResolvedValue({
      ok: false,
      error: { issues: [{ message: "You have used all your AI credits." }] },
    });
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({
      ok: true,
      data: { started: false, reason: "You have used all your AI credits." },
    });
    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "blocked",
        error: "You have used all your AI credits.",
      }),
    );
  });
});

describe("SweepDueRoutinesInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("claims a due routine and dispatches its run", async () => {
    const repo = {
      findDueRoutinesUnscoped: vi.fn().mockResolvedValue([
        {
          id: ROUTINE_ID,
          companyId: mockUser.companyId,
          ownerUserId: mockUser.id,
          nextRunAt: new Date(),
          triggerKind: "schedule",
        },
      ]),
      claimDueRoutineUnscoped: vi.fn().mockResolvedValue({
        id: RUN_ID,
        companyId: mockUser.companyId,
        executedByUserId: mockUser.id,
      }),
      findStaleQueuedRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      findOwnersWithRunningRunsUnscoped: vi.fn().mockResolvedValue([]),
    };
    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };

    const result = await new SweepDueRoutinesInteractor(repo as never, background as never).invoke();

    expect(result).toEqual({ claimed: 1, redispatched: 0, reconciling: 0 });
    expect(background.dispatch).toHaveBeenCalledWith("run-routine", {
      routineRunId: RUN_ID,
      companyId: mockUser.companyId,
      ownerUserId: mockUser.id,
    });
  });

  it("does not dispatch when another sweep already claimed the occurrence", async () => {
    const repo = {
      findDueRoutinesUnscoped: vi.fn().mockResolvedValue([
        {
          id: ROUTINE_ID,
          companyId: mockUser.companyId,
          ownerUserId: mockUser.id,
          nextRunAt: new Date(),
          triggerKind: "schedule",
        },
      ]),
      claimDueRoutineUnscoped: vi.fn().mockResolvedValue(null),
      findStaleQueuedRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      findOwnersWithRunningRunsUnscoped: vi.fn().mockResolvedValue([]),
    };
    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };

    const result = await new SweepDueRoutinesInteractor(repo as never, background as never).invoke();

    expect(result.claimed).toBe(0);
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("redispatches a queued run whose after-commit dispatch was lost", async () => {
    const repo = {
      findDueRoutinesUnscoped: vi.fn().mockResolvedValue([]),
      claimDueRoutineUnscoped: vi.fn(),
      findStaleQueuedRoutineRunsUnscoped: vi.fn().mockResolvedValue([
        {
          id: RUN_ID,
          companyId: mockUser.companyId,
          executedByUserId: mockUser.id,
        },
      ]),
      findOwnersWithRunningRunsUnscoped: vi.fn().mockResolvedValue([]),
    };
    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };

    const result = await new SweepDueRoutinesInteractor(repo as never, background as never).invoke();

    expect(result.redispatched).toBe(1);
    expect(background.dispatch).toHaveBeenCalledWith("run-routine", expect.objectContaining({ routineRunId: RUN_ID }));
  });
});

describe("ReconcileRoutineRunsInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("settles a run whose turn reached a terminal state", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([
        {
          id: RUN_ID,
          routineId: ROUTINE_ID,
          executedByUserId: mockUser.id,
          turnRequestId: "turn-1",
          conversationId: "conv-1",
        },
      ]),
      readTurnOutcomeUnscoped: vi.fn().mockResolvedValue({
        status: "succeeded",
        terminalCode: "completed",
        settled: true,
        chargedCredits: 3,
        summary: "There are 42 contacts.",
      }),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      readRecentRoutineRunOutcomesUnscoped: vi.fn().mockResolvedValue([]),
      disableRoutineUnscoped: vi.fn().mockResolvedValue(undefined),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    };

    const result = await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(result).toEqual({ settled: 1 });
    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "succeeded",
        chargedCredits: 3,
        summary: "There are 42 contacts.",
      }),
    );
  });

  it("frees a run abandoned between claiming it and recording its turn", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      readTurnOutcomeUnscoped: vi.fn(),
      findOrphanedRunningRoutineRunsUnscoped: vi
        .fn()
        .mockResolvedValue([{ id: RUN_ID, routineId: ROUTINE_ID, executedByUserId: mockUser.id }]),
      readRecentRoutineRunOutcomesUnscoped: vi.fn().mockResolvedValue([]),
      disableRoutineUnscoped: vi.fn().mockResolvedValue(undefined),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    };

    const result = await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(result).toEqual({ settled: 1 });
    expect(repo.readTurnOutcomeUnscoped).not.toHaveBeenCalled();
    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({
        routineRunId: RUN_ID,
        status: "failed",
        error: "startAbandoned",
        expectedTurnRequestId: null,
      }),
    );
  });

  it("pauses a routine whose last three runs all failed, so it stops spending credits", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([
        {
          id: RUN_ID,
          routineId: ROUTINE_ID,
          executedByUserId: mockUser.id,
          turnRequestId: "turn-1",
          conversationId: "conv-1",
        },
      ]),
      readTurnOutcomeUnscoped: vi.fn().mockResolvedValue({
        status: "failed",
        terminalCode: "error",
        settled: true,
        chargedCredits: 1,
        summary: null,
      }),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      readRecentRoutineRunOutcomesUnscoped: vi.fn().mockResolvedValue(["failed", "failed", "failed"]),
      disableRoutineUnscoped: vi.fn().mockResolvedValue(undefined),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    };

    await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(repo.disableRoutineUnscoped).toHaveBeenCalledWith(ROUTINE_ID, "repeatedFailures", mockUser.id);
    expect(repo.readRecentRoutineRunOutcomesUnscoped).toHaveBeenCalledWith(ROUTINE_ID, mockUser.id, 3);
  });

  it("leaves a routine running when a success breaks the failure streak", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([
        {
          id: RUN_ID,
          routineId: ROUTINE_ID,
          executedByUserId: mockUser.id,
          turnRequestId: "turn-1",
          conversationId: "conv-1",
        },
      ]),
      readTurnOutcomeUnscoped: vi.fn().mockResolvedValue({
        status: "failed",
        terminalCode: "error",
        settled: true,
        chargedCredits: 1,
        summary: null,
      }),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      readRecentRoutineRunOutcomesUnscoped: vi.fn().mockResolvedValue(["failed", "succeeded", "failed"]),
      disableRoutineUnscoped: vi.fn().mockResolvedValue(undefined),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    };

    await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(repo.disableRoutineUnscoped).not.toHaveBeenCalled();
  });

  it("waits for a full streak before pausing a routine that has only just started failing", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([
        {
          id: RUN_ID,
          routineId: ROUTINE_ID,
          executedByUserId: mockUser.id,
          turnRequestId: "turn-1",
          conversationId: "conv-1",
        },
      ]),
      readTurnOutcomeUnscoped: vi.fn().mockResolvedValue({
        status: "failed",
        terminalCode: "error",
        settled: true,
        chargedCredits: 1,
        summary: null,
      }),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      readRecentRoutineRunOutcomesUnscoped: vi.fn().mockResolvedValue(["failed", "failed"]),
      disableRoutineUnscoped: vi.fn().mockResolvedValue(undefined),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    };

    await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(repo.disableRoutineUnscoped).not.toHaveBeenCalled();
  });

  it("leaves a run alone while its turn is still in flight", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([
        {
          id: RUN_ID,
          routineId: ROUTINE_ID,
          executedByUserId: mockUser.id,
          turnRequestId: "turn-1",
          conversationId: "conv-1",
        },
      ]),
      readTurnOutcomeUnscoped: vi.fn().mockResolvedValue({
        status: "running",
        terminalCode: null,
        settled: false,
        chargedCredits: 0,
        summary: null,
      }),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      readRecentRoutineRunOutcomesUnscoped: vi.fn().mockResolvedValue([]),
      disableRoutineUnscoped: vi.fn().mockResolvedValue(undefined),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    };

    const result = await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(result).toEqual({ settled: 0 });
    expect(repo.settleRoutineRunUnscoped).not.toHaveBeenCalled();
  });
});

describe("PruneRoutineRunsInteractor", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes expired runs and the conversations that only existed to hold them", async () => {
    const repo = {
      findExpiredRoutineRunsUnscoped: vi.fn().mockResolvedValue([
        { id: "run-1", conversationId: "conv-1" },
        { id: "run-2", conversationId: null },
      ]),
      deleteRoutineRunsUnscoped: vi.fn().mockResolvedValue(2),
    };

    const result = await new PruneRoutineRunsInteractor(repo as never).invoke({
      now: new Date("2026-09-02T00:00:00Z"),
    });

    expect(result).toEqual({ pruned: 2 });
    expect(repo.deleteRoutineRunsUnscoped).toHaveBeenCalledWith(["run-1", "run-2"]);
    expect(repo.findExpiredRoutineRunsUnscoped.mock.calls[0][0]).toEqual(new Date("2026-06-04T00:00:00Z"));
  });

  it("does nothing when no run is old enough", async () => {
    const repo = {
      findExpiredRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      deleteRoutineRunsUnscoped: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new PruneRoutineRunsInteractor(repo as never).invoke();

    expect(result).toEqual({ pruned: 0 });
    expect(repo.deleteRoutineRunsUnscoped).not.toHaveBeenCalled();
  });
});

describe("routine plan allowance", () => {
  const allowanceFor = async (plan: string, existing: number) => {
    const repo = {
      getRoutineByIdOrThrow: vi.fn(),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      upsertRoutineOrThrow: vi.fn().mockImplementation((_data: unknown, limit?: RoutineCountLimit) => {
        if (limit !== undefined && limit !== "unlimited" && existing >= limit)
          return Promise.reject(new RoutineLimitExceededError(limit));
        return Promise.resolve(routineFixture());
      }),
    };
    const interactor = new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: () => Promise.resolve({ plan }) } as never,
      { dispatch: vi.fn() } as never,
    );

    const result = await interactor.invoke({
      name: "Plan-limited routine",
      prompt: "Summarise the pipeline.",
      triggerKind: "schedule",
      cronExpression: "0 9 * * *",
    });

    return { repo, result };
  };

  it("refuses a starter workspace its first routine", async () => {
    const { result } = await allowanceFor("starter", 0);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the starter routine to be rejected");
    const issue = result.error.issues[0];
    expect(issue?.code === "custom" ? issue.params?.error : undefined).toBe(CustomErrorCode.routinesRequirePaidPlan);
  });

  it("lets a pro workspace create up to three", async () => {
    const { repo, result } = await allowanceFor("pro", 2);

    expect(result.ok).toBe(true);
    expect(repo.upsertRoutineOrThrow).toHaveBeenCalledOnce();
  });

  it("stops a pro workspace at its fourth", async () => {
    const { repo, result } = await allowanceFor("pro", 3);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the fourth Pro routine to be rejected");
    const issue = result.error.issues[0];
    expect(issue?.code === "custom" ? issue.params?.error : undefined).toBe(CustomErrorCode.routineLimitReached);
    expect(issue?.code === "custom" ? issue.params?.limit : undefined).toBe(3);
    expect(repo.upsertRoutineOrThrow).toHaveBeenCalledOnce();
  });

  it("never counts for business or enterprise", async () => {
    for (const [plan, existing] of [
      ["business", 99],
      ["enterprise", 5_000],
    ] as const) {
      const { repo, result } = await allowanceFor(plan, existing);
      expect(result.ok).toBe(true);
      expect(repo.upsertRoutineOrThrow).toHaveBeenCalledWith(expect.anything(), "unlimited");
    }
  });

  it("leaves an edit alone, so a downgrade does not lock existing routines", async () => {
    const repo = {
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(routineFixture()),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(routineFixture({ name: "Renamed" })),
    };
    const interactor = new UpsertRoutineInteractor(
      repo as never,
      {
        getSubscriptionOrThrow: () => Promise.reject(new Error("must not read the plan on edit")),
      } as never,
      { dispatch: vi.fn() } as never,
    );

    const result = await interactor.invoke({ id: ROUTINE_ID, name: "Renamed" });

    expect(result.ok).toBe(true);
    expect(repo.upsertRoutineOrThrow).toHaveBeenCalledOnce();
  });

  it("rejects an event-to-schedule partial update without a new schedule", async () => {
    const repo = {
      countRoutines: vi.fn(),
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(
        routineFixture({
          triggerKind: "event",
          cronExpression: null,
          timezone: null,
          runOnceAt: null,
          triggerEvents: ["deal.updated"],
        }),
      ),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      upsertRoutineOrThrow: vi.fn(),
    };
    const background = { dispatch: vi.fn() };
    const interactor = new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      background as never,
    );

    const result = await interactor.invoke({
      id: ROUTINE_ID,
      triggerKind: "schedule",
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Expected the schedule-less transition to be rejected");
    expect(result.error.issues[0]).toMatchObject({
      path: ["cronExpression"],
      params: { error: CustomErrorCode.routineScheduleRequired },
    });
    expect(repo.upsertRoutineOrThrow).not.toHaveBeenCalled();
    expect(background.dispatch).not.toHaveBeenCalled();
  });

  it("dispatches stale-risk cleanup when the last event routine becomes scheduled", async () => {
    const previous = routineFixture({
      triggerKind: "event",
      cronExpression: null,
      timezone: null,
      runOnceAt: null,
      triggerEvents: ["deal.updated"],
    });
    const repo = {
      countRoutines: vi.fn(),
      getRoutineByIdOrThrow: vi.fn().mockResolvedValue(previous),
      isEligibleRoutineOwner: vi.fn().mockResolvedValue(true),
      upsertRoutineOrThrow: vi.fn().mockResolvedValue(
        routineFixture({
          triggerKind: "schedule",
          cronExpression: "0 9 * * *",
          triggerEvents: ["deal.updated"],
        }),
      ),
    };
    const background = { dispatch: vi.fn().mockResolvedValue(undefined) };
    const interactor = new UpsertRoutineInteractor(
      repo as never,
      { getSubscriptionOrThrow: vi.fn() } as never,
      background as never,
    );

    const result = await interactor.invoke({
      id: ROUTINE_ID,
      triggerKind: "schedule",
      cronExpression: "0 9 * * *",
    });

    expect(result.ok).toBe(true);
    expect(background.dispatch).toHaveBeenCalledWith("analyze-routine-loops", {
      companyId: mockUser.companyId,
    });
  });
});

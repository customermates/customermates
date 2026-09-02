import { describe, it, expect, vi, beforeEach } from "vitest";

import { createMockUser } from "@/tests/helpers/mock-user";
import {
  MOCK_ENV_MODULE,
  createMockDiModule,
  MOCK_ZOD_MODULE,
  MOCK_PRISMA_DB_MODULE,
} from "@/tests/helpers/interactor-test-setup";

const mockUser = createMockUser();

vi.mock("@/env", () => MOCK_ENV_MODULE);
vi.mock("@/core/di", () => createMockDiModule(() => mockUser));
vi.mock("@/core/validation/zod-error-map-server", () => MOCK_ZOD_MODULE);
vi.mock("@/prisma/db", () => MOCK_PRISMA_DB_MODULE);

import { UpsertRoutineSchema } from "../routine.schema";
import { StartRoutineRunInteractor } from "../start-routine-run.interactor";
import { SweepDueRoutinesInteractor } from "../sweep-due-routines.interactor";
import { ReconcileRoutineRunsInteractor } from "../reconcile-routine-runs.interactor";
import { CustomErrorCode } from "@/core/validation/validation.types";

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
      { error: CustomErrorCode.routineScheduleRequired, path: ["cronExpression"] },
    ]);
  });

  it("requires at least one event for an event routine", () => {
    expect(issuesOf({ name: "React", prompt: "Do", triggerKind: "event", triggerEvents: [] })).toEqual([
      { error: CustomErrorCode.routineTriggerEventsRequired, path: ["triggerEvents"] },
    ]);
  });

  it("rejects an unparseable cron expression", () => {
    expect(issuesOf({ name: "Bad", prompt: "Do", triggerKind: "schedule", cronExpression: "not a cron" })).toEqual([
      { error: CustomErrorCode.routineScheduleInvalid, path: ["cronExpression"] },
    ]);
  });

  it("rejects a schedule that breaches the interval floor", () => {
    expect(issuesOf({ name: "Hot", prompt: "Do", triggerKind: "schedule", cronExpression: "* * * * *" })).toEqual([
      { error: CustomErrorCode.routineScheduleTooFrequent, path: ["cronExpression"] },
    ]);
  });

  it("rejects a clustered schedule whose average gap looks acceptable", () => {
    expect(issuesOf({ name: "Burst", prompt: "Do", triggerKind: "schedule", cronExpression: "0,1 9 * * *" })).toEqual([
      { error: CustomErrorCode.routineScheduleTooFrequent, path: ["cronExpression"] },
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
    name: "Daily digest",
    prompt: "Summarise yesterday",
    modelKey: null,
    enabled: true,
    triggerKind: "schedule",
    cronExpression: "0 9 * * *",
    timezone: "UTC",
    runOnceAt: null,
    triggerEvents: [],
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

function startFixtures(overrides: { run?: Record<string, unknown>; routine?: Record<string, unknown> } = {}) {
  const repo = {
    findRoutineRunForStartUnscoped: vi.fn().mockResolvedValue({
      id: RUN_ID,
      companyId: mockUser.companyId,
      status: "queued",
      triggerEvent: null,
      triggerEntityId: null,
      routine: routineFixture(overrides.routine),
      ...overrides.run,
    }),
    countInFlightRoutineRunsForOwnerUnscoped: vi.fn().mockResolvedValue(0),
    countRecentRoutineRunsUnscoped: vi.fn().mockResolvedValue(0),
    claimQueuedRoutineRunUnscoped: vi.fn().mockResolvedValue(true),
    markRoutineRunStartedUnscoped: vi.fn().mockResolvedValue(undefined),
    settleRoutineRunUnscoped: vi.fn().mockResolvedValue(undefined),
  };
  const conversations = { createAgentConversationForRun: vi.fn().mockResolvedValue(undefined) };
  const filterMatcher = { matches: vi.fn().mockResolvedValue(true) };
  const sendAgentMessage = {
    invoke: vi.fn().mockResolvedValue({
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
    expect(conversations.createAgentConversationForRun).toHaveBeenCalledWith(
      expect.objectContaining({ origin: "routine", title: "Daily digest", creditCeiling: 10 }),
    );
    expect(sendAgentMessage.invoke).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: RUN_ID }));
    expect(repo.markRoutineRunStartedUnscoped).toHaveBeenCalled();
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

    expect(result).toEqual({ ok: true, data: { started: false, reason: "runNotQueued" } });
    expect(sendAgentMessage.invoke).not.toHaveBeenCalled();
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

    expect(result).toEqual({ ok: true, data: { started: false, reason: "routineDisabled" } });
    expect(sendAgentMessage.invoke).not.toHaveBeenCalled();
  });

  it("leaves chat capacity for the owner by capping in-flight routine runs", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    repo.countInFlightRoutineRunsForOwnerUnscoped.mockResolvedValue(1);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({ ok: true, data: { started: false, reason: "ownerRunLimit" } });
    expect(sendAgentMessage.invoke).not.toHaveBeenCalled();
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

    expect(result).toEqual({ ok: true, data: { started: false, reason: "hourlyRunLimit" } });
  });

  it("refuses to spend anything when the run was already claimed by another dispatch", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    repo.claimQueuedRoutineRunUnscoped.mockResolvedValue(false);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({ ok: true, data: { started: false, reason: "runAlreadyClaimed" } });
    expect(conversations.createAgentConversationForRun).not.toHaveBeenCalled();
    expect(sendAgentMessage.invoke).not.toHaveBeenCalled();
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

    expect(conversations.createAgentConversationForRun).toHaveBeenCalledWith(
      expect.objectContaining({ creditCeiling: 3 }),
    );
  });

  it("skips a run whose record no longer matches the routine's conditions", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures({
      run: { triggerEvent: "contact.updated", triggerEntityId: "contact-1" },
      routine: { triggerFilters: [{ field: "stage", operator: "equals", value: "won" }] },
    });
    filterMatcher.matches.mockResolvedValue(false);
    const interactor = new StartRoutineRunInteractor(
      repo as never,
      conversations as never,
      sendAgentMessage as never,
      filterMatcher as never,
    );

    const result = await interactor.invoke({ routineRunId: RUN_ID });

    expect(result).toEqual({ ok: true, data: { started: false, reason: "filtersNotMatched" } });
    expect(repo.claimQueuedRoutineRunUnscoped).not.toHaveBeenCalled();
    expect(sendAgentMessage.invoke).not.toHaveBeenCalled();
  });

  it("records a blocked run when the agent refuses to start", async () => {
    const { repo, conversations, sendAgentMessage, filterMatcher } = startFixtures();
    sendAgentMessage.invoke.mockResolvedValue({
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

    expect(result).toEqual({ ok: true, data: { started: false, reason: "You have used all your AI credits." } });
    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: "blocked", error: "You have used all your AI credits." }),
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
      claimDueRoutineUnscoped: vi.fn().mockResolvedValue({ id: RUN_ID, companyId: mockUser.companyId }),
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
      findStaleQueuedRoutineRunsUnscoped: vi
        .fn()
        .mockResolvedValue([{ id: RUN_ID, companyId: mockUser.companyId, routine: { ownerUserId: mockUser.id } }]),
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
      findRunningRoutineRunsUnscoped: vi
        .fn()
        .mockResolvedValue([{ id: RUN_ID, routineId: ROUTINE_ID, turnRequestId: "turn-1", conversationId: "conv-1" }]),
      readTurnOutcomeUnscoped: vi.fn().mockResolvedValue({
        status: "succeeded",
        terminalCode: "completed",
        settled: true,
        chargedCredits: 3,
        summary: "There are 42 contacts.",
      }),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(result).toEqual({ settled: 1 });
    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", chargedCredits: 3, summary: "There are 42 contacts." }),
    );
  });

  it("frees a run abandoned between claiming it and recording its turn", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      readTurnOutcomeUnscoped: vi.fn(),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([{ id: RUN_ID, routineId: ROUTINE_ID }]),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(result).toEqual({ settled: 1 });
    expect(repo.readTurnOutcomeUnscoped).not.toHaveBeenCalled();
    expect(repo.settleRoutineRunUnscoped).toHaveBeenCalledWith(
      expect.objectContaining({ routineRunId: RUN_ID, status: "failed", error: "startAbandoned" }),
    );
  });

  it("leaves a run alone while its turn is still in flight", async () => {
    const repo = {
      findRunningRoutineRunsUnscoped: vi
        .fn()
        .mockResolvedValue([{ id: RUN_ID, routineId: ROUTINE_ID, turnRequestId: "turn-1", conversationId: "conv-1" }]),
      readTurnOutcomeUnscoped: vi.fn().mockResolvedValue({
        status: "running",
        terminalCode: null,
        settled: false,
        chargedCredits: 0,
        summary: null,
      }),
      findOrphanedRunningRoutineRunsUnscoped: vi.fn().mockResolvedValue([]),
      settleRoutineRunUnscoped: vi.fn().mockResolvedValue(undefined),
    };

    const result = await new ReconcileRoutineRunsInteractor(repo as never).invoke();

    expect(result).toEqual({ settled: 0 });
    expect(repo.settleRoutineRunUnscoped).not.toHaveBeenCalled();
  });
});

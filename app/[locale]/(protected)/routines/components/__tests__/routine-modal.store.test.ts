import type { RootStore } from "@/core/stores/root.store";
import type { RoutineDto, RoutineRunDto } from "@/ee/routines/routine.schema";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autorun, runInAction } from "mobx";

import { RoutineRunStatus, RoutineTriggerKind } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { registerApplicationErrorHandler } from "@/core/errors/report-application-error";

const routineActions = vi.hoisted(() => ({
  deleteRoutineAction: vi.fn(),
  getRoutineFilterFieldsAction: vi.fn(() =>
    Promise.resolve({
      filterableFields: {
        organization: [{ field: "name" }, { field: "type" }],
      },
      customColumns: [],
    }),
  ),
  getRoutineRunsAction: vi.fn<
    (input: { routineId: string; cursor?: string }) => Promise<{ runs: RoutineRunDto[]; nextCursor: string | null }>
  >(() => Promise.resolve({ runs: [], nextCursor: null })),
  pauseRoutineAction: vi.fn(),
  runRoutineNowAction: vi.fn(),
  upsertRoutineAction: vi.fn(),
}));

vi.mock("../../actions", () => routineActions);

const sonner = vi.hoisted(() => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => sonner);

import {
  ROUTINE_RUN_POLL_GRACE_MS,
  ROUTINE_RUN_POLL_INTERVAL_MS,
  ROUTINE_RUN_POLL_MAX_MS,
  RoutineModalStore,
} from "../routine-modal.store";

const OWNER_ID = "30000000-0000-4000-8000-000000000010";
const OTHER_ID = "30000000-0000-4000-8000-000000000011";

function makeRoutine(overrides: Partial<RoutineDto> = {}): RoutineDto {
  return {
    id: "30000000-0000-4000-8000-000000000001",
    ownerUserId: OWNER_ID,
    owner: {
      id: OWNER_ID,
      firstName: "Mara",
      lastName: "Owner",
      avatarUrl: null,
      status: "active",
    },
    name: "Daily deal digest",
    prompt: "List the three most recently updated deals.",
    enabled: true,
    triggerKind: RoutineTriggerKind.schedule,
    cronExpression: "0 9 * * *",
    timezone: "Europe/Berlin",
    triggerEvents: [],
    changedFields: [],
    triggerFilters: [],
    maxRunsPerHour: 6,
    maxCreditsPerRun: 10,
    ...overrides,
  } as unknown as RoutineDto;
}

function makeRun(overrides: Partial<RoutineRunDto> = {}): RoutineRunDto {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    routineId: "30000000-0000-4000-8000-000000000001",
    executedByUserId: OWNER_ID,
    executedByName: "Mara Owner",
    conversationId: null,
    turnRequestId: null,
    status: RoutineRunStatus.succeeded,
    triggerKind: RoutineTriggerKind.schedule,
    triggerEvent: null,
    triggerEntityId: null,
    triggerContext: null,
    scheduledFor: new Date("2026-09-08T09:00:00Z"),
    startedAt: new Date("2026-09-08T09:00:01Z"),
    finishedAt: new Date("2026-09-08T09:00:02Z"),
    terminalCode: "completed",
    stopReason: null,
    chargedCredits: 1,
    summary: "Done",
    error: null,
    createdAt: new Date("2026-09-08T09:00:00Z"),
    updatedAt: new Date("2026-09-08T09:00:02Z"),
    ...overrides,
  } as RoutineRunDto;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });

  return { promise, reject, resolve };
}

async function settlePromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function makeStore(
  chat: {
    conversationId?: string | null;
    isWorking?: boolean;
    selectConversationForEmbeddedViewer: (id: string) => Promise<void>;
    newConversation: () => void;
  } = {
    conversationId: null,
    isWorking: false,
    selectConversationForEmbeddedViewer: vi.fn(() => Promise.resolve()),
    newConversation: vi.fn(),
  },
  options: { userId?: string; admin?: boolean } = {},
): RoutineModalStore {
  return new RoutineModalStore({
    registerModalStore: vi.fn(),
    userStore: {
      user: {
        id: options.userId ?? OWNER_ID,
        role: { isSystemRole: options.admin ?? false },
      },
    },
    routinesStore: { upsertItem: vi.fn(), removeItem: vi.fn() },
    routineRunChatStore: chat,
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
}

describe("RoutineModalStore", () => {
  beforeEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
    routineActions.getRoutineFilterFieldsAction.mockResolvedValue({
      filterableFields: {
        organization: [{ field: "name" }, { field: "type" }],
      },
      customColumns: [],
    });
    routineActions.getRoutineRunsAction.mockResolvedValue({
      runs: [],
      nextCursor: null,
    });
  });

  afterEach(() => vi.useRealTimers());

  it("keeps async modal setup inside MobX actions", async () => {
    const store = makeStore();
    const warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const stopObserving = autorun(() => {
      void store.activeTab;
      void store.openRunId;
      void store.disabledReason;
      void store.runs.length;
      void store.runsNextCursor;
    });

    try {
      runInAction(() => {
        store.activeTab = "runs";
        store.openRunId = "previous-run";
        store.disabledReason = "adminPaused";
        store.runs = [{ id: "previous-run" } as never];
        store.runsNextCursor = "next-page";
      });

      await store.openForCreate();

      expect(store.activeTab).toBe("details");
      expect(store.openRunId).toBeNull();
      expect(store.disabledReason).toBeNull();
      expect(store.runs).toEqual([]);
      expect(store.runsNextCursor).toBeNull();

      runInAction(() => {
        store.activeTab = "runs";
        store.openRunId = "previous-run";
        store.disabledReason = "ownerPaused";
        store.runsNextCursor = "next-page";
      });

      await store.openForEdit(makeRoutine({ enabled: false, disabledReason: "adminPaused" }));

      expect(store.activeTab).toBe("details");
      expect(store.openRunId).toBeNull();
      expect(store.disabledReason).toBe("adminPaused");
      expect(store.runsNextCursor).toBeNull();
      expect(warnings.mock.calls.flat().join(" ")).not.toContain("strict-mode");
    } finally {
      stopObserving();
      warnings.mockRestore();
    }
  });

  it("does not carry the edited routine's id into the next create", async () => {
    const store = makeStore();

    await store.openForEdit(makeRoutine());
    expect(store.payload.id).toBe("30000000-0000-4000-8000-000000000001");

    await store.openForCreate();

    expect(store.payload.id).toBeUndefined();
    expect(store.payload.name).toBe("");
    expect(store.payload.prompt).toBe("");
  });

  it("clears the viewer instead of showing the previous run's transcript", async () => {
    const chat = {
      conversationId: null,
      isWorking: false,
      selectConversationForEmbeddedViewer: vi.fn(() => Promise.resolve()),
      newConversation: vi.fn(),
    };
    const store = makeStore(chat);
    const firstRun = {
      id: "run-1",
      conversationId: "conv-1",
      executedByUserId: OWNER_ID,
    } as never;
    const secondRun = {
      id: "run-2",
      conversationId: null,
      executedByUserId: OWNER_ID,
    } as never;

    await store.openForEdit(makeRoutine());
    runInAction(() => {
      store.runs = [firstRun, secondRun];
    });

    await store.openRun(firstRun);
    expect(chat.selectConversationForEmbeddedViewer).toHaveBeenCalledWith("conv-1");

    await store.openRun(secondRun);

    expect(chat.newConversation).toHaveBeenCalled();
    expect(chat.selectConversationForEmbeddedViewer).toHaveBeenCalledTimes(1);
  });

  it("keeps the active embedded chat selected until its turn finishes", async () => {
    const chat = {
      conversationId: "conv-1",
      isWorking: true,
      selectConversationForEmbeddedViewer: vi.fn(() => Promise.resolve()),
      newConversation: vi.fn(),
    };
    const store = makeStore(chat);
    const activeRun = makeRun({ id: "run-1", conversationId: "conv-1" });
    const otherRun = makeRun({ id: "run-2", conversationId: "conv-2" });

    await store.openForEdit(makeRoutine());
    runInAction(() => {
      store.runs = [activeRun, otherRun];
    });
    await store.openRun(activeRun);
    await store.openRun(otherRun);

    expect(store.openRunId).toBe(activeRun.id);
    expect(store.isRunSelectionBlockedByActiveChat(otherRun)).toBe(true);
    expect(chat.selectConversationForEmbeddedViewer).toHaveBeenCalledTimes(1);
  });

  it("keeps the runs tab selected so resize-back can restore focus to the run row", async () => {
    const store = makeStore();
    const run = makeRun();

    await store.openForEdit(makeRoutine());
    runInAction(() => {
      store.runs = [run];
    });

    await store.openRun(run);

    expect(store.activeTab).toBe("runs");
    expect(store.openRunId).toBe(run.id);
  });

  it("restores keyboard focus to the selected row after closing its drilldown", async () => {
    const detailFocus = vi.fn();
    const rowFocus = vi.fn();
    const frames: FrameRequestCallback[] = [];
    let rowMounted = false;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.push(callback);
      return frames.length;
    });
    vi.stubGlobal("document", {
      getElementById: vi.fn((id: string) => {
        if (id === "routine-run-detail-heading") return { focus: detailFocus };
        if (id === "routine-run-50000000-0000-4000-8000-000000000001" && rowMounted) return { focus: rowFocus };
        return null;
      }),
    });
    const store = makeStore();
    const run = makeRun({ conversationId: "conversation-1" });

    try {
      await store.openForEdit(makeRoutine());
      runInAction(() => {
        store.runs = [run];
      });
      await store.openRun(run);

      expect(frames).toHaveLength(1);
      frames.shift()?.(0);
      expect(frames).toHaveLength(1);
      frames.shift()?.(0);
      expect(detailFocus).toHaveBeenCalledWith({ preventScroll: true });

      store.closeRun();

      expect(frames).toHaveLength(1);
      frames.shift()?.(0);
      expect(rowFocus).not.toHaveBeenCalled();
      rowMounted = true;
      expect(frames).toHaveLength(1);
      frames.shift()?.(0);
      expect(rowFocus).toHaveBeenCalledWith({ preventScroll: true });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fills in the record filters once a trigger event names an entity", async () => {
    const store = makeStore();

    await store.openForCreate();

    expect(store.form.triggerFilters).toEqual([]);

    store.onChange("triggerEvents", ["organization.created"]);
    await Promise.resolve();

    expect(store.form.triggerFilters).toHaveLength(2);
  });

  it("offers change fields only once a selected event reports changes", async () => {
    const store = makeStore();

    await store.openForCreate();

    store.onChange("triggerEvents", ["organization.created"]);
    await Promise.resolve();

    expect(store.watchesRecordChanges).toBe(false);
    expect(store.changeFields).toEqual([]);

    store.onChange("triggerEvents", ["organization.updated"]);
    await Promise.resolve();

    expect(store.watchesRecordChanges).toBe(true);
    expect(store.changeFields).toContain("name");
    expect(store.changeFields).toContain("notes");
  });

  it("drops watched fields when the events stop reporting changes", async () => {
    const store = makeStore();

    await store.openForCreate();

    store.onChange("triggerEvents", ["organization.updated"]);
    await Promise.resolve();
    store.onChange("changedFields", ["name"]);

    store.onChange("triggerEvents", ["organization.created"]);
    await Promise.resolve();

    expect(store.form.changedFields).toEqual([]);
    expect(store.payload.changedFields).toEqual([]);
  });

  it("drops watched fields the new entity does not have", async () => {
    const store = makeStore();

    await store.openForCreate();

    store.onChange("triggerEvents", ["organization.updated"]);
    await Promise.resolve();
    store.onChange("changedFields", ["name"]);

    store.onChange("triggerEvents", ["contact.updated"]);
    await Promise.resolve();

    expect(store.form.changedFields).toEqual([]);
    expect(store.payload.triggerFilters).toEqual([]);
  });

  it("preserves unavailable conditions until the owner explicitly changes entity type", async () => {
    const unavailableFieldId = "40000000-0000-4000-8000-000000000099";
    const unavailableFilter = {
      field: unavailableFieldId,
      operator: FilterOperatorKey.equals,
      value: "enterprise",
    } as const;
    const store = makeStore();

    await store.openForEdit(
      makeRoutine({
        triggerKind: RoutineTriggerKind.event,
        triggerEvents: ["organization.updated"],
        changedFields: [unavailableFieldId],
        triggerFilters: [unavailableFilter],
      }),
    );

    expect(store.form.changedFields).toEqual([unavailableFieldId]);
    expect(store.form.triggerFilters).toContainEqual(unavailableFilter);
    expect(store.payload.changedFields).toEqual([unavailableFieldId]);
    expect(store.payload.triggerFilters).toEqual([unavailableFilter]);

    store.onChange("triggerEvents", ["organization.updated", "organization.created"]);

    expect(store.payload.changedFields).toEqual([unavailableFieldId]);
    expect(store.payload.triggerFilters).toEqual([unavailableFilter]);

    store.onChange("triggerEvents", ["contact.updated"]);

    expect(store.payload.changedFields).toEqual([]);
    expect(store.payload.triggerFilters).toEqual([]);
  });

  it("stamps the local time zone on a routine created in the browser", async () => {
    const store = makeStore();

    await store.openForCreate();

    expect(store.payload.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it("lets every member create but only the owner edit an existing routine", async () => {
    const ownerStore = makeStore();
    await ownerStore.openForCreate();
    expect(ownerStore.canManage).toBe(true);
    await ownerStore.openForEdit(makeRoutine());
    expect(ownerStore.canManage).toBe(true);

    const viewerStore = makeStore(undefined, { userId: OTHER_ID });
    await viewerStore.openForEdit(makeRoutine());
    expect(viewerStore.canManage).toBe(false);
    expect(viewerStore.isReadOnly).toBe(true);
  });

  it("uses the owner's current status to determine whether ownership is available", async () => {
    const store = makeStore(undefined, { userId: OTHER_ID });

    await store.openForEdit(makeRoutine());
    expect(store.hasAvailableOwner).toBe(true);

    await store.openForEdit(
      makeRoutine({
        owner: {
          id: OWNER_ID,
          firstName: "Mara",
          lastName: "Owner",
          avatarUrl: null,
          status: "inactive",
        },
      }),
    );
    expect(store.hasAvailableOwner).toBe(false);

    await store.openForEdit(makeRoutine({ owner: null, ownerUserId: null }));
    expect(store.hasAvailableOwner).toBe(false);
  });

  it("keeps admin governance separate from owner-only editing", async () => {
    const store = makeStore(undefined, { userId: OTHER_ID, admin: true });

    await store.openForEdit(makeRoutine());

    expect(store.isAdmin).toBe(true);
    expect(store.isOwner).toBe(false);
    expect(store.canManage).toBe(false);
    expect(store.canAdministerOtherRoutine).toBe(true);
  });

  it("opens full transcripts only for the snapshotted executor", async () => {
    const chat = {
      conversationId: null,
      isWorking: false,
      selectConversationForEmbeddedViewer: vi.fn(() => Promise.resolve()),
      newConversation: vi.fn(),
    };
    const store = makeStore(chat, { userId: OTHER_ID });

    expect(store.canOpenRun({ executedByUserId: OWNER_ID } as never)).toBe(false);
    await store.openRun({
      id: "run-1",
      conversationId: "conv-1",
      executedByUserId: OWNER_ID,
    } as never);

    expect(store.openRunId).toBeNull();
    expect(chat.selectConversationForEmbeddedViewer).not.toHaveBeenCalled();
  });

  it("applies an administrative pause without closing the details", async () => {
    const store = makeStore(undefined, { userId: OTHER_ID, admin: true });
    const paused = makeRoutine({
      enabled: false,
      disabledReason: "adminPaused",
    });
    routineActions.pauseRoutineAction.mockResolvedValue({
      ok: true,
      data: paused,
    });
    await store.openForEdit(makeRoutine());

    await expect(store.pause()).resolves.toBe(true);

    expect(routineActions.pauseRoutineAction).toHaveBeenCalledWith({
      routineId: paused.id,
    });
    expect(store.form.enabled).toBe(false);
    expect(store.disabledReason).toBe("adminPaused");
    expect(store.isOpen).toBe(true);
  });

  it("keeps owner controls and administrator overrides separate", async () => {
    const store = makeStore(undefined, { userId: OWNER_ID, admin: true });
    await store.openForEdit(makeRoutine());

    await expect(store.pause()).resolves.toBe(false);

    expect(routineActions.pauseRoutineAction).not.toHaveBeenCalled();
    expect(store.isOwner).toBe(true);
    expect(store.canAdministerOtherRoutine).toBe(false);
  });

  it("does not let a viewer replace a custom schedule through the helper button", async () => {
    const store = makeStore(undefined, { userId: OTHER_ID });
    await store.openForEdit(makeRoutine({ cronExpression: "7 8 * * *" }));
    const originalCron = store.payload.cronExpression;

    store.useSchedulePreset();

    expect(store.payload.cronExpression).toBe(originalCron);
  });

  it("never calls Test trigger for an event, a paused routine, or a non-owner", async () => {
    const eventStore = makeStore();
    await eventStore.openForEdit(makeRoutine({ triggerKind: RoutineTriggerKind.event }));
    await eventStore.runNow();

    const pausedStore = makeStore();
    await pausedStore.openForEdit(makeRoutine({ enabled: false }));
    await pausedStore.runNow();

    const viewerStore = makeStore(undefined, { userId: OTHER_ID });
    await viewerStore.openForEdit(makeRoutine());
    await viewerStore.runNow();

    const adminViewerStore = makeStore(undefined, {
      userId: OTHER_ID,
      admin: true,
    });
    await adminViewerStore.openForEdit(makeRoutine());
    await adminViewerStore.runNow();

    expect(routineActions.runRoutineNowAction).not.toHaveBeenCalled();
  });

  it("opens the runs tab and confirms once a test run is queued", async () => {
    routineActions.runRoutineNowAction.mockResolvedValue({
      ok: true,
      data: "queued-run",
    });
    const store = makeStore();
    await store.openForEdit(makeRoutine());

    expect(store.activeTab).toBe("details");

    await store.runNow();

    expect(routineActions.runRoutineNowAction).toHaveBeenCalledTimes(1);
    expect(store.activeTab).toBe("runs");
    expect(routineActions.getRoutineRunsAction).toHaveBeenCalled();
    expect(sonner.toast.success).toHaveBeenCalledWith("RoutineDetail.testTriggerStarted", expect.anything());
  });

  it("ignores a Test trigger response after switching routines", async () => {
    const pendingRun = deferred<{ ok: true; data: string }>();
    routineActions.runRoutineNowAction.mockReturnValue(pendingRun.promise);
    const firstRoutine = makeRoutine();
    const secondRoutine = makeRoutine({
      id: "30000000-0000-4000-8000-000000000002",
      name: "Second",
    });
    const store = makeStore();
    await store.openForEdit(firstRoutine);
    await settlePromises();

    const runPromise = store.runNow();
    expect(store.isStartingRun).toBe(true);

    store.close();
    await store.openForEdit(secondRoutine);
    await settlePromises();
    const runPageRequestsAfterSwitch = routineActions.getRoutineRunsAction.mock.calls.length;

    pendingRun.resolve({ ok: true, data: "queued-run" });
    await runPromise;

    expect(store.form.id).toBe(secondRoutine.id);
    expect(store.activeTab).toBe("details");
    expect(store.isStartingRun).toBe(false);
    expect(routineActions.getRoutineRunsAction).toHaveBeenCalledTimes(runPageRequestsAfterSwitch);
    expect(sonner.toast.success).not.toHaveBeenCalled();
  });

  it("stays on the details tab and stays silent when the test run is refused", async () => {
    routineActions.runRoutineNowAction.mockResolvedValue({
      ok: false,
      error: { errors: [] },
    });
    const store = makeStore();
    await store.openForEdit(makeRoutine());

    await store.runNow();

    expect(store.activeTab).toBe("details");
    expect(sonner.toast.success).not.toHaveBeenCalled();
  });

  it("rejects a stale first page after switching routines", async () => {
    const first = deferred<{
      runs: RoutineRunDto[];
      nextCursor: string | null;
    }>();
    const second = deferred<{
      runs: RoutineRunDto[];
      nextCursor: string | null;
    }>();
    const firstRoutine = makeRoutine();
    const secondRoutine = makeRoutine({
      id: "30000000-0000-4000-8000-000000000002",
      name: "Second",
    });
    const firstRun = makeRun();
    const secondRun = makeRun({
      id: "50000000-0000-4000-8000-000000000002",
      routineId: secondRoutine.id,
    });
    routineActions.getRoutineRunsAction.mockImplementation(({ routineId }: { routineId: string }) =>
      routineId === firstRoutine.id ? first.promise : second.promise,
    );
    const store = makeStore();

    await store.openForEdit(firstRoutine);
    await store.openForEdit(secondRoutine);
    second.resolve({ runs: [secondRun], nextCursor: null });
    await settlePromises();
    first.resolve({ runs: [firstRun], nextCursor: null });
    await settlePromises();

    expect(store.form.id).toBe(secondRoutine.id);
    expect(store.runs.map(({ id }) => id)).toEqual([secondRun.id]);
  });

  it("coalesces duplicate first-page loads for one routine", async () => {
    const page = deferred<{
      runs: RoutineRunDto[];
      nextCursor: string | null;
    }>();
    routineActions.getRoutineRunsAction.mockReturnValue(page.promise);
    const store = makeStore();
    const routine = makeRoutine();

    await store.openForEdit(routine);
    const duplicateA = store.loadRuns(routine.id, true);
    const duplicateB = store.loadRuns(routine.id, true);

    expect(routineActions.getRoutineRunsAction).toHaveBeenCalledTimes(1);
    page.resolve({ runs: [], nextCursor: null });
    await Promise.all([duplicateA, duplicateB]);
    expect(store.runsRequestState).toBe("ready");
  });

  it("deduplicates pages and rejects repeated or oversized cursors", async () => {
    const firstRun = makeRun();
    const secondRun = makeRun({ id: "50000000-0000-4000-8000-000000000002" });
    routineActions.getRoutineRunsAction
      .mockResolvedValueOnce({
        runs: [firstRun, firstRun],
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({
        runs: [firstRun, secondRun],
        nextCursor: "page-2",
      });
    const store = makeStore();

    await store.openForEdit(makeRoutine());
    await settlePromises();
    expect(store.runs).toHaveLength(1);
    expect(store.runsNextCursor).toBe("page-2");

    await store.loadMoreRuns();
    expect(store.runs.map(({ id }) => id)).toEqual([firstRun.id, secondRun.id]);
    expect(store.runsNextCursor).toBeNull();

    routineActions.getRoutineRunsAction.mockResolvedValueOnce({
      runs: [],
      nextCursor: "x".repeat(501),
    });
    await store.openForEdit(makeRoutine({ id: "30000000-0000-4000-8000-000000000003" }));
    await settlePromises();
    expect(store.runsNextCursor).toBeNull();
  });

  it("shows an initial load error and recovers through retry", async () => {
    routineActions.getRoutineRunsAction
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ runs: [makeRun()], nextCursor: null });
    const store = makeStore();

    await store.openForEdit(makeRoutine());
    await settlePromises();
    expect(store.runsRequestState).toBe("error");
    expect(store.runs).toEqual([]);

    await store.retryLoadRuns();
    expect(store.runsRequestState).toBe("ready");
    expect(store.runs).toHaveLength(1);
  });

  it("retains rows and reports only once per background polling failure streak", async () => {
    vi.useFakeTimers();
    const active = makeRun({
      status: RoutineRunStatus.running,
      terminalCode: null,
      finishedAt: null,
    });
    routineActions.getRoutineRunsAction
      .mockResolvedValueOnce({ runs: [active], nextCursor: null })
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockResolvedValueOnce({ runs: [active], nextCursor: null })
      .mockRejectedValueOnce(new Error("third"));
    const errors = vi.fn();
    const unregister = registerApplicationErrorHandler(errors);
    const store = makeStore();

    try {
      await store.openForEdit(makeRoutine());
      await settlePromises();

      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(errors).toHaveBeenCalledTimes(1);
      expect(store.runs).toEqual([active]);

      await vi.advanceTimersByTimeAsync(2_000);
      await vi.advanceTimersByTimeAsync(2_000);
      expect(errors).toHaveBeenCalledTimes(2);
      expect(store.runs).toEqual([active]);
    } finally {
      unregister();
      store.close();
    }
  });

  it("reports a failed Test refresh and the following failed poll only once", async () => {
    vi.useFakeTimers();
    routineActions.runRoutineNowAction.mockResolvedValue({
      ok: true,
      data: "queued-run",
    });
    routineActions.getRoutineRunsAction
      .mockResolvedValueOnce({ runs: [], nextCursor: null })
      .mockRejectedValueOnce(new Error("refresh offline"))
      .mockRejectedValueOnce(new Error("poll offline"));
    const errors = vi.fn();
    const unregister = registerApplicationErrorHandler(errors);
    const store = makeStore();

    try {
      await store.openForEdit(makeRoutine());
      await settlePromises();
      await store.runNow();
      await vi.advanceTimersByTimeAsync(ROUTINE_RUN_POLL_INTERVAL_MS);

      expect(errors).toHaveBeenCalledTimes(1);
    } finally {
      unregister();
      store.close();
    }
  });

  it("keeps polling briefly after Test until the queued run appears", async () => {
    vi.useFakeTimers();
    routineActions.runRoutineNowAction.mockResolvedValue({
      ok: true,
      data: "queued-run",
    });
    routineActions.getRoutineRunsAction.mockResolvedValue({
      runs: [],
      nextCursor: null,
    });
    const store = makeStore();

    await store.openForEdit(makeRoutine());
    await settlePromises();
    await store.runNow();
    const initialRequests = routineActions.getRoutineRunsAction.mock.calls.length;

    await vi.advanceTimersByTimeAsync(ROUTINE_RUN_POLL_GRACE_MS + ROUTINE_RUN_POLL_INTERVAL_MS);
    const requestsAfterGrace = routineActions.getRoutineRunsAction.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ROUTINE_RUN_POLL_INTERVAL_MS * 5);

    expect(requestsAfterGrace).toBeGreaterThan(initialRequests);
    expect(routineActions.getRoutineRunsAction).toHaveBeenCalledTimes(requestsAfterGrace);
    store.close();
  });

  it("stops polling an active run at the ten-minute boundary", async () => {
    vi.useFakeTimers();
    const active = makeRun({
      status: RoutineRunStatus.running,
      terminalCode: null,
      finishedAt: null,
    });
    routineActions.getRoutineRunsAction.mockResolvedValue({
      runs: [active],
      nextCursor: null,
    });
    const store = makeStore();

    await store.openForEdit(makeRoutine());
    await settlePromises();
    await vi.advanceTimersByTimeAsync(ROUTINE_RUN_POLL_MAX_MS + ROUTINE_RUN_POLL_INTERVAL_MS);
    const requestsAtBoundary = routineActions.getRoutineRunsAction.mock.calls.length;
    await vi.advanceTimersByTimeAsync(ROUTINE_RUN_POLL_INTERVAL_MS * 5);

    expect(requestsAtBoundary).toBeGreaterThan(1);
    expect(routineActions.getRoutineRunsAction).toHaveBeenCalledTimes(requestsAtBoundary);
    store.close();
  });

  it("stops polling when an active run becomes terminal", async () => {
    vi.useFakeTimers();
    const active = makeRun({
      status: RoutineRunStatus.queued,
      terminalCode: null,
      finishedAt: null,
    });
    const finished = makeRun();
    routineActions.getRoutineRunsAction
      .mockResolvedValueOnce({ runs: [active], nextCursor: null })
      .mockResolvedValueOnce({ runs: [finished], nextCursor: null });
    const store = makeStore();

    await store.openForEdit(makeRoutine());
    await settlePromises();
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(10_000);

    expect(store.runs).toEqual([finished]);
    expect(routineActions.getRoutineRunsAction).toHaveBeenCalledTimes(2);
    store.close();
  });
});

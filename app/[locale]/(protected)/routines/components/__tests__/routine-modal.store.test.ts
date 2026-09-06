import type { RootStore } from "@/core/stores/root.store";
import type { RoutineDto } from "@/ee/routines/routine.schema";

import { beforeEach, describe, expect, it, vi } from "vitest";
import { autorun, runInAction } from "mobx";

import { RoutineTriggerKind } from "@/generated/prisma";
import { FilterOperatorKey } from "@/core/base/base-query-builder";

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
  getRoutineRunsAction: vi.fn(() => Promise.resolve({ runs: [], nextCursor: null })),
  pauseRoutineAction: vi.fn(),
  runRoutineNowAction: vi.fn(),
  upsertRoutineAction: vi.fn(),
}));

vi.mock("../../actions", () => routineActions);

import { RoutineModalStore } from "../routine-modal.store";

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

function makeStore(
  chat: {
    selectConversation: () => Promise<void>;
    newConversation: () => void;
  } = {
    selectConversation: vi.fn(() => Promise.resolve()),
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
  } as unknown as RootStore);
}

describe("RoutineModalStore", () => {
  beforeEach(() => vi.clearAllMocks());

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
      selectConversation: vi.fn(() => Promise.resolve()),
      newConversation: vi.fn(),
    };
    const store = makeStore(chat);

    await store.openRun({
      id: "run-1",
      conversationId: "conv-1",
      executedByUserId: OWNER_ID,
    } as never);
    expect(chat.selectConversation).toHaveBeenCalledWith("conv-1");

    await store.openRun({
      id: "run-2",
      conversationId: null,
      executedByUserId: OWNER_ID,
    } as never);

    expect(chat.newConversation).toHaveBeenCalled();
    expect(chat.selectConversation).toHaveBeenCalledTimes(1);
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
      selectConversation: vi.fn(() => Promise.resolve()),
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
    expect(chat.selectConversation).not.toHaveBeenCalled();
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
});

import type { RootStore } from "@/core/stores/root.store";
import type { RoutineDto, RoutineRunDto } from "@/ee/routines/routine.schema";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  registerApplicationErrorHandler,
  registerWorkspaceChangedHandler,
} from "@/core/errors/report-application-error";
import { createCrmPreset } from "@/features/records/crm-preset";
import { RoutineRunStatus, RoutineTriggerKind } from "@/generated/prisma";

const routineActions = vi.hoisted(() => ({
  deleteRoutineAction: vi.fn(),
  getRoutineFilterFieldsAction: vi.fn(),
  getRoutineRunsAction: vi.fn(),
  pauseRoutineAction: vi.fn(),
  runRoutineNowAction: vi.fn(),
  upsertRoutineAction: vi.fn(),
}));

vi.mock("../../actions", () => routineActions);
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ROUTINE_RUN_POLL_INTERVAL_MS, RoutineModalStore } from "../routine-modal.store";

const OWNER_ID = "30000000-0000-4000-8000-000000000010";
const ROUTINE_ID = "30000000-0000-4000-8000-000000000001";

const routine = {
  id: ROUTINE_ID,
  ownerUserId: OWNER_ID,
  owner: { id: OWNER_ID, firstName: "Mara", lastName: "Owner", avatarUrl: null, status: "active" },
  name: "Daily deal digest",
  prompt: "List the three most recently updated deals.",
  enabled: true,
  triggerKind: RoutineTriggerKind.schedule,
  cronExpression: "0 9 * * *",
  timezone: "Europe/Berlin",
  triggerEvents: [],
  triggerFilters: [],
} as unknown as RoutineDto;

const activeRun = {
  id: "50000000-0000-4000-8000-000000000001",
  routineId: ROUTINE_ID,
  executedByUserId: OWNER_ID,
  executedByName: "Mara Owner",
  conversationId: null,
  turnRequestId: null,
  status: RoutineRunStatus.running,
  triggerKind: RoutineTriggerKind.schedule,
  triggerEvent: null,
  triggerEntityId: null,
  triggerContext: null,
  scheduledFor: new Date("2026-09-08T09:00:00Z"),
  startedAt: new Date("2026-09-08T09:00:01Z"),
  finishedAt: null,
  terminalCode: null,
  stopReason: null,
  chargedCredits: 0,
  summary: null,
  error: null,
  createdAt: new Date("2026-09-08T09:00:00Z"),
  updatedAt: new Date("2026-09-08T09:00:01Z"),
} as unknown as RoutineRunDto;

function makeStore(): RoutineModalStore {
  return new RoutineModalStore({
    registerModalStore: vi.fn(),
    userStore: { user: { id: OWNER_ID, role: { isSystemRole: false } }, can: vi.fn(() => true) },
    routinesStore: {
      upsertItem: vi.fn(() => Promise.resolve()),
      removeItem: vi.fn(() => Promise.resolve()),
      refresh: vi.fn(() => Promise.resolve()),
    },
    routineRunChatStore: {
      conversationId: null,
      isWorking: false,
      selectConversationForEmbeddedViewer: vi.fn(() => Promise.resolve()),
      newConversation: vi.fn(),
    },
    localeStore: { getTranslation: (key: string) => key },
  } as unknown as RootStore);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("RoutineModalStore in a tab whose workspace changed", () => {
  it("stops polling the runs at the first refusal and reports nothing", async () => {
    vi.useFakeTimers();
    routineActions.getRoutineFilterFieldsAction.mockResolvedValue({ recordModel: createCrmPreset(ROUTINE_ID) });
    routineActions.getRoutineRunsAction
      .mockResolvedValueOnce({ runs: [activeRun], nextCursor: null })
      .mockRejectedValue(Object.assign(new Error("redacted"), { digest: "CUSTOMERMATES_WORKSPACE_CHANGED" }));
    const showDialog = vi.fn();
    const reported = vi.fn();
    const unregisterDialog = registerWorkspaceChangedHandler(showDialog);
    const unregisterErrors = registerApplicationErrorHandler(reported);
    const store = makeStore();

    try {
      await store.openForEdit(routine);
      await vi.advanceTimersByTimeAsync(ROUTINE_RUN_POLL_INTERVAL_MS * 6);

      expect(routineActions.getRoutineRunsAction).toHaveBeenCalledTimes(2);
      expect(showDialog).toHaveBeenCalledOnce();
      expect(reported).not.toHaveBeenCalled();
    } finally {
      unregisterDialog();
      unregisterErrors();
      store.close();
    }
  });
});

import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { RoutineRunDto } from "@/ee/routines/routine.schema";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RoutineRunStatus, RoutineTriggerKind } from "@/generated/prisma";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { owner?: string }) =>
    values?.owner === undefined ? key : `${key}:${values.owner}`,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({ formatRelativeTime: () => "just now" }),
}));
vi.mock("@/core/errors/report-application-error", () => ({
  runUserAction: (operation: () => unknown) => operation(),
}));
vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ai-elements/message", () => ({
  MessageResponse: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("@/components/ui/tooltip", () => ({
  Tooltip: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
  TooltipContent: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}));
vi.mock("../routine-empty-state", () => ({
  RoutineEmptyState: () => <div data-routine-runs-empty="true">No runs yet</div>,
}));
import { RoutineRunsPane } from "../routine-runs-pane";

const OWNER_ID = "30000000-0000-4000-8000-000000000010";

function makeRun(overrides: Partial<RoutineRunDto> = {}): RoutineRunDto {
  return {
    id: "run-1",
    routineId: "routine-1",
    executedByUserId: OWNER_ID,
    executedByName: "Mara Owner",
    conversationId: "conversation-1",
    turnRequestId: "turn-1",
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

function makeStore(overrides: Record<string, unknown> = {}) {
  return {
    canOpenRun: (run: RoutineRunDto) => run.executedByUserId === OWNER_ID,
    isRunSelectionBlockedByActiveChat: () => false,
    isLoadingMoreRuns: false,
    loadMoreRuns: vi.fn(),
    openRun: vi.fn(),
    retryLoadRuns: vi.fn(),
    runs: [] as RoutineRunDto[],
    runsNextCursor: null as string | null,
    runsRequestState: "ready",
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(store: ReturnType<typeof makeStore>) {
  act(() => root.render(<RoutineRunsPane store={store as never} />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("RoutineRunsPane rendered states", () => {
  it.each(["idle", "loading"])("renders the %s state as busy", (runsRequestState) => {
    render(makeStore({ runsRequestState }));
    expect(container.querySelector("[role='status'][aria-busy='true']")).not.toBeNull();
  });

  it("renders a retryable initial error", () => {
    const retryLoadRuns = vi.fn();
    render(makeStore({ retryLoadRuns, runsRequestState: "error" }));

    expect(container.querySelector("[role='alert']")).not.toBeNull();
    act(() => container.querySelector<HTMLButtonElement>("button")?.click());
    expect(retryLoadRuns).toHaveBeenCalledTimes(1);
  });

  it("renders a genuine empty state only after loading is ready", () => {
    render(makeStore());
    expect(container.querySelector("[data-routine-runs-empty='true']")).not.toBeNull();
    expect(container.querySelector("[role='status']")).toBeNull();
  });

  it("renders rows, pagination, and unique controls", () => {
    const first = makeRun();
    const second = makeRun({ id: "run-2", conversationId: null, status: RoutineRunStatus.queued });
    render(makeStore({ runs: [first, second], runsNextCursor: "cursor-2" }));

    expect(container.querySelectorAll("[role='listitem']")).toHaveLength(2);
    expect(container.querySelector("#routine-runs-load-more")).not.toBeNull();
    expect(container.querySelector("#routine-run-run-2")).not.toBeNull();
    const ids = [...container.querySelectorAll<HTMLElement>("[id]")].map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("opens an active run without a conversation and leaves restricted transcripts disabled", () => {
    const active = makeRun({ conversationId: null, status: RoutineRunStatus.running });
    const restricted = makeRun({ id: "run-2", executedByUserId: "another-user" });
    const openRun = vi.fn();
    render(makeStore({ openRun, runs: [active, restricted] }));

    act(() => container.querySelector<HTMLButtonElement>("#routine-run-run-1")?.click());
    expect(openRun).toHaveBeenCalledWith(active);
    expect(container.querySelector("#routine-run-run-2")?.getAttribute("aria-disabled")).toBe("true");
  });

  it("blocks switching to another run while the embedded chat is working", () => {
    const active = makeRun();
    const blocked = makeRun({ id: "run-2", conversationId: "conversation-2" });
    const openRun = vi.fn();
    render(
      makeStore({
        isRunSelectionBlockedByActiveChat: (run: RoutineRunDto) => run.id === blocked.id,
        openRun,
        runs: [active, blocked],
      }),
    );

    act(() => container.querySelector<HTMLButtonElement>("#routine-run-run-1")?.click());
    expect(openRun).toHaveBeenCalledWith(active);
    expect(container.querySelector("#routine-run-run-2")?.getAttribute("aria-disabled")).toBe("true");
    expect(container.textContent).toContain("AgentChat.ui.assistantWorking");
  });
});

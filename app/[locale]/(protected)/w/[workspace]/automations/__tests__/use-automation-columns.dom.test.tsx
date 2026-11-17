import type { ReactNode } from "react";
import type { Root } from "react-dom/client";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: { count?: number; name?: string }) =>
    values?.count !== undefined ? `${key}:${values.count}` : values?.name ? `${key}:${values.name}` : key,
}));
vi.mock("@/core/stores/use-hydrated-intl-store", () => ({
  useHydratedIntlStore: () => ({
    formatRelativeTime: () => "just now",
    formatNumericalShortDateTime: () => "16 Nov",
    formatTime: () => "08:00",
    resolvedFormattingLanguageTag: "en",
  }),
}));
vi.mock("@/components/chip/app-chip", () => ({
  AppChip: ({ children, variant }: { children: ReactNode; variant?: string }) => (
    <span data-chip={variant}>{children}</span>
  ),
}));
vi.mock("../components/automation-item-sentence", () => ({
  automationItemSentence: (item: { name: string }) => `sentence of ${item.name}`,
}));

import { useAutomationColumns } from "../components/use-automation-columns";

const OWNER = "00000000-0000-4000-8000-000000000010";

function item(overrides: Partial<AutomationListItemDto> = {}): AutomationListItemDto {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    kind: "rule",
    name: "Follow up",
    enabled: true,
    disabledReason: null,
    runsOn: "free",
    lastRunAt: new Date("2026-11-15T08:00:00.000Z"),
    lastRunStatus: "succeeded",
    runs30d: 14,
    ownerUserId: OWNER,
    owner: { id: OWNER, firstName: "Ben", lastName: "Fischer", avatarUrl: null, status: "active" },
    createdAt: new Date("2026-11-01T00:00:00.000Z"),
    updatedAt: new Date("2026-11-01T00:00:00.000Z"),
    rule: null,
    routine: null,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function Row({
  entry,
  onToggle,
  canToggle = true,
  pendingId = null,
}: {
  entry: AutomationListItemDto;
  onToggle: (item: AutomationListItemDto, enabled: boolean) => void;
  canToggle?: boolean;
  pendingId?: string | null;
}) {
  const columns = useAutomationColumns({
    model: { lists: [], relationships: [] },
    pendingId,
    canToggle: () => canToggle,
    onToggle,
  });
  return (
    <div>
      {columns.map((column) => (
        <div key={String(column.id)} data-column={column.id}>
          {typeof column.cell === "function"
            ? (column.cell as (context: unknown) => ReactNode)({ row: { original: entry } })
            : null}
        </div>
      ))}
    </div>
  );
}

function render(props: Parameters<typeof Row>[0]) {
  act(() => root.render(<Row {...props} />));
}

const cell = (id: string) => container.querySelector(`[data-column="${id}"]`);

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

describe("automation list columns", () => {
  it("shows the sentence, what it runs on, the last run, the runs of 30 days and the owner", () => {
    render({ entry: item(), onToggle: vi.fn() });

    expect(cell("name")?.textContent).toBe("Follow up");
    expect(cell("sentence")?.textContent).toBe("sentence of Follow up");
    expect(cell("runsOn")?.textContent).toBe("Automations.runsOn.free");
    expect(cell("runsOn")?.querySelector("[data-chip]")?.getAttribute("data-chip")).toBe("secondary");
    expect(cell("lastRunAt")?.textContent).toContain("RoutineRunStatus.succeeded");
    expect(cell("lastRunAt")?.textContent).toContain("just now");
    expect(cell("runs30d")?.textContent).toBe("Automations.runs30d:14");
    expect(cell("owner")?.textContent).toContain("Ben Fischer");
  });

  it("marks a routine and names the agent runtime of a rule that asks one", () => {
    render({
      entry: item({ kind: "routine", runsOn: "mate", lastRunAt: null, lastRunStatus: null }),
      onToggle: vi.fn(),
    });

    expect(cell("name")?.textContent).not.toContain("Automations.kind.routine");
    expect(cell("sentence")?.textContent).toContain("Automations.kind.routine");
    expect(cell("runsOn")?.textContent).toBe("Automations.runsOn.mate");
    expect(cell("runsOn")?.querySelector("[data-chip]")?.getAttribute("data-chip")).toBe("info");
    expect(cell("lastRunAt")?.textContent).toBe("RoutineDetail.never");
  });

  it("says a rule has not run yet", () => {
    render({ entry: item({ lastRunAt: null, lastRunStatus: null }), onToggle: vi.fn() });

    expect(cell("lastRunAt")?.textContent).toBe("Automations.neverRun");
  });

  it("switches a row off and on from the list without opening it", () => {
    const onToggle = vi.fn();
    const entry = item();
    render({ entry, onToggle });
    const rowClick = vi.fn();
    container.addEventListener("click", rowClick);
    const control = container.querySelector<HTMLButtonElement>(`[data-automation-switch="${entry.id}"]`);

    expect(control?.getAttribute("aria-checked")).toBe("true");
    act(() => control?.click());

    expect(onToggle).toHaveBeenCalledWith(entry, false);
    expect(cell("enabled")?.textContent).toContain("Automations.builder.active");
  });

  it("shows a paused row with its plan note and disables the switch while it saves or when not allowed", () => {
    const paused = item({ enabled: false, disabledReason: "planPaused" });
    render({ entry: paused, onToggle: vi.fn(), canToggle: false });

    expect(cell("enabled")?.textContent).toContain("Automations.builder.paused");
    expect(cell("enabled")?.textContent).toContain("RoutineModal.planPaused");
    expect(container.querySelector<HTMLButtonElement>("[data-automation-switch]")?.disabled).toBe(true);

    render({ entry: item(), onToggle: vi.fn(), pendingId: "20000000-0000-4000-8000-000000000001" });
    expect(container.querySelector<HTMLButtonElement>("[data-automation-switch]")?.disabled).toBe(true);
  });
});

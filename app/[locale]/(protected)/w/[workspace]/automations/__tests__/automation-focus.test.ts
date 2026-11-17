import { describe, expect, it, vi } from "vitest";

import type { RoutineDto } from "@/ee/routines/routine.schema";
import type { AutomationListItemDto } from "@/features/automation-rules/automations-list.schema";

import { openFocusedRoutine } from "../components/automation-focus";

const ROUTINE = "30000000-0000-4000-8000-000000000001";
const OTHER = "30000000-0000-4000-8000-000000000002";
const RULE = "20000000-0000-4000-8000-000000000001";

const routine = (id: string) => ({ id, name: `Routine ${id.slice(-1)}` }) as unknown as RoutineDto;
const row = (id: string, kind: "rule" | "routine") =>
  ({ id, kind, routine: kind === "routine" ? routine(id) : null, rule: null }) as unknown as AutomationListItemDto;

function handlers(items: AutomationListItemDto[], found: RoutineDto | null = routine(ROUTINE)) {
  return {
    items,
    openItem: vi.fn(),
    loadRoutine: vi.fn((_id: string) =>
      Promise.resolve(found ? { ok: true as const, data: found } : { ok: false as const, error: { errors: ["gone"] } }),
    ),
    openRoutine: vi.fn(),
    onMissing: vi.fn(),
  };
}

describe("opening the routine a link points at", () => {
  it("opens the row when the routine is on the loaded page, without asking the server", async () => {
    const page = handlers([row(OTHER, "routine"), row(ROUTINE, "routine")]);

    expect(await openFocusedRoutine(ROUTINE, page)).toBe("listed");

    expect(page.openItem).toHaveBeenCalledWith(page.items[1]);
    expect(page.loadRoutine).not.toHaveBeenCalled();
  });

  it("loads the routine by its id when it is on another page of the list and opens it", async () => {
    const page = handlers([row(OTHER, "routine"), row(RULE, "rule")]);

    expect(await openFocusedRoutine(ROUTINE, page)).toBe("loaded");

    expect(page.loadRoutine).toHaveBeenCalledWith(ROUTINE);
    expect(page.openRoutine).toHaveBeenCalledWith(routine(ROUTINE));
    expect(page.openItem).not.toHaveBeenCalled();
    expect(page.onMissing).not.toHaveBeenCalled();
  });

  it("does not take a rule with the same id for the routine", async () => {
    const page = handlers([row(ROUTINE, "rule")]);

    expect(await openFocusedRoutine(ROUTINE, page)).toBe("loaded");
    expect(page.openItem).not.toHaveBeenCalled();
  });

  it("says so when the routine is gone or not readable, and opens nothing", async () => {
    const page = handlers([], null);

    expect(await openFocusedRoutine(ROUTINE, page)).toBe("missing");

    expect(page.onMissing).toHaveBeenCalledWith({ errors: ["gone"] });
    expect(page.openRoutine).not.toHaveBeenCalled();
  });
});

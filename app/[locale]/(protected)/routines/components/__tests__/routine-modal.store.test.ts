import type { RootStore } from "@/core/stores/root.store";
import type { RoutineDto } from "@/ee/routines/routine.schema";

import { describe, expect, it, vi } from "vitest";

import { RoutineTriggerKind } from "@/generated/prisma";

const routineActions = vi.hoisted(() => ({
  deleteRoutineAction: vi.fn(),
  getRoutineFilterFieldsAction: vi.fn(() => Promise.resolve({ filterableFields: {}, customColumns: [] })),
  getRoutineRisksAction: vi.fn(() => Promise.resolve({ ok: true, data: { items: [] } })),
  getRoutineRunsAction: vi.fn(() => Promise.resolve({ ok: true, data: { items: [] } })),
  runRoutineNowAction: vi.fn(),
  upsertRoutineAction: vi.fn(),
}));

vi.mock("../../actions", () => routineActions);

import { RoutineModalStore } from "../routine-modal.store";

function makeRoutine(): RoutineDto {
  return {
    id: "30000000-0000-4000-8000-000000000001",
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
  } as unknown as RoutineDto;
}

function makeStore(): RoutineModalStore {
  return new RoutineModalStore({ registerModalStore: vi.fn() } as unknown as RootStore);
}

describe("RoutineModalStore", () => {
  it("does not carry the edited routine's id into the next create", async () => {
    const store = makeStore();

    await store.openForEdit(makeRoutine());
    expect(store.payload.id).toBe("30000000-0000-4000-8000-000000000001");

    await store.openForCreate();

    expect(store.payload.id).toBeUndefined();
    expect(store.payload.name).toBe("");
    expect(store.payload.prompt).toBe("");
  });

  it("stamps the local time zone on a routine created in the browser", async () => {
    const store = makeStore();

    await store.openForCreate();

    expect(store.payload.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

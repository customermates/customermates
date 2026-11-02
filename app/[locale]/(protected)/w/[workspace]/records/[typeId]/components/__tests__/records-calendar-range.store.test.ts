import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  mutateRecordAction: vi.fn(),
  getRecordPresentationAction: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../../../actions", () => mocks);
vi.mock("@/app/actions", () => ({}));

import { RecordsStore } from "../records.store";

const companyId = randomUUID();
const typeId = presetId(companyId, "deal");
const root = {
  recordWorkspaceStore: { invalidate: mocks.invalidate },
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;
const presentation = {
  model: createCrmPreset(companyId),
  linkColors: {},
  linkIcons: {},
  linkLabels: {},
  typeId,
  canManageSchema: true,
  permittedActions: ["readAll", "update"],
  result: { items: [] },
  query: {
    typeId,
    filters: [],
    relationships: [],
    sort: [],
    page: 1,
    pageSize: 25,
  },
  systemColumnLabels: {
    "system:createdAt": "Created at",
    "system:updatedAt": "Updated at",
    "system:assignedTo": "Assigned to",
  },
} as RecordPresentationResult;

describe("RecordsStore calendar range", () => {
  it("drops the calendar range when a server render replaces the items without a window", async () => {
    const store = new RecordsStore(root, presentation);
    store.setItems(presentation.result);
    const calendarRange = {
      from: "2026-11-01",
      to: "2026-11-30",
      total: 1,
      truncated: false,
    };
    mocks.getRecordPresentationAction.mockResolvedValue({
      ok: true,
      data: { ...presentation, result: { items: [], calendarRange } },
    });

    await store.refreshQuery();
    expect(store.calendarRange).toEqual(calendarRange);

    store.setItems({ items: [] });
    expect(store.calendarRange).toBeNull();
  });
});

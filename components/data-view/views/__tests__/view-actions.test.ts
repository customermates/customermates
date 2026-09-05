import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { isObservable, observable } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({ upsertDataViewAction: vi.fn() }));

vi.mock("@/app/actions", () => ({
  deleteDataViewAction: vi.fn(),
  upsertDataViewAction: (...args: unknown[]) => harness.upsertDataViewAction(...args),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn(() => true) }));

import { duplicateView, updateViewMeta } from "../view-actions";

type Item = { id: string };

const VIEW: DataViewChipDto = {
  id: "v-a",
  name: "Ada",
  position: 0,
  state: { filters: [], hiddenColumns: ["email"], sortDescriptor: { direction: "asc", field: "name" } },
};

function observableStore() {
  return observable({
    p13nId: "deals-card-store",
    refresh: () => Promise.resolve(),
    views: [VIEW],
  }) as unknown as BaseDataViewStore<Item>;
}

function sentPayload(): { name: string; position?: number; state: unknown } {
  return harness.upsertDataViewAction.mock.calls[0][0] as { name: string; position?: number; state: unknown };
}

describe("view actions send plain objects to the server", () => {
  beforeEach(() => {
    harness.upsertDataViewAction.mockReset().mockResolvedValue({ data: { ...VIEW, id: "v-new" }, ok: true });
  });

  it("strips the observable wrapper from the state when renaming or moving a view", async () => {
    const store = observableStore();
    const view = store.views[0];
    expect(isObservable(view.state)).toBe(true);

    await updateViewMeta(store, view, { name: "Renamed", position: 3 });

    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload).toMatchObject({ id: "v-a", name: "Renamed", position: 3, state: VIEW.state });
  });

  it("sends the store's live state, not the chip snapshot, when renaming the active view", async () => {
    const store = observable({
      activeViewKey: "v-a",
      columnOrder: [],
      columnWidths: { name: 320 },
      filters: [{ field: "stage", operator: "in", value: ["won"] }],
      grouping: null,
      hiddenColumns: [],
      p13nId: "deals-card-store",
      pagination: { page: 3, pageSize: 50 },
      refresh: () => Promise.resolve(),
      searchTerm: "acme",
      sortDescriptor: undefined,
      viewMode: "table",
      views: [VIEW],
    }) as unknown as BaseDataViewStore<Item>;

    await updateViewMeta(store, store.views[0], { name: "Renamed" });

    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload.state).toEqual({
      columnOrder: [],
      columnWidths: { name: 320 },
      filters: [{ field: "stage", operator: "in", value: ["won"] }],
      grouping: null,
      hiddenColumns: [],
      pageSize: 50,
      searchTerm: "acme",
      sortDescriptor: null,
      viewMode: "table",
    });
  });

  it("strips the observable wrapper from the state when duplicating a view", async () => {
    const store = observableStore();

    await duplicateView(store, store.views[0], { name: "Ada copy" });

    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload).toEqual({ name: "Ada copy", state: VIEW.state, surfaceKey: "deals-card-store" });
  });
});

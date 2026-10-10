import type { BaseDataViewStore } from "@/core/base/base-data-view.store";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";

import { isObservable, observable } from "mobx";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";

const harness = vi.hoisted(() => ({ upsertDataViewAction: vi.fn(), deleteDataViewAction: vi.fn() }));

vi.mock("@/app/actions", () => ({
  deleteDataViewAction: (...args: unknown[]) => harness.deleteDataViewAction(...args),
  upsertDataViewAction: (...args: unknown[]) => harness.upsertDataViewAction(...args),
}));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn(() => true) }));

import { deleteView, duplicateView, selectView, updateViewMeta, viewHref, viewLink } from "../view-actions";

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

describe("scoped record activity view links", () => {
  const path = "/en/records/person-type/person-record";
  const browser = {
    history: { pushState: vi.fn(), replaceState: vi.fn() },
    location: { origin: "http://127.0.0.1:4127", pathname: path },
  };
  beforeEach(() => {
    browser.history.pushState.mockClear();
    browser.history.replaceState.mockClear();
    harness.deleteDataViewAction
      .mockReset()
      .mockResolvedValue({ ok: true, data: { id: "view", trashBatchId: "40000000-0000-4000-8000-0000000000b1" } });
    vi.stubGlobal("window", browser);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("qualifies a timeline view and explicit All without changing ordinary list links", () => {
    expect(viewHref(path, VIEW.id, SURFACE.entityTimeline)).toBe(`${path}?view=v-a&viewSurface=entity-timeline`);
    expect(viewHref(path, ALL_VIEW_KEY, SURFACE.entityTimeline)).toBe(
      `${path}?view=${ALL_VIEW_KEY}&viewSurface=entity-timeline`,
    );
    expect(viewHref("/en/services", VIEW.id)).toBe("/en/services?view=v-a");
    expect(viewHref("/en/services", ALL_VIEW_KEY)).toBe("/en/services");
  });

  it("puts the full-page timeline selection in its scoped URL", () => {
    const store = { p13nId: SURFACE.entityTimeline, viewPathname: path, applyView: vi.fn() };
    selectView(store as unknown as BaseDataViewStore<Item>, VIEW.id, path);
    expect(store.applyView).toHaveBeenCalledExactlyOnceWith(VIEW.id);
    expect(browser.history.pushState).toHaveBeenCalledExactlyOnceWith(
      null,
      "",
      `${path}?view=v-a&viewSurface=entity-timeline`,
    );
  });

  it("keeps an embedded timeline selection in place and gives copied links their qualified record page", () => {
    const store = { p13nId: SURFACE.entityTimeline, viewPathname: path, applyView: vi.fn() };
    selectView(store as unknown as BaseDataViewStore<Item>, VIEW.id, "/en/records/person-type");
    expect(store.applyView).toHaveBeenCalledExactlyOnceWith(VIEW.id);
    expect(browser.history.pushState).not.toHaveBeenCalled();
    expect(viewLink(path, VIEW.id, SURFACE.entityTimeline)).toBe(
      `http://127.0.0.1:4127${path}?view=v-a&viewSurface=entity-timeline`,
    );
  });

  it("keeps a same-record embedded owner from changing its parent's URL", () => {
    const store = { p13nId: SURFACE.entityTimeline, viewPathname: path, viewSyncToUrl: false, applyView: vi.fn() };
    selectView(store as unknown as BaseDataViewStore<Item>, VIEW.id, path);
    expect(store.applyView).toHaveBeenCalledExactlyOnceWith(VIEW.id);
    expect(browser.history.pushState).not.toHaveBeenCalled();
  });

  it("replaces a deleted active full-page timeline URL with explicit All", async () => {
    const store = {
      p13nId: SURFACE.entityTimeline,
      viewPathname: path,
      viewSyncToUrl: true,
      activeViewKey: VIEW.id,
      applyView: vi.fn(),
      discardPendingViewState: vi.fn(),
      forgetQueryDraft: vi.fn(),
    };
    expect(await deleteView(store as unknown as BaseDataViewStore<Item>, VIEW)).toEqual({
      trashBatchId: "40000000-0000-4000-8000-0000000000b1",
    });
    expect(store.forgetQueryDraft).toHaveBeenCalledExactlyOnceWith(VIEW.id);
    expect(store.applyView).toHaveBeenCalledExactlyOnceWith(ALL_VIEW_KEY);
    expect(browser.history.replaceState).toHaveBeenCalledExactlyOnceWith(
      null,
      "",
      `${path}?view=${ALL_VIEW_KEY}&viewSurface=entity-timeline`,
    );
  });

  it("does not replace a newer selection when an earlier active-view deletion finishes", async () => {
    let finish = (_value: { ok: true; data: { id: string; trashBatchId: string } }) => {};
    harness.deleteDataViewAction.mockReturnValue(
      new Promise<{ ok: true; data: { id: string; trashBatchId: string } }>((resolve) => {
        finish = resolve;
      }),
    );
    const store = {
      p13nId: SURFACE.entityTimeline,
      viewPathname: path,
      viewSyncToUrl: true,
      activeViewKey: VIEW.id,
      applyView: vi.fn(),
      refresh: vi.fn(() => Promise.resolve()),
      discardPendingViewState: vi.fn(),
      forgetQueryDraft: vi.fn(),
    };
    const deleting = deleteView(store as unknown as BaseDataViewStore<Item>, VIEW);
    store.activeViewKey = "newer-view";
    finish({ ok: true, data: { id: VIEW.id, trashBatchId: "40000000-0000-4000-8000-0000000000b1" } });
    expect(await deleting).toEqual({ trashBatchId: "40000000-0000-4000-8000-0000000000b1" });
    expect(store.applyView).not.toHaveBeenCalled();
    expect(store.refresh).toHaveBeenCalledOnce();
    expect(browser.history.replaceState).not.toHaveBeenCalled();
  });
});

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

  it("sends the store's saved-query snapshot, not the chip snapshot, when renaming the active view", async () => {
    const snapshot = {
      columnOrder: [],
      columnWidths: { name: 320 },
      filters: [],
      grouping: null,
      hiddenColumns: [],
      pageSize: 50,
      searchTerm: "",
      sortDescriptor: null,
      viewMode: "table",
    };
    const viewStateSnapshot = vi.fn(() => snapshot);
    const store = observable({
      activeViewKey: "v-a",
      p13nId: "deals-card-store",
      refresh: () => Promise.resolve(),
      views: [VIEW],
      viewStateSnapshot,
    }) as unknown as BaseDataViewStore<Item>;

    await updateViewMeta(store, store.views[0], { name: "Renamed" });

    expect(viewStateSnapshot).toHaveBeenCalledExactlyOnceWith({ includeQuery: false });
    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload.state).toEqual(snapshot);
  });

  it("strips the observable wrapper from the state when duplicating a view", async () => {
    const store = observableStore();

    await duplicateView(store, store.views[0], { name: "Ada copy" });

    const payload = sentPayload();
    expect(isObservable(payload.state)).toBe(false);
    expect(payload).toEqual({ name: "Ada copy", state: VIEW.state, surfaceKey: "deals-card-store" });
  });
});

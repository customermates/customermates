import { TestStore, type Item } from "./fixtures/data-view-autosave-test-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams, Filter, FilterableField, SortDescriptor } from "../base-get.schema";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { RootStore } from "@/core/stores/root.store";

const { saveDataViewStateAction, selectDataViewAction, upsertDataViewAction, toastZodErrorTree } = vi.hoisted(() => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  upsertDataViewAction: vi.fn(),
  toastZodErrorTree: vi.fn(() => true),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  saveDataViewStateAction,
  selectDataViewAction,
  upsertDataViewAction,
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
}));
vi.mock("../../utils/toast-zod-error-tree", () => ({ toastZodErrorTree }));
vi.mock("@/app/[locale]/(protected)/records/actions", () => ({}));

import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";
import { FilterOperatorKey, ViewMode } from "../base-query-builder";
import { RecordActivityViewsStore } from "@/features/messaging/activities/record-activity-views.store";
import {
  forgetOtherViewQueryDrafts,
  rememberViewProposal,
  viewQueryDraftOwner,
} from "@/core/data-view/view-query-drafts";
import type { DataViewProposal } from "@/core/data-view/data-view-proposal.schema";
import type { RecordActivityPresentation } from "@/ee/messaging/activities/get-record-activity-presentation.interactor";

const VIEW_ID = "9d3a4a0e-0e34-4d7f-9f4a-2f7a2c9c1a11";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "stage", operators: [FilterOperatorKey.contains] },
] as unknown as FilterableField[];

const sort = (field: string): SortDescriptor => ({ field, direction: "asc" });

const widen = (store: { setViewOptions: TestStore["setViewOptions"] }, uid: string) =>
  store.setViewOptions({ columnWidths: { [uid]: 200 } });

const widened = (state: { columnWidths?: Record<string, number> } | undefined) =>
  Object.keys(state?.columnWidths ?? {})[0];

const filter = (value: string): Filter => ({ field: "stage", operator: FilterOperatorKey.contains, value }) as Filter;

const VIEW: DataViewChipDto = {
  id: VIEW_ID,
  name: "Open work",
  position: 0,
  state: { filters: [filter("open")] },
};

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });

  return { promise, resolve };
}

let echoPersistable = true;

function serverEcho(params?: GetQueryParams): GetResult<Item> {
  const viewFilters = params?.viewId === VIEW_ID ? VIEW.state.filters : [];

  return {
    items: [],
    p13nId: SURFACE.routines,
    filterableFields: FILTERABLE_FIELDS,
    filters: params?.filters ?? viewFilters,
    searchTerm: params?.searchTerm,
    sortDescriptor: params?.sortDescriptor,
    pagination: {
      page: params?.pagination?.page ?? 1,
      pageSize: params?.pagination?.pageSize ?? 25,
      total: 1,
      totalPages: 1,
    },
    views: [VIEW],
    activeViewKey: params?.viewId === VIEW_ID ? VIEW_ID : ALL_VIEW_KEY,
    viewPersistable: echoPersistable,
    viewMode: params?.viewMode ?? ViewMode.table,
  };
}

function rootStore(user = { id: "draft-user", companyId: "draft-company" }) {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
    userStore: { user },
  } as unknown as RootStore;
}

function hydrated(): TestStore {
  const store = new TestStore(rootStore());
  store.setItems(serverEcho({ pagination: { page: 1, pageSize: 25 } }));
  store.requestedParams = [];
  return store;
}

TestStore.echo = serverEcho;

class TestHistoryStore extends RecordActivityViewsStore {
  protected override refreshAction(params?: GetQueryParams): Promise<RecordActivityPresentation> {
    return Promise.resolve({
      ...serverEcho(params),
      items: [],
      columns: [],
      availableSources: ["audit"],
      nextCursor: null,
      p13nId: SURFACE.entityTimeline,
    });
  }
}

function historyRoot() {
  return {
    ...rootStore(),
    userStore: { user: { id: "history-user", companyId: "history-company" } },
  } as unknown as RootStore;
}

function replaceHistoryOwner(root: RootStore, patch: { id?: string; companyId?: string }) {
  const user = root.userStore.user;
  if (!user) throw new Error("Expected the History test owner");
  root.userStore.user = { ...user, ...patch };
}

function historyStore(root = historyRoot()) {
  const store = new TestHistoryStore(root, { typeId: "history-type", recordId: "history-record" });
  store.setItems({
    ...serverEcho(),
    items: [],
    columns: [],
    availableSources: ["audit"],
    nextCursor: null,
    p13nId: SURFACE.entityTimeline,
  });
  return store;
}

describe("data view autosave", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    echoPersistable = true;
    saveDataViewStateAction.mockReset();
    saveDataViewStateAction.mockResolvedValue({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: ALL_VIEW_KEY } });
    toastZodErrorTree.mockClear();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([ALL_VIEW_KEY, VIEW_ID])(
    "preserves an immediate History close in view %s without a second debounced save",
    async (viewKey) => {
      const store = historyStore();
      store.activeViewKey = viewKey;
      widen(store, "closed quickly");
      store.dispose();
      expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          surfaceKey: SURFACE.entityTimeline,
          viewKey,
          state: expect.objectContaining({ columnWidths: { ["closed quickly"]: 200 } }),
        }),
      );
      await vi.advanceTimersByTimeAsync(1500);
      expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["id", "companyId"] as const)(
    "discards a pending History save when its %s owner has changed",
    async (property) => {
      const root = historyRoot();
      const store = historyStore(root);
      widen(store, "old owner");
      replaceHistoryOwner(root, { [property]: "new owner" });
      store.dispose();
      await vi.advanceTimersByTimeAsync(1500);
      expect(saveDataViewStateAction).not.toHaveBeenCalled();
    },
  );

  it("rechecks the History owner when an unmount save waits behind an earlier request", async () => {
    const root = historyRoot();
    const store = historyStore(root);
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    widen(store, "first");
    await vi.advanceTimersByTimeAsync(1000);
    widen(store, "queued close");
    store.dispose();
    replaceHistoryOwner(root, { id: "new owner" });
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(widened(store.allViewState)).toBeUndefined();
  });

  it("saves the latest owned History snapshot after an in-flight request during immediate close", async () => {
    const store = historyStore();
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    widen(store, "first");
    await vi.advanceTimersByTimeAsync(1000);
    widen(store, "latest close");
    store.dispose();
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
    expect(widened(saveDataViewStateAction.mock.calls[1]?.[0]?.state)).toBe("latest close");
    expect(widened(store.allViewState)).toBe("latest close");
  });

  it("does not let an old History instance dispatch its queued snapshot after a newer instance edits the same view", async () => {
    const root = historyRoot();
    const old = historyStore(root);
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    widen(old, "first");
    await vi.advanceTimersByTimeAsync(1000);
    widen(old, "obsolete close");
    old.dispose();
    const latest = historyStore(root);
    widen(latest, "new panel");
    latest.dispose();
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction.mock.calls.map(([input]) => widened(input.state))).toEqual(["first", "new panel"]);
    expect(widened(latest.allViewState)).toBe("new panel");
  });

  it("retains explicit History discard when a view is removed", async () => {
    const store = historyStore();
    widen(store, "deleted view");
    store.discardPendingViewState();
    store.dispose();
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });

  it.each(["close", "debounce"])(
    "does not promote an older pending edit through %s after a newer History panel saved",
    async (finish) => {
      const root = historyRoot();
      const old = historyStore(root);
      widen(old, "old pending");
      const latest = historyStore(root);
      widen(latest, "newer panel");
      latest.dispose();
      await vi.advanceTimersByTimeAsync(0);
      if (finish === "close") old.dispose();
      await vi.advanceTimersByTimeAsync(1500);
      expect(saveDataViewStateAction.mock.calls.map(([input]) => widened(input.state))).toEqual(["newer panel"]);
    },
  );

  it("keeps the newer pending intent when an earlier save completes, then accepts a third panel's later edit", async () => {
    const root = historyRoot();
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    const old = historyStore(root);
    widen(old, "first");
    old.dispose();
    const pending = historyStore(root);
    widen(pending, "middle pending");
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(0);
    const latest = historyStore(root);
    widen(latest, "third panel");
    latest.dispose();
    pending.dispose();
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction.mock.calls.map(([input]) => widened(input.state))).toEqual(["first", "third panel"]);
  });

  it("does not publish a refused old-owner History save into the new user's UI", async () => {
    const root = historyRoot();
    const store = historyStore(root);
    const first = deferred<{ ok: false; error: { errors: string[] } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    widen(store, "old user");
    store.dispose();
    replaceHistoryOwner(root, { id: "new user" });
    first.resolve({ ok: false, error: { errors: ["Denied"] } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(toastZodErrorTree).not.toHaveBeenCalled();
    expect(widened(store.allViewState)).toBeUndefined();
  });

  it("keeps separate History views independent while an older request is held", async () => {
    const root = historyRoot();
    const all = historyStore(root);
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    widen(all, "all pending");
    all.dispose();
    const saved = historyStore(root);
    saved.activeViewKey = VIEW_ID;
    widen(saved, "saved panel");
    saved.dispose();
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(widened(all.allViewState)).toBe("all pending");
    expect(widened(saved.views[0]?.state)).toBe("saved panel");
  });

  it("writes nothing when the store is only hydrated from a server result", async () => {
    hydrated();

    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(selectDataViewAction).not.toHaveBeenCalled();
  });

  it("awaits a saved-view reload without rewriting its selection or resubmitting local overrides", async () => {
    const store = hydrated();
    const response = deferred<GetResult<Item>>();
    store.nextRefresh = () => response.promise;
    let completed = false;
    const reload = store.reloadSavedView().then(() => {
      completed = true;
    });

    expect(completed).toBe(false);
    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.routines, viewId: ALL_VIEW_KEY }]);
    expect(selectDataViewAction).not.toHaveBeenCalled();
    response.resolve({ ...serverEcho(), items: [{ id: "updated" }] });
    await reload;

    expect(completed).toBe(true);
    expect(store.items).toEqual([{ id: "updated" }]);
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });

  it("settles both an in-flight save and a debounced edit before the assistant reads saved state", async () => {
    const store = hydrated();
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    const second = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise);
    widen(store, "first");
    await vi.advanceTimersByTimeAsync(1000);
    widen(store, "latest");
    let settled = false;
    const pending = store.settleViewState().then(() => {
      settled = true;
    });
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(0);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
    expect(widened(saveDataViewStateAction.mock.calls[1]?.[0]?.state)).toBe("latest");
    expect(settled).toBe(false);
    second.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await pending;
    expect(settled).toBe(true);
    expect(widened(store.allViewState)).toBe("latest");
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
  });

  it("keeps display changes temporary and writes only a column width into the All tab", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    store.setQueryOptions({ searchTerm: "acme" });
    store.setQueryOptions({ sortDescriptor: { field: "stage", direction: "asc" } });
    store.setViewOptions({ hiddenColumns: ["stage"], viewMode: ViewMode.card });
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.isViewModified).toBe(true);

    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: SURFACE.routines,
      viewKey: ALL_VIEW_KEY,
      state: { filters: [], searchTerm: "", columnWidths: { stage: 240 } },
    });
  });

  it("remembers a written All tab state so switching back to All applies it instead of defaults", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await store.saveViewChanges();

    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.filters).toEqual([filter("open")]);

    store.applyView(ALL_VIEW_KEY);

    expect(store.filters).toEqual([filter("open")]);
    expect(store.searchTerm).toBe("acme");
  });

  it("writes into the active saved view once one is applied", async () => {
    const store = hydrated();

    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ surfaceKey: SURFACE.routines, viewKey: VIEW_ID }),
    );
    expect(saveDataViewStateAction.mock.calls[0]?.[0]?.state).toMatchObject({
      filters: [filter("open")],
      columnWidths: { stage: 240 },
    });
  });

  it("flushes a pending write into the view being left before switching tabs", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.requestedParams = [];

    widen(store, "won");
    await vi.advanceTimersByTimeAsync(500);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    store.applyView(ALL_VIEW_KEY);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        viewKey: VIEW_ID,
        state: expect.objectContaining({ filters: [filter("open")], columnWidths: { ["won"]: 200 } }),
      }),
    );
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(store.filters).toEqual([]);

    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(store.requestedParams.at(-1)).toMatchObject({ viewId: ALL_VIEW_KEY });
  });

  it("asks the server for the incoming view without waiting for the write into the view being left", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    widen(store, "won");
    await vi.advanceTimersByTimeAsync(500);
    store.requestedParams = [];

    store.applyView(ALL_VIEW_KEY);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.routines, viewId: ALL_VIEW_KEY }]);
  });

  it("shows the loading state at once while a write into the same view is flushed first", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    widen(store, "won");
    await vi.advanceTimersByTimeAsync(500);
    store.requestedParams = [];

    store.applyView(VIEW_ID);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.requestedParams).toEqual([]);

    await vi.advanceTimersByTimeAsync(0);

    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.routines, viewId: VIEW_ID }]);
    expect(store.dataRequest).toEqual({ status: "ready" });
  });

  it("discards a response from before the switch while the pending write is still flushing", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    const inFlight = deferred<GetResult<Item>>();
    store.nextRefresh = () => inFlight.promise;
    widen(store, "won");

    const save = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValue(save.promise);
    await vi.advanceTimersByTimeAsync(500);

    store.applyView(VIEW_ID);
    store.nextRefresh = () => deferred<GetResult<Item>>().promise;

    inFlight.resolve(serverEcho({ viewId: VIEW_ID }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.filters).toEqual([filter("open")]);
    expect(store.columnWidths).toEqual({});
  });

  it("keeps a locally written All snapshot when a response computed before that write lands after it", async () => {
    const store = hydrated();
    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;

    widen(store, "acme");
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.allViewState).toMatchObject({ columnWidths: { ["acme"]: 200 } });

    pending.resolve({ ...serverEcho({ viewId: ALL_VIEW_KEY }), allState: {} });
    await vi.advanceTimersByTimeAsync(0);

    expect(store.allViewState).toMatchObject({ columnWidths: { ["acme"]: 200 } });
  });

  it("keeps a locally written saved view snapshot when a response computed before that write lands after it", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;
    widen(store, "won");
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.views[0].state).toMatchObject({ columnWidths: { ["won"]: 200 } });

    pending.resolve(serverEcho({ p13nId: SURFACE.routines, viewId: VIEW_ID }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.views[0].state).toMatchObject({ columnWidths: { ["won"]: 200 } });
  });

  it("keeps saving into All when another tab has made a saved view the remembered selection", async () => {
    const store = hydrated();
    store.nextRefresh = () => {
      const params = store.requestedParams.at(-1);
      const remembered = params?.viewId === undefined ? { ...params, viewId: VIEW_ID } : params;
      return Promise.resolve(serverEcho(remembered));
    };

    store.setQueryOptions({ sortDescriptor: { field: "stage", direction: "desc" } });
    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.requestedParams.at(-1)).toMatchObject({ viewId: ALL_VIEW_KEY });
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ surfaceKey: SURFACE.routines, viewKey: ALL_VIEW_KEY }),
    );
  });

  it("drops a pending write when the caller discards it", async () => {
    const store = hydrated();

    widen(store, "open");
    store.discardPendingViewState();
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });

  it("mirrors a written state into the view's chip so later metadata edits carry it", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.views[0]?.state.columnWidths).toBeUndefined();

    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.views[0]?.state).toMatchObject({ filters: [filter("open")], columnWidths: { stage: 240 } });
  });

  it("leaves the chip untouched when the write is refused", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    saveDataViewStateAction.mockResolvedValue({ ok: false, error: { errors: ["nope"] } });
    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.views[0]?.state).toEqual(VIEW.state);
  });

  it("expresses a cleared query with empty values rather than omitting the keys", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await store.saveViewChanges();
    saveDataViewStateAction.mockClear();

    store.setQueryOptions({ filters: [], searchTerm: "" });
    await store.saveViewChanges();

    const state = saveDataViewStateAction.mock.calls[0]?.[0]?.state;
    expect(state).toMatchObject({ filters: [], searchTerm: "", sortDescriptor: null, grouping: null });
  });

  it("never persists a page change", async () => {
    const store = hydrated();

    store.setQueryOptions({ pagination: { page: 4, pageSize: 25 } });
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.pagination?.page).toBe(4);
  });

  it("keeps a page size change temporary until it is saved to the view", async () => {
    const store = hydrated();

    store.setQueryOptions({ pagination: { page: 1, pageSize: 100 } });
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.isViewModified).toBe(true);

    await store.saveViewChanges();

    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(saveDataViewStateAction.mock.calls[0]?.[0]?.state?.pageSize).toBe(100);
    expect(store.isViewModified).toBe(false);
  });

  it("fires nothing at all when the surface cannot persist, even once the debounce elapses", async () => {
    const store = hydrated();
    echoPersistable = false;
    store.viewPersistable = false;

    store.setQueryOptions({ filters: [filter("open")] });
    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });

    expect(store.filters).toEqual([filter("open")]);
    expect(store.columnWidths).toEqual({ stage: 240 });

    await vi.advanceTimersByTimeAsync(5000);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.viewPersistable).toBe(false);
  });

  it("surfaces a refused write and keeps the optimistic state", async () => {
    const store = hydrated();

    saveDataViewStateAction.mockResolvedValue({ ok: false, error: { errors: ["nope"] } });
    widen(store, "open");
    await vi.advanceTimersByTimeAsync(1000);

    expect(toastZodErrorTree).toHaveBeenCalledExactlyOnceWith({ errors: ["nope"] });
    expect(store.columnWidths).toEqual({ open: 200 });
    await expect(store.settleViewState()).rejects.toThrow("The current view could not be saved.");
  });

  it("fires nothing when the store has no surface key", async () => {
    const store = new TestStore(rootStore());
    store.setItems({ items: [], filterableFields: FILTERABLE_FIELDS, viewPersistable: true });
    store.requestedParams = [];

    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1500);

    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });
});

describe("same-view local column state across pending reads", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    echoPersistable = true;
    saveDataViewStateAction.mockReset();
    saveDataViewStateAction.mockResolvedValue({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: ALL_VIEW_KEY } });
    toastZodErrorTree.mockClear();
  });
  afterEach(() => vi.useRealTimers());
  it("preserves a hide made during an earlier sort query and saves the same projection with the new query", async () => {
    const store = hydrated();
    const response = deferred<GetResult<Item>>();
    store.nextRefresh = () => response.promise;
    store.setQueryOptions({ sortDescriptor: { field: "stage", direction: "asc" } });
    await vi.advanceTimersByTimeAsync(0);
    store.setViewOptions({ hiddenColumns: ["stage"] });
    response.resolve({ ...serverEcho({ sortDescriptor: { field: "stage", direction: "asc" } }), hiddenColumns: [] });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.hiddenColumns).toEqual(["stage"]);
    expect(store.sortDescriptor).toEqual({ field: "stage", direction: "asc" });
    expect(store.isViewModified).toBe(true);
    await store.saveViewChanges();
    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        surfaceKey: SURFACE.routines,
        viewKey: ALL_VIEW_KEY,
        state: expect.objectContaining({
          hiddenColumns: ["stage"],
          sortDescriptor: { field: "stage", direction: "asc" },
        }),
      }),
    );
    expect(store.allViewState.hiddenColumns).toEqual(["stage"]);
  });
  it("preserves an unpersisted column order and width that existed before an ordinary read began", async () => {
    const store = hydrated();
    store.setViewOptions({ columnOrder: ["stage"], columnWidth: { uid: "stage", width: 240 } });
    const response = deferred<GetResult<Item>>();
    store.nextRefresh = () => response.promise;
    const query = store.refreshQuery();
    response.resolve({ ...serverEcho(), columnOrder: [], columnWidths: {} });
    await query;
    expect(store.columnOrder).toEqual(["stage"]);
    expect(store.columnWidths).toEqual({ stage: 240 });
    await store.settleViewState();
    expect(saveDataViewStateAction.mock.calls[0][0].state).toMatchObject({ columnWidths: { stage: 240 } });
    expect(saveDataViewStateAction.mock.calls[0][0].state.columnOrder).toBeUndefined();
    await store.saveViewChanges();
    expect(saveDataViewStateAction.mock.calls[1][0].state).toMatchObject({
      columnOrder: ["stage"],
      columnWidths: { stage: 240 },
    });
  });
  it("preserves an in-flight write's projection without queuing a duplicate save", async () => {
    const store = hydrated();
    const save = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(save.promise);
    store.setViewOptions({ hiddenColumns: ["stage"], columnWidth: { uid: "stage", width: 260 } });
    await vi.advanceTimersByTimeAsync(1000);
    const response = deferred<GetResult<Item>>();
    store.nextRefresh = () => response.promise;
    const query = store.refreshQuery();
    response.resolve({ ...serverEcho(), hiddenColumns: [], columnWidths: {} });
    await query;
    expect(store.hiddenColumns).toEqual(["stage"]);
    expect(store.columnWidths).toEqual({ stage: 260 });
    save.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await store.settleViewState();
    expect(store.allViewState).toMatchObject({ columnWidths: { stage: 260 } });
    expect(store.isViewModified).toBe(true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).toHaveBeenCalledOnce();
  });
  it("accepts authoritative reset/default columns on an explicit reload when there are no newer local edits", async () => {
    const store = hydrated();
    store.setViewOptions({ hiddenColumns: ["stage"], columnWidth: { uid: "stage", width: 260 } });
    await store.settleViewState();
    store.nextRefresh = () => Promise.resolve({ ...serverEcho(), hiddenColumns: [], columnWidths: { stage: 320 } });
    await store.reloadSavedView();
    expect(store.hiddenColumns).toEqual([]);
    expect(store.columnWidths).toEqual({ stage: 320 });
    expect(saveDataViewStateAction).toHaveBeenCalledOnce();
  });
  it("does not carry the outgoing view's local projection into a newer view selection", async () => {
    const store = hydrated();
    const oldResponse = deferred<GetResult<Item>>();
    store.nextRefresh = () => oldResponse.promise;
    const oldQuery = store.refreshQuery();
    store.setViewOptions({ hiddenColumns: ["stage"] });
    store.nextRefresh = () =>
      Promise.resolve({ ...serverEcho({ viewId: VIEW_ID }), hiddenColumns: [], columnWidths: { stage: 300 } });
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    oldResponse.resolve({ ...serverEcho(), hiddenColumns: [] });
    await oldQuery;
    expect(store.activeViewKey).toBe(VIEW_ID);
    expect(store.hiddenColumns).toEqual([]);
    expect(store.columnWidths).toEqual({ stage: 300 });
    expect(store.isViewModified).toBe(false);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });
  it("keeps an untouched remote width while retaining a newer local hide and drops removed column identifiers", async () => {
    const store = hydrated();
    const response = deferred<GetResult<Item>>();
    store.nextRefresh = () => response.promise;
    const query = store.refreshQuery();
    store.setViewOptions({ hiddenColumns: ["stage"] });
    response.resolve({ ...serverEcho(), hiddenColumns: [], columnWidths: { stage: 320 } });
    await query;
    expect(store.hiddenColumns).toEqual(["stage"]);
    expect(store.columnWidths).toEqual({ stage: 320 });
    store.setViewOptions({ columnOrder: ["stage"], columnWidth: { uid: "stage", width: 240 } });
    const removed = deferred<GetResult<Item>>();
    store.nextRefresh = () => removed.promise;
    const refresh = store.refreshQuery();
    store.availableColumns = [{ uid: "name" }];
    removed.resolve({ ...serverEcho(), hiddenColumns: [], columnOrder: [], columnWidths: {} });
    await refresh;
    expect(store.hiddenColumns).toEqual([]);
    expect(store.columnOrder).toEqual([]);
    expect(store.columnWidths).toEqual({});
    await store.settleViewState();
    expect(saveDataViewStateAction.mock.calls[0][0].state).toMatchObject({ columnWidths: {} });
    expect(store.isViewModified).toBe(false);
  });
});

describe("modified view query", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    echoPersistable = true;
    saveDataViewStateAction.mockReset();
    saveDataViewStateAction.mockResolvedValue({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: ALL_VIEW_KEY } });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function modifiedSavedView({ searchTerm = "acme" }: { searchTerm?: string } = {}): Promise<TestStore> {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.setQueryOptions({ filters: [filter("won")], searchTerm });
    await vi.advanceTimersByTimeAsync(1500);
    return store;
  }

  it("starts clean after hydration", () => {
    expect(hydrated().isViewModified).toBe(false);
  });

  it("keeps a filter and search change temporary instead of saving it into the view", async () => {
    const store = await modifiedSavedView();

    expect(store.isViewModified).toBe(true);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.views[0]?.state).toEqual(VIEW.state);
  });

  it("saves the temporary query into the view on request and becomes clean", async () => {
    const store = await modifiedSavedView();

    await store.saveViewChanges();

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        viewKey: VIEW_ID,
        state: expect.objectContaining({ filters: [filter("won")], searchTerm: "" }),
      }),
    );
    expect(store.views[0]?.state).toMatchObject({ filters: [filter("won")], searchTerm: "" });
    expect(store.isViewModified).toBe(false);
    expect(store.searchTerm).toBe("acme");
  });

  it("resets the temporary filters to the saved ones without writing and keeps the session search", async () => {
    const store = await modifiedSavedView();
    store.requestedParams = [];

    store.resetViewChanges();
    await vi.advanceTimersByTimeAsync(1500);

    expect(store.filters).toEqual([filter("open")]);
    expect(store.searchTerm).toBe("acme");
    expect(store.isViewModified).toBe(false);
    expect(store.requestedParams.at(-1)).toMatchObject({ filters: [filter("open")] });
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });

  it("returns to a view's temporary query after visiting another view", async () => {
    const store = await modifiedSavedView();

    store.applyView(ALL_VIEW_KEY);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.isViewModified).toBe(false);

    store.requestedParams = [];
    store.applyView(VIEW_ID);

    expect(store.filters).toEqual([filter("won")]);
    expect(store.searchTerm).toBe("acme");
    expect(store.isViewModified).toBe(true);
    expect(store.requestedParams.at(-1)).toMatchObject({ viewId: VIEW_ID, filters: [filter("won")] });
  });

  it("restores the temporary query in a new page within the browser session", async () => {
    await modifiedSavedView();
    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    next.requestedParams = [];

    next.restoreQueryDraft();

    expect(next.filters).toEqual([filter("won")]);
    expect(next.searchTerm).toBe("acme");
    expect(next.isViewModified).toBe(true);
    expect(next.requestedParams.at(-1)).toMatchObject({ filters: [filter("won")], searchTerm: "acme" });
  });

  it("lets a query from the URL win over the stored temporary query", async () => {
    await modifiedSavedView();
    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, filters: [filter("lost")], pagination: { page: 1, pageSize: 25 } }));
    next.requestedParams = [];

    next.restoreQueryDraft();

    expect(next.filters).toEqual([filter("lost")]);
    expect(next.requestedParams).toEqual([]);

    const later = new TestStore(rootStore());
    later.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    later.restoreQueryDraft();
    expect(later.filters).toEqual([filter("lost")]);
  });

  it("forgets the temporary filters once they are saved or reset", async () => {
    const saved = await modifiedSavedView({ searchTerm: "" });
    await saved.saveViewChanges();
    const afterSave = new TestStore(rootStore());
    afterSave.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    afterSave.restoreQueryDraft();
    expect(afterSave.filters).toEqual([filter("open")]);

    const reset = await modifiedSavedView({ searchTerm: "" });
    reset.resetViewChanges();
    const afterReset = new TestStore(rootStore());
    afterReset.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    afterReset.restoreQueryDraft();
    expect(afterReset.filters).toEqual([filter("open")]);
  });

  it("keeps a search for the browser session without marking the view modified or offering to save it", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.setQueryOptions({ searchTerm: "acme" });
    await vi.advanceTimersByTimeAsync(1500);

    expect(store.isViewModified).toBe(false);
    await store.saveViewChanges();
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    next.restoreQueryDraft();
    expect(next.searchTerm).toBe("acme");
    expect(next.filters).toEqual([filter("open")]);
    expect(next.isViewModified).toBe(false);
  });

  it("treats the same filters in another order as unchanged", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.setQueryOptions({ filters: [filter("won"), filter("open")] });
    expect(store.isViewModified).toBe(true);
    const saved = new TestStore(rootStore());
    saved.setItems({
      ...serverEcho({ viewId: VIEW_ID, filters: [filter("open"), filter("won")] }),
      views: [{ ...VIEW, state: { filters: [filter("won"), filter("open")] } }],
    });
    expect(saved.isViewModified).toBe(false);

    const reordered = new TestStore(rootStore());
    reordered.setItems({
      ...serverEcho({ viewId: VIEW_ID, filters: [filter("open")] }),
      views: [
        {
          ...VIEW,
          state: { filters: [{ value: "open", operator: FilterOperatorKey.contains, field: "stage" } as Filter] },
        },
      ],
    });
    expect(reordered.isViewModified).toBe(false);
  });

  it("keeps drafts per person and company and forgets other people's drafts when a person signs in", async () => {
    await modifiedSavedView();
    const otherPerson = new TestStore(rootStore({ id: "someone-else", companyId: "draft-company" }));
    otherPerson.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    otherPerson.restoreQueryDraft();
    expect(otherPerson.filters).toEqual([filter("open")]);
    expect(otherPerson.isViewModified).toBe(false);

    forgetOtherViewQueryDrafts(viewQueryDraftOwner({ id: "someone-else", companyId: "draft-company" }));
    const samePerson = new TestStore(rootStore());
    samePerson.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    samePerson.restoreQueryDraft();
    expect(samePerson.filters).toEqual([filter("open")]);
  });

  it("never reports a modified query on a surface that cannot save views", async () => {
    const store = hydrated();
    store.viewPersistable = false;

    store.setQueryOptions({ filters: [filter("open")] });

    expect(store.isViewModified).toBe(false);
    await store.saveViewChanges();
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });
});

describe("temporary appearance changes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    echoPersistable = true;
    saveDataViewStateAction.mockReset();
    saveDataViewStateAction.mockResolvedValue({ ok: true, data: { viewKey: VIEW_ID } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: VIEW_ID } });
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function savedView(): Promise<TestStore> {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.requestedParams = [];
    return store;
  }

  it.each([
    ["sort", (store: TestStore) => store.setQueryOptions({ sortDescriptor: sort("stage") })],
    ["page size", (store: TestStore) => store.setQueryOptions({ pagination: { page: 1, pageSize: 100 } })],
    ["layout", (store: TestStore) => store.setViewOptions({ viewMode: ViewMode.card })],
    ["grouping", (store: TestStore) => store.setViewOptions({ grouping: { field: "stage" } })],
    ["hidden columns", (store: TestStore) => store.setViewOptions({ hiddenColumns: ["stage"] })],
    ["column order", (store: TestStore) => store.setViewOptions({ columnOrder: ["stage", "name"] })],
  ])("marks the view modified for a %s change without saving it", async (_, change) => {
    const store = await savedView();

    change(store);
    await vi.advanceTimersByTimeAsync(1500);

    expect(store.isViewModified).toBe(true);
    expect(store.isAppearanceModified).toBe(true);
    expect(store.isFilterModified).toBe(false);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });

  it("keeps a column width a personal setting that is written at once and never marks the view modified", async () => {
    const store = await savedView();

    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.isViewModified).toBe(false);
    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: SURFACE.routines,
      viewKey: VIEW_ID,
      state: { filters: [filter("open")], searchTerm: "", columnWidths: { stage: 240 } },
    });
  });

  it("becomes clean again when an appearance change is undone by hand", async () => {
    const store = await savedView();

    store.setViewOptions({ hiddenColumns: ["stage"] });
    expect(store.isViewModified).toBe(true);
    store.setViewOptions({ hiddenColumns: [] });

    expect(store.isViewModified).toBe(false);
  });

  it("saves filters and appearance together into the active view and becomes clean", async () => {
    const store = await savedView();
    store.setQueryOptions({ filters: [filter("won")] });
    store.setViewOptions({ viewMode: ViewMode.card, grouping: { field: "stage" }, hiddenColumns: ["stage"] });
    await vi.advanceTimersByTimeAsync(0);

    await store.saveViewChanges();

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        viewKey: VIEW_ID,
        state: expect.objectContaining({
          filters: [filter("won")],
          viewMode: ViewMode.card,
          grouping: { field: "stage" },
          hiddenColumns: ["stage"],
        }),
      }),
    );
    expect(store.views[0]?.state).toMatchObject({ grouping: { field: "stage" }, hiddenColumns: ["stage"] });
    expect(store.isViewModified).toBe(false);
  });

  it("resets filters and appearance to the saved view without writing", async () => {
    const store = await savedView();
    store.setQueryOptions({ filters: [filter("won")], sortDescriptor: sort("stage") });
    store.setViewOptions({ viewMode: ViewMode.card, grouping: { field: "stage" }, hiddenColumns: ["stage"] });
    await vi.advanceTimersByTimeAsync(0);

    store.resetViewChanges();
    await vi.advanceTimersByTimeAsync(1500);

    expect(store.filters).toEqual([filter("open")]);
    expect(store.sortDescriptor).toBeUndefined();
    expect(store.viewMode).toBe(ViewMode.table);
    expect(store.grouping).toBeNull();
    expect(store.hiddenColumns).toEqual([]);
    expect(store.isViewModified).toBe(false);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.requestedParams.at(-1)).toMatchObject({ filters: [filter("open")], grouping: null });

    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    next.restoreQueryDraft();
    expect(next.isViewModified).toBe(false);
  });

  it("keeps a temporary appearance when a refresh answers with the saved state", async () => {
    const store = await savedView();
    store.setViewOptions({ hiddenColumns: ["stage"], columnOrder: ["stage"] });

    store.nextRefresh = () =>
      Promise.resolve({ ...serverEcho({ viewId: VIEW_ID }), hiddenColumns: [], columnOrder: [] });
    await store.refreshQuery();

    expect(store.hiddenColumns).toEqual(["stage"]);
    expect(store.columnOrder).toEqual(["stage"]);
    expect(store.isViewModified).toBe(true);
  });

  it("keeps a temporary hidden board column when the server answers with the stored grouping", async () => {
    const store = await savedView();
    store.setViewOptions({ viewMode: ViewMode.card, grouping: { field: "stage" } });
    await store.saveViewChanges();
    store.hideGroup("value:won");
    expect(store.isViewModified).toBe(true);

    store.nextRefresh = () =>
      Promise.resolve({
        ...serverEcho({ viewId: VIEW_ID, viewMode: ViewMode.card }),
        grouping: { grouping: { field: "stage" }, groups: [] } as unknown as GetResult<Item>["grouping"],
      });
    await store.refreshQuery();

    expect(store.grouping).toEqual({ field: "stage", hidden: ["value:won"] });
    expect(store.isViewModified).toBe(true);
  });

  it("restores a temporary appearance in a new page within the browser session", async () => {
    const store = await savedView();
    store.setViewOptions({ hiddenColumns: ["stage"], viewMode: ViewMode.card });
    await vi.advanceTimersByTimeAsync(0);

    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    next.requestedParams = [];
    next.restoreQueryDraft();

    expect(next.hiddenColumns).toEqual(["stage"]);
    expect(next.viewMode).toBe(ViewMode.card);
    expect(next.isViewModified).toBe(true);
    expect(next.requestedParams.at(-1)).toMatchObject({ viewMode: ViewMode.card });
  });

  it("keeps a layout carried by the address and still knows the saved layout after a reload", async () => {
    const store = await savedView();
    store.setViewOptions({ viewMode: ViewMode.card });
    await vi.advanceTimersByTimeAsync(0);

    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, viewMode: ViewMode.card, pagination: { page: 1, pageSize: 25 } }));
    next.restoreQueryDraft();

    expect(next.viewMode).toBe(ViewMode.card);
    expect(next.isViewModified).toBe(true);
    next.resetViewChanges();
    expect(next.viewMode).toBe(ViewMode.table);
  });

  it("returns to a view's temporary appearance after visiting another view", async () => {
    const store = await savedView();
    store.setViewOptions({ hiddenColumns: ["stage"] });

    store.applyView(ALL_VIEW_KEY);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.hiddenColumns).toEqual([]);
    expect(store.isViewModified).toBe(false);

    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.hiddenColumns).toEqual(["stage"]);
    expect(store.isViewModified).toBe(true);
  });

  it("never reports appearance changes on a surface that cannot save views", async () => {
    const store = await savedView();
    store.viewPersistable = false;

    store.setViewOptions({ hiddenColumns: ["stage"] });
    await vi.advanceTimersByTimeAsync(1500);

    expect(store.isViewModified).toBe(false);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });
});

describe("assistant view proposals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    echoPersistable = true;
    saveDataViewStateAction.mockReset();
    saveDataViewStateAction.mockResolvedValue({ ok: true, data: { viewKey: VIEW_ID } });
    selectDataViewAction.mockReset();
    selectDataViewAction.mockResolvedValue({ ok: true, data: { activeViewKey: VIEW_ID } });
    upsertDataViewAction.mockReset();
    window.sessionStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const proposal = (overrides: Partial<DataViewProposal> = {}) =>
    ({
      surfaceKey: SURFACE.routines,
      viewKey: VIEW_ID,
      state: { filters: [filter("won")], sortDescriptor: sort("stage"), hiddenColumns: ["stage"] },
      ...overrides,
    }) as DataViewProposal;

  it("applies a proposal as a modified state, including display options, without saving anything", async () => {
    const store = hydrated();
    store.applyViewProposal(proposal());
    await vi.advanceTimersByTimeAsync(1500);

    expect(store.activeViewKey).toBe(VIEW_ID);
    expect(store.proposal).toEqual({ isNew: false });
    expect(store.isViewModified).toBe(true);
    expect(store.filters).toEqual([filter("won")]);
    expect(store.sortDescriptor).toEqual(sort("stage"));
    expect(store.hiddenColumns).toEqual(["stage"]);

    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
  });

  it("saves the whole proposal into the view and becomes clean", async () => {
    const store = hydrated();
    store.applyViewProposal(proposal());
    await vi.advanceTimersByTimeAsync(0);

    await store.saveViewChanges();

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        viewKey: VIEW_ID,
        state: expect.objectContaining({
          filters: [filter("won")],
          sortDescriptor: sort("stage"),
          hiddenColumns: ["stage"],
        }),
      }),
    );
    expect(store.proposal).toBeNull();
    expect(store.isViewModified).toBe(false);
  });

  it("resets a proposal back to the saved view and forgets it", async () => {
    const store = hydrated();
    store.applyViewProposal(proposal());
    await vi.advanceTimersByTimeAsync(0);

    store.resetViewChanges();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.proposal).toBeNull();
    expect(store.filters).toEqual([filter("open")]);
    expect(store.sortDescriptor).toBeUndefined();
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    next.restoreQueryDraft();
    expect(next.proposal).toBeNull();
  });

  it("restores a proposal made while the page was closed when the page opens", async () => {
    rememberViewProposal({ id: "draft-user", companyId: "draft-company" }, proposal());
    const store = new TestStore(rootStore());
    store.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));

    store.restoreQueryDraft();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.proposal).toEqual({ isNew: false });
    expect(store.filters).toEqual([filter("won")]);
    expect(store.hiddenColumns).toEqual(["stage"]);
  });

  it("saves a proposed new view as a new view and opens it", async () => {
    const created = { id: "c4b1f0de-1111-4a2b-8c3d-000000000001", name: "Won", position: 1, state: {} };
    upsertDataViewAction.mockResolvedValue({ ok: true, data: created });
    const store = hydrated();
    store.applyViewProposal(proposal({ viewKey: undefined, name: "Won" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(store.proposal).toEqual({ name: "Won", isNew: true });

    store.nextRefresh = () => {
      store.nextRefresh = () => {
        const params = store.requestedParams.at(-1);
        return Promise.resolve({
          ...serverEcho(params),
          views: [VIEW, created],
          activeViewKey: params?.viewId ?? ALL_VIEW_KEY,
        });
      };
      return Promise.resolve({ ...serverEcho(), views: [VIEW, created] });
    };
    await store.saveViewChanges();

    expect(upsertDataViewAction).toHaveBeenCalledExactlyOnceWith({
      name: "Won",
      state: expect.objectContaining({ filters: [filter("won")], sortDescriptor: sort("stage") }),
      surfaceKey: SURFACE.routines,
    });
    expect(store.proposal).toBeNull();
    expect(store.activeViewKey).toBe(created.id);
  });

  it("saves a proposed rename of an existing view together with its state", async () => {
    upsertDataViewAction.mockResolvedValue({ ok: true, data: { ...VIEW, name: "Won deals" } });
    const store = hydrated();
    store.applyViewProposal(proposal({ name: "Won deals" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.proposal).toEqual({ name: "Won deals", isNew: false });

    await store.saveViewChanges();

    expect(upsertDataViewAction).toHaveBeenCalledExactlyOnceWith({
      id: VIEW_ID,
      name: "Won deals",
      state: expect.objectContaining({ filters: [filter("won")], sortDescriptor: sort("stage") }),
      surfaceKey: SURFACE.routines,
    });
    expect(saveDataViewStateAction).not.toHaveBeenCalled();
    expect(store.proposal).toBeNull();
  });

  it("keeps the person's own search when a proposal arrives", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.setQueryOptions({ searchTerm: "acme" });

    store.applyViewProposal(proposal({ state: { sortDescriptor: sort("stage"), searchTerm: "mate" } }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.searchTerm).toBe("acme");
    expect(store.sortDescriptor).toEqual(sort("stage"));
  });

  it("starts a proposed new view from All even when another view is open", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.filters).toEqual([filter("open")]);

    store.applyViewProposal(proposal({ viewKey: undefined, name: "Sorted", state: { sortDescriptor: sort("stage") } }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(store.proposal).toEqual({ name: "Sorted", isNew: true });
    expect(store.filters).toEqual([]);
    expect(store.sortDescriptor).toEqual(sort("stage"));
  });

  it("merges a proposal into temporary filters and an earlier proposal instead of replacing them", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);
    store.setQueryOptions({ filters: [filter("lost")] });

    store.applyViewProposal(proposal({ state: { sortDescriptor: sort("stage") } }));
    await vi.advanceTimersByTimeAsync(0);
    store.applyViewProposal(proposal({ state: { hiddenColumns: ["stage"] } }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.filters).toEqual([filter("lost")]);
    expect(store.sortDescriptor).toEqual(sort("stage"));
    expect(store.hiddenColumns).toEqual(["stage"]);
    expect(store.isViewModified).toBe(true);
  });

  it("keeps display changes made while a proposal is pending for the browser session", async () => {
    const store = hydrated();
    store.applyViewProposal(proposal());
    await vi.advanceTimersByTimeAsync(0);
    store.setViewOptions({ columnWidth: { uid: "stage", width: 240 } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    const next = new TestStore(rootStore());
    next.setItems(serverEcho({ viewId: VIEW_ID, pagination: { page: 1, pageSize: 25 } }));
    next.restoreQueryDraft();
    await vi.advanceTimersByTimeAsync(0);

    expect(next.proposal).toEqual({ isNew: false });
    expect(next.columnWidths).toEqual({ stage: 240 });
    expect(next.hiddenColumns).toEqual(["stage"]);
  });

  it("ignores a proposal for another surface or an unknown view", () => {
    const store = hydrated();
    store.applyViewProposal(proposal({ surfaceKey: SURFACE.users } as Partial<DataViewProposal>));
    store.applyViewProposal(proposal({ viewKey: "c4b1f0de-1111-4a2b-8c3d-000000000009" }));
    expect(store.proposal).toBeNull();
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
  });
});

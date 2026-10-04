import { TestStore, type Item } from "./fixtures/data-view-autosave-test-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { GetResult } from "../base-get.interactor";
import type { GetQueryParams, Filter, FilterableField } from "../base-get.schema";
import type { DataViewChipDto } from "@/core/data-view/data-view-state.schema";
import type { RootStore } from "@/core/stores/root.store";

const { saveDataViewStateAction, selectDataViewAction, toastZodErrorTree } = vi.hoisted(() => ({
  saveDataViewStateAction: vi.fn(),
  selectDataViewAction: vi.fn(),
  toastZodErrorTree: vi.fn(() => true),
}));

vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock("@/app/actions", () => ({
  saveDataViewStateAction,
  selectDataViewAction,
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
import type { RecordActivityPresentation } from "@/ee/messaging/activities/get-record-activity-presentation.interactor";

const VIEW_ID = "9d3a4a0e-0e34-4d7f-9f4a-2f7a2c9c1a11";

const FILTERABLE_FIELDS: FilterableField[] = [
  { field: "stage", operators: [FilterOperatorKey.contains] },
] as unknown as FilterableField[];

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
    p13nId: SURFACE.tasks,
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

function rootStore() {
  return {
    loadingOverlayStore: { isLoading: false },
    localeStore: { getTranslation: (key: string) => key },
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it.each([ALL_VIEW_KEY, VIEW_ID])(
    "preserves an immediate History close in view %s without a second debounced save",
    async (viewKey) => {
      const store = historyStore();
      store.activeViewKey = viewKey;
      store.setQueryOptions({ filters: [filter("closed quickly")] });
      store.dispose();
      expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          surfaceKey: SURFACE.entityTimeline,
          viewKey,
          state: expect.objectContaining({ filters: [filter("closed quickly")] }),
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
      store.setQueryOptions({ filters: [filter("old owner")] });
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
    store.setQueryOptions({ searchTerm: "first" });
    await vi.advanceTimersByTimeAsync(1000);
    store.setQueryOptions({ searchTerm: "queued close" });
    store.dispose();
    replaceHistoryOwner(root, { id: "new owner" });
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(store.allViewState.searchTerm).toBeUndefined();
  });

  it("saves the latest owned History snapshot after an in-flight request during immediate close", async () => {
    const store = historyStore();
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    store.setQueryOptions({ searchTerm: "first" });
    await vi.advanceTimersByTimeAsync(1000);
    store.setQueryOptions({ searchTerm: "latest close" });
    store.dispose();
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
    expect(saveDataViewStateAction.mock.calls[1]?.[0]?.state.searchTerm).toBe("latest close");
    expect(store.allViewState.searchTerm).toBe("latest close");
  });

  it("does not let an old History instance dispatch its queued snapshot after a newer instance edits the same view", async () => {
    const root = historyRoot();
    const old = historyStore(root);
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    old.setQueryOptions({ searchTerm: "first" });
    await vi.advanceTimersByTimeAsync(1000);
    old.setQueryOptions({ searchTerm: "obsolete close" });
    old.dispose();
    const latest = historyStore(root);
    latest.setQueryOptions({ searchTerm: "new panel" });
    latest.dispose();
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction.mock.calls.map(([input]) => input.state.searchTerm)).toEqual(["first", "new panel"]);
    expect(latest.allViewState.searchTerm).toBe("new panel");
  });

  it("retains explicit History discard when a view is removed", async () => {
    const store = historyStore();
    store.setQueryOptions({ searchTerm: "deleted view" });
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
      old.setQueryOptions({ searchTerm: "old pending" });
      const latest = historyStore(root);
      latest.setQueryOptions({ searchTerm: "newer panel" });
      latest.dispose();
      await vi.advanceTimersByTimeAsync(0);
      if (finish === "close") old.dispose();
      await vi.advanceTimersByTimeAsync(1500);
      expect(saveDataViewStateAction.mock.calls.map(([input]) => input.state.searchTerm)).toEqual(["newer panel"]);
    },
  );

  it("keeps the newer pending intent when an earlier save completes, then accepts a third panel's later edit", async () => {
    const root = historyRoot();
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    const old = historyStore(root);
    old.setQueryOptions({ searchTerm: "first" });
    old.dispose();
    const pending = historyStore(root);
    pending.setQueryOptions({ searchTerm: "middle pending" });
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(0);
    const latest = historyStore(root);
    latest.setQueryOptions({ searchTerm: "third panel" });
    latest.dispose();
    pending.dispose();
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction.mock.calls.map(([input]) => input.state.searchTerm)).toEqual([
      "first",
      "third panel",
    ]);
  });

  it("does not publish a refused old-owner History save into the new user's UI", async () => {
    const root = historyRoot();
    const store = historyStore(root);
    const first = deferred<{ ok: false; error: { errors: string[] } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    store.setQueryOptions({ searchTerm: "old user" });
    store.dispose();
    replaceHistoryOwner(root, { id: "new user" });
    first.resolve({ ok: false, error: { errors: ["Denied"] } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(toastZodErrorTree).not.toHaveBeenCalled();
    expect(store.allViewState.searchTerm).toBeUndefined();
  });

  it("keeps separate History views independent while an older request is held", async () => {
    const root = historyRoot();
    const all = historyStore(root);
    const first = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValueOnce(first.promise);
    all.setQueryOptions({ searchTerm: "all pending" });
    all.dispose();
    const saved = historyStore(root);
    saved.activeViewKey = VIEW_ID;
    saved.setQueryOptions({ searchTerm: "saved panel" });
    saved.dispose();
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(1500);
    expect(all.allViewState.searchTerm).toBe("all pending");
    expect(saved.views[0]?.state.searchTerm).toBe("saved panel");
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
    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.tasks, viewId: ALL_VIEW_KEY }]);
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
    store.setQueryOptions({ searchTerm: "first" });
    await vi.advanceTimersByTimeAsync(1000);
    store.setQueryOptions({ searchTerm: "latest" });
    let settled = false;
    const pending = store.settleViewState().then(() => {
      settled = true;
    });
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    first.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await vi.advanceTimersByTimeAsync(0);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
    expect(saveDataViewStateAction.mock.calls[1]?.[0]?.state.searchTerm).toBe("latest");
    expect(settled).toBe(false);
    second.resolve({ ok: true, data: { viewKey: ALL_VIEW_KEY } });
    await pending;
    expect(settled).toBe(true);
    expect(store.allViewState.searchTerm).toBe("latest");
    await vi.advanceTimersByTimeAsync(1500);
    expect(saveDataViewStateAction).toHaveBeenCalledTimes(2);
  });

  it("fires exactly one debounced write carrying the whole state into the All tab after a query change", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
    store.setQueryOptions({ searchTerm: "acme" });
    store.setQueryOptions({ sortDescriptor: { field: "stage", direction: "asc" } });

    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: SURFACE.tasks,
      viewKey: ALL_VIEW_KEY,
      state: {
        filters: [filter("open")],
        searchTerm: "acme",
        sortDescriptor: { field: "stage", direction: "asc" },
        pageSize: 25,
        viewMode: ViewMode.table,
        grouping: null,
        columnOrder: [],
        columnWidths: {},
        hiddenColumns: [],
      },
    });
  });

  it("remembers a written All tab state so switching back to All applies it instead of defaults", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await vi.advanceTimersByTimeAsync(1000);

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
      expect.objectContaining({ surfaceKey: SURFACE.tasks, viewKey: VIEW_ID }),
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

    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(500);
    expect(saveDataViewStateAction).not.toHaveBeenCalled();

    store.applyView(ALL_VIEW_KEY);

    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ viewKey: VIEW_ID, state: expect.objectContaining({ filters: [filter("won")] }) }),
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

    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(500);
    store.requestedParams = [];

    store.applyView(ALL_VIEW_KEY);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.tasks, viewId: ALL_VIEW_KEY }]);
  });

  it("shows the loading state at once while a write into the same view is flushed first", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(500);
    store.requestedParams = [];

    store.applyView(VIEW_ID);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.requestedParams).toEqual([]);

    await vi.advanceTimersByTimeAsync(0);

    expect(store.requestedParams).toEqual([{ p13nId: SURFACE.tasks, viewId: VIEW_ID }]);
    expect(store.dataRequest).toEqual({ status: "ready" });
  });

  it("discards a response from before the switch while the pending write is still flushing", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    const inFlight = deferred<GetResult<Item>>();
    store.nextRefresh = () => inFlight.promise;
    store.setQueryOptions({ filters: [filter("won")] });

    const save = deferred<{ ok: true; data: { viewKey: string } }>();
    saveDataViewStateAction.mockReturnValue(save.promise);
    await vi.advanceTimersByTimeAsync(500);

    store.applyView(VIEW_ID);
    store.nextRefresh = () => deferred<GetResult<Item>>().promise;

    inFlight.resolve(serverEcho({ viewId: VIEW_ID, filters: [filter("won")] }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.dataRequest).toEqual({ status: "refreshing" });
    expect(store.filters).toEqual([filter("open")]);
  });

  it("keeps a locally written All snapshot when a response computed before that write lands after it", async () => {
    const store = hydrated();
    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;

    store.setQueryOptions({ filters: [filter("open")], searchTerm: "acme" });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.allViewState).toMatchObject({ filters: [filter("open")], searchTerm: "acme" });

    pending.resolve({ ...serverEcho({ viewId: ALL_VIEW_KEY }), allState: {} });
    await vi.advanceTimersByTimeAsync(0);

    expect(store.allViewState).toMatchObject({ filters: [filter("open")], searchTerm: "acme" });
  });

  it("keeps a locally written saved view snapshot when a response computed before that write lands after it", async () => {
    const store = hydrated();
    store.applyView(VIEW_ID);
    await vi.advanceTimersByTimeAsync(0);

    const pending = deferred<GetResult<Item>>();
    store.nextRefresh = () => pending.promise;
    store.setQueryOptions({ filters: [filter("won")] });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.views[0].state).toMatchObject({ filters: [filter("won")] });

    pending.resolve(serverEcho({ p13nId: SURFACE.tasks, viewId: VIEW_ID }));
    await vi.advanceTimersByTimeAsync(0);

    expect(store.views[0].state).toMatchObject({ filters: [filter("won")] });
  });

  it("keeps saving into All when another tab has made a saved view the remembered selection", async () => {
    const store = hydrated();
    store.nextRefresh = () => {
      const params = store.requestedParams.at(-1);
      const remembered = params?.viewId === undefined ? { ...params, viewId: VIEW_ID } : params;
      return Promise.resolve(serverEcho(remembered));
    };

    store.setQueryOptions({ sortDescriptor: { field: "stage", direction: "desc" } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(store.requestedParams.at(-1)).toMatchObject({ viewId: ALL_VIEW_KEY });
    expect(store.activeViewKey).toBe(ALL_VIEW_KEY);
    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ surfaceKey: SURFACE.tasks, viewKey: ALL_VIEW_KEY }),
    );
  });

  it("drops a pending write when the caller discards it", async () => {
    const store = hydrated();

    store.setQueryOptions({ filters: [filter("open")] });
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
    await vi.advanceTimersByTimeAsync(1000);
    saveDataViewStateAction.mockClear();

    store.setQueryOptions({ filters: [], searchTerm: "" });
    await vi.advanceTimersByTimeAsync(1000);

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

  it("persists a page size change, because a page size is stored state", async () => {
    const store = hydrated();

    store.setQueryOptions({ pagination: { page: 1, pageSize: 100 } });
    await vi.advanceTimersByTimeAsync(1000);

    expect(saveDataViewStateAction).toHaveBeenCalledTimes(1);
    expect(saveDataViewStateAction.mock.calls[0]?.[0]?.state?.pageSize).toBe(100);
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
    store.setQueryOptions({ filters: [filter("open")] });
    await vi.advanceTimersByTimeAsync(1000);

    expect(toastZodErrorTree).toHaveBeenCalledExactlyOnceWith({ errors: ["nope"] });
    expect(store.filters).toEqual([filter("open")]);
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
  it("preserves a hide made during an earlier sort query and writes the same projection with the new query", async () => {
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
    await store.settleViewState();
    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        surfaceKey: SURFACE.tasks,
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
    expect(saveDataViewStateAction.mock.calls[0][0].state).toMatchObject({
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
    expect(store.allViewState).toMatchObject({ hiddenColumns: ["stage"], columnWidths: { stage: 260 } });
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
    expect(saveDataViewStateAction).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ viewKey: ALL_VIEW_KEY, state: expect.objectContaining({ hiddenColumns: ["stage"] }) }),
    );
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
    expect(saveDataViewStateAction.mock.calls[0][0].state).toMatchObject({
      hiddenColumns: [],
      columnOrder: [],
      columnWidths: {},
    });
  });
});

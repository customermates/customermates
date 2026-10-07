import type { UpdateWidgetLayoutsData } from "@/features/widget/update-widget-layouts.interactor";
import { WidgetKind } from "@/generated/prisma";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import { DisplayType, type WidgetDto } from "@/features/widget/widget.schema";

const { refreshWidgetsAction, updateWidgetLayoutsAction, captureException } = vi.hoisted(() => ({
  refreshWidgetsAction: vi.fn(),
  updateWidgetLayoutsAction: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("../../actions", () => ({
  refreshWidgetsAction,
  updateWidgetLayoutsAction,
}));

vi.mock("@sentry/nextjs", () => ({ captureException }));

vi.mock("@/app/actions", () => ({
  bulkDeleteEntitiesAction: vi.fn(),
  bulkUpdateCustomFieldValuesAction: vi.fn(),
  getCustomColumnsByEntityTypeAction: vi.fn(),
  updateEntityCustomFieldValueAction: vi.fn(),
  upsertP13nAction: vi.fn(),
}));

import { registerApplicationErrorHandler } from "@/core/errors/report-application-error";
import { WidgetsStore } from "../widgets.store";

const FIRST_ID = "00000000-0000-4000-8000-000000000001";
const SECOND_ID = "00000000-0000-4000-8000-000000000002";

function widget(id: string, x: number, y: number): WidgetDto {
  return {
    companyId: "company-1",
    version: 1,
    createdAt: new Date(0),
    data: null,
    status: "ready",
    groupOptions: [],
    displayOptions: { displayType: DisplayType.verticalBarChart },
    measure: {
      source: { typeId: "00000000-0000-4000-8000-000000000099", filters: [], relationships: [] },
      aggregation: "count",
      valueFieldId: null,
      groupBy: null,
      groupLimit: 100,
    },
    id,
    isTemplate: false,
    kind: WidgetKind.chart,
    layout: {
      lg: { h: 2, i: id, w: 3, x, y },
    },
    name: id,
    updatedAt: new Date(0),
    userId: "user-1",
  };
}

function layoutResult(layouts: UpdateWidgetLayoutsData["layouts"], version = 2) {
  const ids = new Set(Object.values(layouts).flatMap((items) => items.map((item) => item.i)));
  return {
    ok: true,
    data: [...ids].map((id) => ({
      id,
      version,
      layout: Object.fromEntries(
        Object.entries(layouts).map(([breakpoint, items]) => [breakpoint, items.find((item) => item.i === id)]),
      ),
    })),
  };
}

describe("WidgetsStore refresh compatibility", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://public@example.invalid/1");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rebuilds layouts through the setItems override and preserves custom columns", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { isLoading: false },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    store.setItems({ items: [widget(FIRST_ID, 0, 0)] });
    refreshWidgetsAction.mockResolvedValueOnce([widget(SECOND_ID, 6, 4)]);

    await store.refresh();

    expect(store.items.map(({ id }) => id)).toEqual([SECOND_ID]);
    expect(store.layouts.lg).toEqual([{ h: 2, i: SECOND_ID, w: 3, x: 6, y: 4 }]);
    expect(store.layouts.lg).not.toEqual(expect.arrayContaining([expect.objectContaining({ i: FIRST_ID })]));
    expect(store.isReady).toBe(true);
    expect(store.isRefreshing).toBe(false);
    expect(store.dataRequest).toEqual({ status: "ready" });
  });

  it("reports a rejected layout write instead of leaving the dropped promise unhandled", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    const initial = widget(FIRST_ID, 0, 0);
    refreshWidgetsAction.mockResolvedValueOnce([initial]);
    await store.refresh();

    const error = new Error("layout write failed");
    updateWidgetLayoutsAction.mockRejectedValueOnce(error);
    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((reported) => seen.push(reported));
    const before = JSON.parse(JSON.stringify(store.layouts)) as typeof store.layouts;
    const moved = {
      ...store.layouts,
      lg: [{ h: 2, i: FIRST_ID, w: 3, x: 1, y: 0 }],
    };

    store.onLayoutChange([], moved);

    await vi.waitFor(() => expect(seen).toEqual([error]));
    expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(1);
    expect(store.layouts).toEqual(before);
    expect(store.layouts).not.toEqual(moved);
    expect(captureException).toHaveBeenCalledExactlyOnceWith(error);
    unregister();
  });

  it("reverts the layout when the server rejects the write without throwing", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    const initial = widget(FIRST_ID, 0, 0);
    refreshWidgetsAction.mockResolvedValueOnce([initial]);
    await store.refresh();

    updateWidgetLayoutsAction.mockResolvedValueOnce({ ok: false, error: { errors: ["nope"] } });
    const before = JSON.parse(JSON.stringify(store.layouts)) as typeof store.layouts;
    const moved = { ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 1, y: 0 }] };

    store.onLayoutChange([], moved);

    await vi.waitFor(() => expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(store.layouts).toEqual(before));
    expect(store.layouts).not.toEqual(moved);
  });

  it("serializes layout writes and persists only the newest queued arrangement", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    refreshWidgetsAction.mockResolvedValueOnce([widget(FIRST_ID, 0, 0)]);
    await store.refresh();
    const first = Promise.withResolvers<unknown>();
    updateWidgetLayoutsAction
      .mockReturnValueOnce(first.promise)
      .mockImplementation(({ layouts }: UpdateWidgetLayoutsData) => Promise.resolve(layoutResult(layouts, 3)));
    const move = (x: number) => ({ ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x, y: 0 }] });
    store.onLayoutChange([], move(1));
    store.onLayoutChange([], move(2));
    const final = move(3);
    store.onLayoutChange([], final);
    expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(1);
    first.resolve(layoutResult(updateWidgetLayoutsAction.mock.calls[0][0].layouts));
    await vi.waitFor(() => expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(2));
    expect(updateWidgetLayoutsAction.mock.calls[1][0].layouts.lg).toEqual(final.lg);
    expect(store.layouts).toEqual(final);
  });

  it("keeps a queued layout after failure and rolls back a later failure to the last successful arrangement", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    refreshWidgetsAction.mockResolvedValueOnce([widget(FIRST_ID, 0, 0)]);
    await store.refresh();
    const first = Promise.withResolvers<unknown>();
    const second = Promise.withResolvers<unknown>();
    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((error) => seen.push(error));
    try {
      updateWidgetLayoutsAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
      store.onLayoutChange([], { ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 1, y: 0 }] });
      const latest = { ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 2, y: 0 }] };
      store.onLayoutChange([], latest);
      const error = new Error("Earlier layout failed");
      first.reject(error);
      await vi.waitFor(() => expect(seen).toEqual([error]));
      await vi.waitFor(() => expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(2));
      expect(store.layouts).toEqual(latest);
      second.resolve(layoutResult(updateWidgetLayoutsAction.mock.calls[1][0].layouts, 3));
      await vi.waitFor(() => expect(store.layouts).toEqual(latest));
      const failure = new Error("Latest layout failed");
      updateWidgetLayoutsAction.mockRejectedValueOnce(failure);
      store.onLayoutChange([], { ...latest, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 3, y: 0 }] });
      await vi.waitFor(() => expect(seen).toEqual([error, failure]));
      expect(store.layouts).toEqual(latest);
    } finally {
      unregister();
    }
  });

  it("rebases queued layouts onto current widgets and rejects another actor's queued writes", async () => {
    for (const replacement of ["collection", "actor"] as const) {
      updateWidgetLayoutsAction.mockReset();
      const root = {
        userStore: { user: { id: "user-1", companyId: "company-1" } },
        localeStore: { getTranslation: (key: string) => key },
        loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
      } as unknown as RootStore;
      const store = new WidgetsStore(root);
      refreshWidgetsAction.mockResolvedValueOnce([widget(FIRST_ID, 0, 0)]);
      await store.refresh();
      const pending = Promise.withResolvers<unknown>();
      updateWidgetLayoutsAction
        .mockReturnValueOnce(pending.promise)
        .mockImplementation(({ layouts }: UpdateWidgetLayoutsData) => Promise.resolve(layoutResult(layouts, 3)));
      store.onLayoutChange([], { ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 1, y: 0 }] });
      store.onLayoutChange([], { ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 2, y: 0 }] });
      if (replacement === "collection") store.setItems({ items: [widget(SECOND_ID, 6, 4)] });
      else {
        const actor = root.userStore.user;
        if (!actor) throw new Error("The fixture requires an authenticated actor");
        root.userStore.user = { ...actor, id: "user-2" };
      }
      const current = JSON.parse(JSON.stringify(store.layouts)) as typeof store.layouts;
      const seen: unknown[] = [];
      const unregister = registerApplicationErrorHandler((error) => seen.push(error));
      try {
        pending.reject(new Error("Superseded layout failed"));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(store.layouts).toEqual(current);
        expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(1);
        expect(seen).toEqual([]);
      } finally {
        unregister();
      }
    }
  });

  it("retains pending positions across a same-collection data refresh and a subsequent removal", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    refreshWidgetsAction.mockResolvedValueOnce([widget(FIRST_ID, 0, 0), widget(SECOND_ID, 6, 4)]);
    await store.refresh();
    const first = Promise.withResolvers<unknown>();
    const second = Promise.withResolvers<unknown>();
    updateWidgetLayoutsAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const move = (x: number) => ({
      ...store.layouts,
      lg: store.layouts.lg?.map((item) => (item.i === FIRST_ID ? { ...item, x } : item)),
    });
    store.onLayoutChange([], move(1));
    store.onLayoutChange([], move(2));
    store.setItems({ items: [widget(FIRST_ID, 0, 0), widget(SECOND_ID, 6, 4)] });
    expect(store.layouts.lg?.find((item) => item.i === FIRST_ID)?.x).toBe(2);
    await store.removeItem(SECOND_ID);
    expect(store.layouts.lg?.map((item) => item.i)).toEqual([FIRST_ID]);
    first.resolve(layoutResult(updateWidgetLayoutsAction.mock.calls[0][0].layouts));
    await vi.waitFor(() => expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(2));
    expect(updateWidgetLayoutsAction.mock.calls[1][0].layouts.lg).toEqual([{ i: FIRST_ID, x: 2, y: 0, w: 3, h: 2 }]);
    second.resolve({ ok: false, error: { errors: ["Rejected latest layout"] } });
    await vi.waitFor(() => expect(store.layouts.lg?.find((item) => item.i === FIRST_ID)?.x).toBe(1));
    expect(store.layouts.lg?.map((item) => item.i)).toEqual([FIRST_ID]);
  });

  it("retains confirmed positions after a completed save followed by removing another widget", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    refreshWidgetsAction.mockResolvedValueOnce([widget(FIRST_ID, 0, 0), widget(SECOND_ID, 6, 4)]);
    await store.refresh();
    updateWidgetLayoutsAction.mockImplementationOnce(({ layouts }: UpdateWidgetLayoutsData) =>
      Promise.resolve(layoutResult(layouts)),
    );
    store.onLayoutChange([], {
      ...store.layouts,
      lg: store.layouts.lg?.map((item) => (item.i === FIRST_ID ? { ...item, x: 2 } : item)),
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateWidgetLayoutsAction.mock.calls[0][0].layouts.lg.map((item: { i: string }) => item.i)).toEqual([
      FIRST_ID,
    ]);
    expect(store.items.find((item) => item.id === SECOND_ID)?.version).toBe(1);
    await store.removeItem(SECOND_ID);
    expect(store.layouts.lg?.map((item) => ({ i: item.i, x: item.x }))).toEqual([{ i: FIRST_ID, x: 2 }]);
    expect(updateWidgetLayoutsAction).toHaveBeenCalledTimes(1);
  });

  it("rejects a pre-save refresh and stale server props after a confirmed layout write", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    refreshWidgetsAction.mockResolvedValueOnce([widget(FIRST_ID, 0, 0)]);
    await store.refresh();
    const read = Promise.withResolvers<WidgetDto[]>();
    refreshWidgetsAction.mockReturnValueOnce(read.promise);
    const refreshing = store.refresh();
    updateWidgetLayoutsAction.mockImplementationOnce(({ layouts }: UpdateWidgetLayoutsData) =>
      Promise.resolve(layoutResult(layouts)),
    );
    store.onLayoutChange([], { ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 2, y: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    read.resolve([widget(FIRST_ID, 0, 0)]);
    await refreshing;
    expect(store.layouts.lg?.find((item) => item.i === FIRST_ID)?.x).toBe(2);
    store.setItems({ items: [widget(FIRST_ID, 0, 0)] });
    expect(store.layouts.lg?.find((item) => item.i === FIRST_ID)?.x).toBe(2);
    const newer = { ...widget(FIRST_ID, 4, 0), version: 3 };
    store.setItems({ items: [newer] });
    expect(store.layouts.lg?.find((item) => item.i === FIRST_ID)?.x).toBe(4);
  });

  it("retains layout receipts without pretending that an unseen configuration version was read", async () => {
    const root = {
      localeStore: { getTranslation: (key: string) => key },
      loadingOverlayStore: { withLoading: (run: () => Promise<unknown>) => run() },
    } as unknown as RootStore;
    const store = new WidgetsStore(root);
    refreshWidgetsAction.mockResolvedValueOnce([widget(FIRST_ID, 0, 0)]);
    await store.refresh();
    updateWidgetLayoutsAction.mockImplementationOnce(({ layouts }: UpdateWidgetLayoutsData) =>
      Promise.resolve(layoutResult(layouts, 4)),
    );
    store.onLayoutChange([], { ...store.layouts, lg: [{ h: 2, i: FIRST_ID, w: 3, x: 2, y: 0 }] });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(store.items[0].version).toBe(1);
    store.setItems({ items: [{ ...widget(FIRST_ID, 0, 0), version: 3, name: "Concurrent configuration" }] });
    expect(store.items[0]).toMatchObject({ name: "Concurrent configuration", version: 3, layout: { lg: { x: 2 } } });
    store.setItems({ items: [{ ...widget(FIRST_ID, 2, 0), version: 4, name: "Confirmed configuration" }] });
    expect(store.items[0]).toMatchObject({ name: "Confirmed configuration", version: 4, layout: { lg: { x: 2 } } });
  });
});

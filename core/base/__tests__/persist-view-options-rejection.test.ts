import type { RootStore } from "@/core/stores/root.store";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const applyDataViewOverrideAction = vi.fn();

vi.mock("@/app/actions", () => ({
  applyDataViewOverrideAction: (...args: unknown[]) => applyDataViewOverrideAction(...args),
  selectDataViewAction: vi.fn(),
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn(() => true) }));
vi.mock("../../utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn(() => true) }));

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({ captureException: (...args: unknown[]) => captureException(...args) }));

import { BaseDataViewStore, type HasId, type TableColumn } from "../base-data-view.store";
import { registerApplicationErrorHandler } from "@/core/errors/report-application-error";
import { ALL_VIEW_KEY, SURFACE } from "@/core/data-view/data-view-keys";

class TestStore extends BaseDataViewStore<HasId> {
  get columnsDefinition(): TableColumn[] {
    return [];
  }
}

function makeStore() {
  const rootStore = { localeStore: { getTranslation: (key: string) => key } } as unknown as RootStore;
  const store = new TestStore(rootStore);
  store.p13nId = SURFACE.tasks;
  return store;
}

describe("persistViewState rejection handling", () => {
  let unhandled: unknown[] = [];
  const captureUnhandled = (reason: unknown) => unhandled.push(reason);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    unhandled = [];
    process.on("unhandledRejection", captureUnhandled);
  });

  afterEach(() => {
    process.off("unhandledRejection", captureUnhandled);
    vi.useRealTimers();
  });

  it("routes a rejected override write to the application error handler instead of leaving it unhandled", async () => {
    const demoError = new Error("Saving is not available in demo mode.");
    applyDataViewOverrideAction.mockRejectedValue(demoError);

    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((error) => seen.push(error));

    const store = makeStore();
    store.setViewOptions({ columnWidth: { uid: "title", width: 240 } });

    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();

    expect(applyDataViewOverrideAction).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([demoError]);

    unregister();
  });

  it("keeps the optimistic column width applied even though the write failed", async () => {
    applyDataViewOverrideAction.mockRejectedValue(new Error("Saving is not available in demo mode."));
    const unregister = registerApplicationErrorHandler(() => {});

    const store = makeStore();
    store.setViewOptions({ columnWidth: { uid: "title", width: 240 } });

    await vi.advanceTimersByTimeAsync(1500);

    expect(store.columnWidths.title).toBe(240);

    unregister();
  });

  it("does not report anything when the write succeeds", async () => {
    applyDataViewOverrideAction.mockResolvedValue({ ok: true, data: { hasOverride: true } });

    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((error) => seen.push(error));

    const store = makeStore();
    store.setViewOptions({ columnWidth: { uid: "title", width: 300 } });

    await vi.advanceTimersByTimeAsync(1500);

    expect(applyDataViewOverrideAction).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);

    unregister();
  });

  it("sends a total state for the active view key, and stays silent when the surface cannot persist", async () => {
    applyDataViewOverrideAction.mockResolvedValue({ ok: true, data: { hasOverride: true } });

    const store = makeStore();
    store.setViewOptions({ columnWidth: { uid: "title", width: 300 } });
    await vi.advanceTimersByTimeAsync(1500);

    expect(applyDataViewOverrideAction).toHaveBeenCalledExactlyOnceWith({
      surfaceKey: SURFACE.tasks,
      viewKey: ALL_VIEW_KEY,
      mode: "save",
      state: {
        filters: [],
        searchTerm: "",
        sortDescriptor: null,
        pageSize: undefined,
        viewMode: "table",
        grouping: null,
        columnOrder: [],
        columnWidths: { title: 300 },
        hiddenColumns: [],
      },
    });

    applyDataViewOverrideAction.mockClear();
    const demoStore = makeStore();
    demoStore.viewPersistable = false;
    demoStore.setViewOptions({ columnWidth: { uid: "title", width: 320 } });
    await vi.advanceTimersByTimeAsync(1500);

    expect(applyDataViewOverrideAction).not.toHaveBeenCalled();
    expect(demoStore.columnWidths.title).toBe(320);
  });
});

describe("Sentry reporting for handled application errors", () => {
  const setHostname = (hostname: string) => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, hostname },
    });
  };

  beforeEach(() => captureException.mockClear());

  it("reports a genuine failure to Sentry, because catching it hides it from the global handler", async () => {
    const { reportApplicationError } = await import("@/core/errors/report-application-error");
    setHostname("app.customermates.com");

    const boom = new Error("network down");
    reportApplicationError(boom);

    expect(captureException).toHaveBeenCalledExactlyOnceWith(boom);
  });

  it("stays silent on the demo host, where the rejection is the expected demo guard", async () => {
    const { reportApplicationError } = await import("@/core/errors/report-application-error");
    setHostname("demo.customermates.com");

    reportApplicationError(new Error("Saving is not available in demo mode."));

    expect(captureException).not.toHaveBeenCalled();
  });
});

describe("registerApplicationErrorHandler", () => {
  it("stops delivering after unregister, and a later handler wins", async () => {
    const { reportApplicationError } = await import("@/core/errors/report-application-error");

    const first: unknown[] = [];
    const unregisterFirst = registerApplicationErrorHandler((e) => first.push(e));
    reportApplicationError("a");
    unregisterFirst();
    reportApplicationError("b");

    const second: unknown[] = [];
    const unregisterSecond = registerApplicationErrorHandler((e) => second.push(e));
    reportApplicationError("c");
    unregisterSecond();

    expect(first).toEqual(["a"]);
    expect(second).toEqual(["c"]);
  });
});

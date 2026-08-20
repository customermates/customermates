import type { RootStore } from "@/core/stores/root.store";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const upsertP13nAction = vi.fn();

vi.mock("@/app/actions", () => ({
  upsertP13nAction: (...args: unknown[]) => upsertP13nAction(...args),
  upsertFilterPresetAction: vi.fn(),
  deleteFilterPresetAction: vi.fn(),
}));

vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn(() => true) }));
vi.mock("../../utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn(() => true) }));

import { BaseDataViewStore, type HasId, type TableColumn } from "../base-data-view.store";
import { registerApplicationErrorHandler } from "@/core/errors/report-application-error";

class TestStore extends BaseDataViewStore<HasId> {
  get columnsDefinition(): TableColumn[] {
    return [];
  }
}

function makeStore() {
  const rootStore = { localeStore: { getTranslation: (key: string) => key } } as unknown as RootStore;
  const store = new TestStore(rootStore);
  store.p13nId = "tasks-store";
  return store;
}

describe("persistViewOptions rejection handling", () => {
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

  it("routes a rejected p13n write to the application error handler instead of leaving it unhandled", async () => {
    const demoError = new Error("Saving is not available in demo mode.");
    upsertP13nAction.mockRejectedValue(demoError);

    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((error) => seen.push(error));

    const store = makeStore();
    store.setViewOptions({ columnWidth: { uid: "title", width: 240 } });

    await vi.advanceTimersByTimeAsync(1500);
    await Promise.resolve();

    expect(upsertP13nAction).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([demoError]);

    unregister();
  });

  it("keeps the optimistic column width applied even though the write failed", async () => {
    upsertP13nAction.mockRejectedValue(new Error("Saving is not available in demo mode."));
    const unregister = registerApplicationErrorHandler(() => {});

    const store = makeStore();
    store.setViewOptions({ columnWidth: { uid: "title", width: 240 } });

    await vi.advanceTimersByTimeAsync(1500);

    expect(store.columnWidths.title).toBe(240);

    unregister();
  });

  it("does not report anything when the write succeeds", async () => {
    upsertP13nAction.mockResolvedValue({ ok: true, data: null });

    const seen: unknown[] = [];
    const unregister = registerApplicationErrorHandler((error) => seen.push(error));

    const store = makeStore();
    store.setViewOptions({ columnWidth: { uid: "title", width: 300 } });

    await vi.advanceTimersByTimeAsync(1500);

    expect(upsertP13nAction).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);

    unregister();
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

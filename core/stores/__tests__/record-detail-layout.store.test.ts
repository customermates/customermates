import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  RecordDetailLayoutResult,
  SaveRecordDetailLayoutInput,
} from "@/features/records/record-detail-layout.schema";
import { NavigationGuardController } from "../navigation-guard.controller";

const mocks = vi.hoisted(() => ({
  readRecordDetailLayoutAction: vi.fn(),
  saveRecordDetailLayoutAction: vi.fn(),
  report: vi.fn(),
  toast: vi.fn(),
}));
vi.mock("@/app/[locale]/(protected)/records/actions", () => mocks);
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: mocks.report }));
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: mocks.toast }));
import { RecordDetailLayoutStore } from "../record-detail-layout.store";

const stores: RecordDetailLayoutStore[] = [];
function fixture() {
  const state: RecordDetailLayoutResult = {
    typeId: randomUUID(),
    schemaRevision: 1,
    hasPersonalization: false,
    layout: { pinnedFields: [], hiddenFields: [], fieldOrder: [] },
    fields: [
      { id: "system:createdAt", label: "Created" },
      { id: "system:updatedAt", label: "Updated" },
    ],
  };
  const store = new RecordDetailLayoutStore(state);
  stores.push(store);
  mocks.readRecordDetailLayoutAction.mockResolvedValue({ ok: true, data: state });
  mocks.saveRecordDetailLayoutAction.mockImplementation((input: SaveRecordDetailLayoutInput) =>
    Promise.resolve({
      ok: true,
      data: {
        ...state,
        schemaRevision: input.expectedRevision,
        hasPersonalization: input.layout !== null,
        layout: input.layout ?? state.layout,
      },
    }),
  );
  return { state, store };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
});
afterEach(() => {
  for (const store of stores.splice(0)) store.dispose();
  vi.useRealTimers();
});

describe("record detail personalization saves", () => {
  it("does not save hydration and coalesces pins, visibility and ordering without record mutations", async () => {
    const { store, state } = fixture();
    store.hydrate(state);
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.saveRecordDetailLayoutAction).not.toHaveBeenCalled();
    store.togglePinned("system:createdAt");
    store.toggleHidden("system:updatedAt");
    store.reorder(["system:updatedAt", "system:createdAt"]);
    await vi.advanceTimersByTimeAsync(700);
    expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledOnce();
    expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: {
          pinnedFields: ["system:createdAt"],
          hiddenFields: ["system:updatedAt"],
          fieldOrder: ["system:updatedAt", "system:createdAt"],
        },
      }),
    );
    expect(store.dirty).toBe(false);
    expect(store.state.hasPersonalization).toBe(true);
  });

  it("serializes an older save and reset so the reset is the final persisted choice", async () => {
    const { store, state } = fixture();
    const first = Promise.withResolvers<unknown>();
    mocks.saveRecordDetailLayoutAction.mockReturnValueOnce(first.promise);
    store.togglePinned("system:createdAt");
    const pending = store.flush();
    const pinned = store.layout;
    const reset = store.reset();
    expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledOnce();
    first.resolve({ ok: true, data: { ...state, hasPersonalization: true, layout: pinned } });
    await pending;
    await reset;
    expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledTimes(2);
    expect(mocks.saveRecordDetailLayoutAction.mock.calls[1][0].layout).toBeNull();
    expect(store.state.hasPersonalization).toBe(false);
    expect(store.layout).toEqual(state.layout);
  });

  it("retries a lost response with the identical key before sending newer choices", async () => {
    const { store, state } = fixture();
    mocks.saveRecordDetailLayoutAction.mockRejectedValueOnce(new Error("Response lost"));
    store.togglePinned("system:createdAt");
    await store.flush();
    const original = mocks.saveRecordDetailLayoutAction.mock.calls[0][0];
    expect(store.failed).toBe(true);
    store.toggleHidden("system:updatedAt");
    await store.retry();
    expect(mocks.saveRecordDetailLayoutAction.mock.calls[1][0]).toEqual(original);
    expect(mocks.saveRecordDetailLayoutAction.mock.calls[2][0]).toMatchObject({
      layout: { hiddenFields: ["system:updatedAt"] },
    });
    expect(mocks.saveRecordDetailLayoutAction.mock.calls[2][0].idempotencyKey).not.toBe(original.idempotencyKey);
    expect(mocks.readRecordDetailLayoutAction).not.toHaveBeenCalled();
    expect(store.state.layout).toEqual({
      ...state.layout,
      pinnedFields: ["system:createdAt"],
      hiddenFields: ["system:updatedAt"],
    });
    expect(store.dirty).toBe(false);
  });

  it("retains a rejected draft and explicitly retries against the refreshed revision", async () => {
    const { store, state } = fixture();
    mocks.saveRecordDetailLayoutAction.mockResolvedValueOnce({ ok: false, error: { errors: ["stale"] } });
    store.togglePinned("system:createdAt");
    await store.flush();
    expect(store.dirty).toBe(true);
    expect(store.layout.pinnedFields).toEqual(["system:createdAt"]);
    await store.refresh();
    expect(store.failed).toBe(true);
    expect(store.layout.pinnedFields).toEqual(["system:createdAt"]);
    mocks.readRecordDetailLayoutAction.mockResolvedValueOnce({
      ok: true,
      data: { ...state, schemaRevision: 2, layout: { ...state.layout, pinnedFields: ["system:updatedAt"] } },
    });
    await store.retry();
    expect(mocks.saveRecordDetailLayoutAction.mock.calls[1][0]).toMatchObject({
      expectedRevision: 2,
      layout: { pinnedFields: ["system:createdAt"] },
    });
    expect(store.failed).toBe(false);
  });

  it("rejects stale reads after a save and accepts only the newest concurrent refresh", async () => {
    const { store, state } = fixture();
    const old = Promise.withResolvers<unknown>();
    mocks.readRecordDetailLayoutAction.mockReturnValueOnce(old.promise);
    const refresh = store.refresh();
    store.togglePinned("system:createdAt");
    await store.flush();
    old.resolve({ ok: true, data: state });
    await refresh;
    expect(store.layout.pinnedFields).toEqual(["system:createdAt"]);
    const first = Promise.withResolvers<unknown>();
    mocks.readRecordDetailLayoutAction
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce({ ok: true, data: { ...state, schemaRevision: 3 } });
    const a = store.refresh();
    await store.refresh();
    first.resolve({ ok: true, data: { ...state, schemaRevision: 2 } });
    await a;
    expect(store.state.schemaRevision).toBe(3);
  });

  it("blocks an assistant page reload until persistence succeeds and cancels queued writes on disposal", async () => {
    const { store } = fixture();
    const guard = new NavigationGuardController();
    guard.register(store);
    store.togglePinned("system:createdAt");
    const reload = vi.fn();
    guard.requestRouteRefreshWhenSafe(reload);
    expect(reload).not.toHaveBeenCalled();
    await store.flush();
    expect(reload).toHaveBeenCalledOnce();
    store.toggleHidden("system:updatedAt");
    store.dispose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(mocks.saveRecordDetailLayoutAction).toHaveBeenCalledOnce();
  });
});

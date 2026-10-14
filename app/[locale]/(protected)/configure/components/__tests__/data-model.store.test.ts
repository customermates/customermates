import { describe, expect, it, vi } from "vitest";
import type { RecordModel } from "@/features/records/record-model.schema";
const actions = vi.hoisted(() => ({ getRecordModelAction: vi.fn(), reportApplicationError: vi.fn() }));
vi.mock("../../../records/actions", () => ({ getRecordModelAction: actions.getRecordModelAction }));
vi.mock("@/core/errors/report-application-error", () => ({ reportApplicationError: actions.reportApplicationError }));
import { DataModelStore } from "../data-model.store";
const model = (revision: number): RecordModel => ({
  revision,
  types: [],
  fields: [],
  relationships: [],
  capabilities: [],
  accessPresets: [],
});

describe("data model refresh", () => {
  it("retains the last complete schema after refresh failure", async () => {
    actions.getRecordModelAction.mockRejectedValueOnce(new Error("offline"));
    const initial = model(2);
    const store = new DataModelStore(initial);
    await store.refresh();
    expect(store.model).toBe(initial);
    expect(store.refreshFailed).toBe(true);
    expect(store.isRefreshing).toBe(false);
  });
  it("ignores a stale refresh after newer authoritative props", async () => {
    let resolve!: (model: RecordModel) => void;
    actions.getRecordModelAction.mockReturnValueOnce(
      new Promise<RecordModel>((done) => {
        resolve = done;
      }),
    );
    const store = new DataModelStore(model(2));
    const request = store.refresh();
    store.hydrate(model(4));
    resolve(model(3));
    await request;
    expect(store.model.revision).toBe(4);
  });
  it("lets only the latest refresh control failure and loading state", async () => {
    let reject!: (error: Error) => void;
    actions.getRecordModelAction
      .mockReturnValueOnce(
        new Promise<RecordModel>((_, fail) => {
          reject = fail;
        }),
      )
      .mockResolvedValueOnce(model(5));
    const store = new DataModelStore(model(2));
    const oldRequest = store.refresh();
    await store.refresh();
    reject(new Error("late failure"));
    await oldRequest;
    expect(store.model.revision).toBe(5);
    expect(store.refreshFailed).toBe(false);
    expect(store.isRefreshing).toBe(false);
  });
});

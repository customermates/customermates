import { randomUUID } from "node:crypto";
import { isObservable, observable } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  mutateRecordAction: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../../../actions", () => mocks);
vi.mock("@/app/actions", () => ({}));

import { RecordsStore } from "../records.store";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId, "EUR");
const root = {
  recordWorkspaceStore: { invalidate: mocks.invalidate },
} as unknown as RootStore;
const presentation = {
  model,
  typeId: id("deal"),
  canManageSchema: true,
  permittedActions: ["readAll", "update"],
  result: { items: [] },
  query: {
    typeId: id("deal"),
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
    "system:channels": "Channels",
  },
} as RecordPresentationResult;
const item: RecordRow = {
  id: randomUUID(),
  ref: { typeId: id("deal"), recordId: randomUUID() },
  version: 3,
  schemaRevision: 1,
  createdAt: "2026-09-29T00:00:00Z",
  updatedAt: "2026-09-29T00:00:00Z",
  fields: [],
  assignedUserIds: [],
  assignedUsers: [],
  relationships: [],
};
const params = {
  item,
  optimisticItem: item,
  fromGroupKey: `value:${id("deal.stage.new")}`,
  toGroupKey: `value:${id("deal.stage.qualified")}`,
  value: `value:${id("deal.stage.qualified")}`,
};
function store() {
  const store = new RecordsStore(root, presentation);
  store.groupingResult = {
    grouping: { field: id("deal.stage") },
    kind: "customSingleSelect",
    columnId: id("deal.stage"),
    supportsDragWriteBack: true,
    total: 1,
    groups: [],
  };
  return store;
}
beforeEach(() => vi.resetAllMocks());

describe("generic board persistence", () => {
  it("constructs the inherited MobX store and preserves a bound generic mutation handler", async () => {
    const state = store();
    mocks.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "completed", refs: [item.ref], schemaRevision: 1 },
    });
    const move = Reflect.get(state, "moveItemBetweenGroups");
    await move({ ...params, item: observable(item) });
    expect(isObservable(mocks.mutateRecordAction.mock.calls[0][0].mutation.ref)).toBe(false);
    expect(mocks.mutateRecordAction).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 1,
        mutation: {
          action: "update",
          ref: item.ref,
          expectedVersion: 3,
          fields: [
            {
              fieldId: id("deal.stage"),
              value: { kind: "select", value: id("deal.stage.qualified") },
            },
          ],
        },
      }),
    );
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it("retries an uncertain board move with the same idempotency key", async () => {
    const state = store();
    mocks.mutateRecordAction.mockRejectedValue(new Error("Response lost after commit"));
    await expect(state.moveItemBetweenGroups(params)).rejects.toThrow("Response lost");
    await expect(state.moveItemBetweenGroups(params)).rejects.toThrow("Response lost");
    expect(mocks.mutateRecordAction.mock.calls[0][0]).toEqual(mocks.mutateRecordAction.mock.calls[1][0]);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it("retains an asynchronous operation and prevents another move until it completes", async () => {
    const state = store();
    const operationId = randomUUID();
    mocks.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "pending", operationId, schemaRevision: 1 },
    });
    await state.moveItemBetweenGroups(params);
    expect(state.pendingBoardOperation).toBe(operationId);
    await state.moveItemBetweenGroups(params);
    expect(mocks.mutateRecordAction).toHaveBeenCalledOnce();
    await state.boardOperationCompleted();
    expect(state.pendingBoardOperation).toBeNull();
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
});

describe("generic selection persistence", () => {
  it("keeps the selected version through refresh and captures the new version after re-selection", () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    state.items = [{ ...item, version: 4 }];
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 3 }]);
    state.clearSelection();
    state.toggleItemSelection(item.id);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 4 }]);
    state.items = [];
    expect(state.selectedOffViewCount).toBe(1);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 4 }]);
    state.keepSelectionInView();
    state.items = [{ ...item, version: 5 }];
    state.toggleItemSelection(item.id);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 5 }]);
  });

  it("reuses the exact request after an uncertain bulk response and clears selection only after completion", async () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    mocks.mutateRecordAction.mockRejectedValueOnce(new Error("Response lost after commit"));
    await expect(
      state.bulkUpdateField(id("deal.stage"), {
        kind: "select",
        value: id("deal.stage.new"),
      }),
    ).rejects.toThrow("Response lost");
    expect(state.selectedCount).toBe(1);
    expect(state.isBulkMutating).toBe(false);
    mocks.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "completed", refs: [item.ref], schemaRevision: 1 },
    });
    await state.bulkUpdateField(id("deal.stage"), {
      kind: "select",
      value: id("deal.stage.new"),
    });
    expect(mocks.mutateRecordAction.mock.calls[0][0]).toEqual(mocks.mutateRecordAction.mock.calls[1][0]);
    expect(state.selectedCount).toBe(0);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });

  it("retains a staged bulk operation and prevents another mutation until publication", async () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    const operationId = randomUUID();
    mocks.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "pending", operationId, schemaRevision: 1 },
    });
    await state.bulkUpdateField(id("deal.stage"), {
      kind: "select",
      value: id("deal.stage.new"),
    });
    expect(state.pendingBulkOperation).toBe(operationId);
    expect(state.selectedCount).toBe(1);
    expect(state.isItemSelectable(item)).toBe(false);
    await state.bulkUpdateField(id("deal.stage"), {
      kind: "select",
      value: id("deal.stage.new"),
    });
    expect(mocks.mutateRecordAction).toHaveBeenCalledOnce();
    await state.bulkCompleted();
    expect(state.pendingBulkOperation).toBeNull();
    expect(state.selectedCount).toBe(0);
    expect(mocks.invalidate).toHaveBeenCalledOnce();
  });
});

import { randomUUID } from "node:crypto";
import { isObservable, observable } from "mobx";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";

const mocks = vi.hoisted(() => ({
  mutateRecordAction: vi.fn(),
  getRecordPresentationAction: vi.fn(),
  invalidate: vi.fn(),
}));
vi.mock("../../../actions", () => mocks);
vi.mock("@/app/actions", () => ({}));

import { RecordsStore } from "../records.store";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId);
const root = {
  recordWorkspaceStore: { invalidate: mocks.invalidate },
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;
const presentation = {
  model,
  linkColors: {},
  linkIcons: {},
  linkLabels: {},
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
  memberUsers: [],
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
  store.setItems(presentation.result);
  mocks.getRecordPresentationAction.mockResolvedValue({ ...presentation, result: { items: [] } });
  mocks.invalidate.mockImplementation(() => store.refresh());
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

  it("sends the refreshed version for a still-selected record after the list reloads", async () => {
    const state = store();
    state.setItems({ items: [item] });
    state.toggleItemSelection(item.id);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 3 }]);
    mocks.getRecordPresentationAction.mockResolvedValue({
      ...presentation,
      result: { items: [{ ...item, version: 4 }] },
    });
    await state.refresh();
    expect(state.selectedIds.has(item.id)).toBe(true);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 4 }]);
    mocks.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "pending", operationId: randomUUID() },
    });
    await state.bulkUpdateField(id("deal.stage"), null);
    expect(mocks.mutateRecordAction.mock.calls[0][0].mutation.targets).toEqual([{ ref: item.ref, expectedVersion: 4 }]);
  });

  it("derives export availability from read permission", () => {
    expect(new RecordsStore(root, presentation).canExport).toBe(true);
    expect(new RecordsStore(root, { ...presentation, permittedActions: ["readOwn"] }).canExport).toBe(true);
    expect(new RecordsStore(root, { ...presentation, permittedActions: ["create", "update"] }).canExport).toBe(false);
  });

  it("ignores a presentation computed against an older data model revision", () => {
    const state = new RecordsStore(root, { ...presentation, model: { ...model, revision: 5 } });
    const older = { ...presentation, model: { ...model, revision: 4 } };
    state.setPresentation(older);
    expect(state.presentation.model.revision).toBe(5);
    const newer = { ...presentation, model: { ...model, revision: 6 } };
    state.setPresentation(newer);
    expect(state.presentation).toBe(newer);
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

  it("keeps selection disabled until a completed bulk update has refreshed record versions", async () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    const refresh = Promise.withResolvers<RecordPresentationResult>();
    mocks.getRecordPresentationAction.mockReturnValue(refresh.promise);
    mocks.mutateRecordAction.mockResolvedValue({
      ok: true,
      data: { status: "completed", refs: [item.ref], schemaRevision: 1 },
    });
    const saving = state.bulkUpdateField(id("deal.stage"), {
      kind: "select",
      value: id("deal.stage.new"),
    });
    await vi.waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    expect(state.isBulkMutating).toBe(true);
    expect(state.isItemSelectable(item)).toBe(false);
    expect(state.selectedCount).toBe(1);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 3 }]);
    refresh.resolve({ ...presentation, result: { items: [{ ...item, version: 4 }] } });
    await saving;
    expect(state.isBulkMutating).toBe(false);
    expect(state.selectedCount).toBe(0);
    state.toggleItemSelection(item.id);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 4 }]);
  });

  it("keeps completed writes locked through refresh failures and accepts a retry without repeating the mutation", async () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    mocks.mutateRecordAction.mockResolvedValue({ ok: true, data: { status: "completed", refs: [item.ref] } });
    mocks.getRecordPresentationAction.mockRejectedValue(new Error("Refresh unavailable"));
    mocks.invalidate.mockImplementation(() => Promise.allSettled([state.refresh()]));
    await expect(state.bulkUpdateField(id("deal.stage"), null)).resolves.toBe(true);
    expect(state.isBulkMutating).toBe(true);
    expect(state.canRetryBulkRefresh).toBe(true);
    expect(state.isItemSelectable(item)).toBe(false);
    expect(state.selectedCount).toBe(1);
    await state.bulkUpdateField(id("deal.stage"), null);
    expect(mocks.mutateRecordAction).toHaveBeenCalledOnce();
    mocks.getRecordPresentationAction.mockResolvedValue({
      ...presentation,
      result: { items: [{ ...item, version: 4 }] },
    });
    await state.retryBulkRefresh();
    expect(state.isBulkMutating).toBe(false);
    expect(state.canRetryBulkRefresh).toBe(false);
    expect(state.selectedCount).toBe(0);
    state.toggleItemSelection(item.id);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 4 }]);
  });

  it("does not unlock when a newer query discards the completion refresh", async () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    const first = Promise.withResolvers<RecordPresentationResult>();
    const next = Promise.withResolvers<RecordPresentationResult>();
    mocks.getRecordPresentationAction.mockReturnValueOnce(first.promise).mockReturnValue(next.promise);
    mocks.mutateRecordAction.mockResolvedValue({ ok: true, data: { status: "completed", refs: [item.ref] } });
    const saving = state.bulkUpdateField(id("deal.stage"), null);
    await vi.waitFor(() => expect(mocks.getRecordPresentationAction).toHaveBeenCalledOnce());
    const newer = state.refresh();
    first.resolve({ ...presentation, result: { items: [{ ...item, version: 4 }] } });
    await vi.waitFor(() => expect(mocks.getRecordPresentationAction).toHaveBeenCalledTimes(3));
    expect(state.isBulkMutating).toBe(true);
    expect(state.items[0].version).toBe(3);
    next.resolve({ ...presentation, result: { items: [{ ...item, version: 5 }] } });
    await Promise.all([saving, newer]);
    expect(state.isBulkMutating).toBe(false);
    expect(state.selectedCount).toBe(0);
    state.toggleItemSelection(item.id);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 5 }]);
  });

  it("ignores a pre-completion refresh while workspace invalidation is waiting", async () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    const earlier = Promise.withResolvers<RecordPresentationResult>();
    mocks.getRecordPresentationAction.mockReturnValueOnce(earlier.promise);
    const refreshing = state.refresh();
    const invalidating = Promise.withResolvers<undefined>();
    mocks.invalidate.mockReturnValue(invalidating.promise);
    mocks.mutateRecordAction.mockResolvedValue({ ok: true, data: { status: "completed", refs: [item.ref] } });
    const saving = state.bulkUpdateField(id("deal.stage"), null);
    await vi.waitFor(() => expect(mocks.invalidate).toHaveBeenCalledOnce());
    earlier.resolve({ ...presentation, result: { items: [item] } });
    await refreshing;
    expect(state.isBulkMutating).toBe(true);
    expect(state.selectedCount).toBe(1);
    mocks.getRecordPresentationAction.mockResolvedValue({
      ...presentation,
      result: { items: [{ ...item, version: 4 }] },
    });
    invalidating.resolve(undefined);
    await saving;
    expect(state.isBulkMutating).toBe(false);
    state.toggleItemSelection(item.id);
    expect(state.selectionTargets).toEqual([{ ref: item.ref, expectedVersion: 4 }]);
  });

  it("offers a retry when incoming hydration discards the completion refresh without an error", async () => {
    const state = store();
    state.items = [item];
    state.toggleItemSelection(item.id);
    mocks.invalidate.mockResolvedValue(undefined);
    mocks.mutateRecordAction.mockResolvedValue({ ok: true, data: { status: "completed", refs: [item.ref] } });
    const fresh = Promise.withResolvers<RecordPresentationResult>();
    mocks.getRecordPresentationAction.mockReturnValueOnce(fresh.promise);
    const saving = state.bulkUpdateField(id("deal.stage"), null);
    await vi.waitFor(() => expect(mocks.getRecordPresentationAction).toHaveBeenCalledOnce());
    state.setItems({ items: [item] });
    fresh.resolve({ ...presentation, result: { items: [{ ...item, version: 4 }] } });
    await saving;
    expect(state.dataRequest.status).toBe("ready");
    expect(state.isBulkMutating).toBe(true);
    expect(state.canRetryBulkRefresh).toBe(true);
    expect(state.isItemSelectable(item)).toBe(false);
    mocks.getRecordPresentationAction.mockResolvedValue({
      ...presentation,
      result: { items: [{ ...item, version: 4 }] },
    });
    await state.retryBulkRefresh();
    expect(state.canRetryBulkRefresh).toBe(false);
    expect(state.isBulkMutating).toBe(false);
    expect(mocks.mutateRecordAction).toHaveBeenCalledOnce();
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

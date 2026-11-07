import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordPresentationResult } from "@/features/records/get-record-presentation.interactor";
import type { RecordRow } from "@/features/records/record-presentation";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordColumns } from "@/features/records/record-columns";
import { relationshipColumnKey } from "@/features/records/record-column.schema";
import { recordListProjection } from "@/features/records/record-list-projection";
import { ViewMode } from "@/core/base/base-query-builder";
import { resolveDataViewPageState } from "@/components/data-view/data-view-state";

const mocks = vi.hoisted(() => ({ getRecordPresentationAction: vi.fn() }));
vi.mock("../../../actions", () => mocks);
vi.mock("@/app/actions", () => ({}));
import { RecordsStore } from "../records.store";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId);
const typeId = id("deal");
const name = id("deal.name");
const notes = id("deal.notes");
const relation = relationshipColumnKey(id("deal.organizations"), "outgoing");
const allHidden = recordColumns(typeId, model)
  .map((column) => column.id)
  .filter((key) => key !== name);
const root = { localeStore: { getTranslation: (key: string) => key } } as unknown as RootStore;

function presentation(
  hiddenColumns = allHidden,
  state: "missing" | "restricted" = "missing",
): RecordPresentationResult {
  const projection = recordListProjection(typeId, model, { hiddenColumns, viewMode: ViewMode.table });
  const row: RecordRow = {
    id: "record-1",
    ref: { typeId, recordId: "record-1" },
    version: 1,
    schemaRevision: model.revision,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    assignedUsers: [],
    assignedUserIds: [],
    memberUsers: [],
    fields: projection.fields.map((fieldId) => ({ fieldId, result: { state } })),
    relationships: projection.includeRelationships.map((selection) => ({
      ...selection,
      records: [],
      readableCount: 0,
      hasMore: false,
    })),
    relationshipPaths: [],
  };
  return {
    typeId,
    model,
    canManageSchema: true,
    permittedActions: ["readAll", "update"],
    linkColors: {},
    linkIcons: {},
    linkLabels: {},
    systemColumnLabels: {
      "system:createdAt": "Created",
      "system:updatedAt": "Updated",
      "system:assignedTo": "Assigned",
    },
    query: { typeId, page: 1, pageSize: 25, sort: [], filters: [], relationships: [], ...projection },
    result: {
      items: [row],
      hiddenColumns,
      viewMode: ViewMode.table,
      viewPersistable: false,
      p13nId: `records:${typeId}`,
    },
  };
}
function fixture() {
  const initial = presentation();
  const store = new RecordsStore(root, initial);
  store.setItems(initial.result);
  return store;
}
function pageState(store: RecordsStore) {
  return resolveDataViewPageState({
    request: store.dataRequest,
    itemCount: store.items.length,
    hasRequiredData: store.hasRequiredData,
    hasActiveQuery: false,
    explicitlyUnpaginated: false,
  });
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => vi.resetAllMocks());

describe("projected list lifecycle", () => {
  it.each([notes, relation])(
    "loads a revealed column %s before rendering it, without waiting for saved preferences",
    async (column) => {
      const store = fixture();
      const pending = deferred<{ ok: true; data: RecordPresentationResult }>();
      mocks.getRecordPresentationAction.mockReturnValueOnce(pending.promise);
      const hiddenColumns = allHidden.filter((key) => key !== column);
      store.setViewOptions({ hiddenColumns });
      expect(mocks.getRecordPresentationAction).toHaveBeenCalledOnce();
      expect(mocks.getRecordPresentationAction.mock.calls[0][2]).toContain(column);
      expect(store.items).toHaveLength(1);
      expect(pageState(store)).toBe("loading");
      pending.resolve({ ok: true, data: presentation(hiddenColumns) });
      await vi.waitFor(() => expect(pageState(store)).toBe("content"));
      expect(store.hiddenColumns).toEqual(hiddenColumns);
      store.setViewOptions({ hiddenColumns: allHidden });
      expect(mocks.getRecordPresentationAction).toHaveBeenCalledOnce();
      expect(pageState(store)).toBe("content");
    },
  );

  it("shows retry after a failed column read, then accepts missing and restricted values as loaded", async () => {
    const store = fixture();
    mocks.getRecordPresentationAction.mockRejectedValueOnce(new Error("offline"));
    const hiddenColumns = allHidden.filter((key) => key !== notes);
    store.setViewOptions({ hiddenColumns });
    await vi.waitFor(() => expect(pageState(store)).toBe("error"));
    expect(store.items).toHaveLength(1);
    mocks.getRecordPresentationAction.mockResolvedValueOnce({
      ok: true,
      data: presentation(hiddenColumns, "restricted"),
    });
    await store.refreshQuery();
    expect(pageState(store)).toBe("content");
    expect(store.items[0].fields.find((field) => field.fieldId === notes)?.result.state).toBe("restricted");
  });

  it("retains usable rows when an ordinary refresh fails", async () => {
    const store = fixture();
    mocks.getRecordPresentationAction.mockRejectedValueOnce(new Error("offline"));
    await expect(store.refreshQuery()).rejects.toThrow("offline");
    expect(pageState(store)).toBe("content");
  });

  it("keeps the newest projection when column reads finish out of order", async () => {
    const store = fixture();
    const first = deferred<{ ok: true; data: RecordPresentationResult }>();
    const second = deferred<{ ok: true; data: RecordPresentationResult }>();
    mocks.getRecordPresentationAction.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    store.setViewOptions({ hiddenColumns: allHidden.filter((key) => key !== notes) });
    const latest = allHidden.filter((key) => key !== relation);
    store.setViewOptions({ hiddenColumns: latest });
    second.resolve({ ok: true, data: presentation(latest) });
    await vi.waitFor(() => expect(pageState(store)).toBe("content"));
    first.resolve({ ok: true, data: presentation(allHidden.filter((key) => key !== notes)) });
    await first.promise;
    expect(store.hiddenColumns).toEqual(latest);
    expect(store.presentation.query.fields).toEqual([name]);
  });

  it("reconciles an SSR handoff that preserves an unsaved visible column but replaces its values", async () => {
    const store = fixture();
    const hiddenColumns = allHidden.filter((key) => key !== notes);
    mocks.getRecordPresentationAction.mockResolvedValueOnce({ ok: true, data: presentation(hiddenColumns) });
    store.setViewOptions({ hiddenColumns });
    await vi.waitFor(() => expect(pageState(store)).toBe("content"));
    const pending = deferred<{ ok: true; data: RecordPresentationResult }>();
    mocks.getRecordPresentationAction.mockReturnValueOnce(pending.promise);
    const server = presentation();
    store.setPresentation(server);
    store.setItems(server.result);
    expect(store.hiddenColumns).toEqual(hiddenColumns);
    expect(pageState(store)).toBe("loading");
    await vi.waitFor(() => expect(mocks.getRecordPresentationAction).toHaveBeenCalledTimes(2));
    expect(mocks.getRecordPresentationAction.mock.calls[1][2]).toContain(notes);
    pending.resolve({ ok: true, data: presentation(hiddenColumns) });
    await vi.waitFor(() => expect(pageState(store)).toBe("content"));
  });

  it("supersedes a narrower in-flight result when a revealed column was still available in the old rows", async () => {
    const store = fixture();
    const hiddenColumns = allHidden.filter((key) => key !== notes);
    mocks.getRecordPresentationAction.mockResolvedValueOnce({ ok: true, data: presentation(hiddenColumns) });
    store.setViewOptions({ hiddenColumns });
    await vi.waitFor(() => expect(pageState(store)).toBe("content"));
    store.setViewOptions({ hiddenColumns: allHidden });
    const narrow = deferred<{ ok: true; data: RecordPresentationResult }>();
    mocks.getRecordPresentationAction
      .mockReturnValueOnce(narrow.promise)
      .mockResolvedValueOnce({ ok: true, data: presentation(hiddenColumns) });
    const refresh = store.refreshQuery();
    store.setViewOptions({ hiddenColumns });
    expect(mocks.getRecordPresentationAction).toHaveBeenCalledTimes(2);
    narrow.resolve({ ok: true, data: presentation() });
    await refresh;
    await vi.waitFor(() => expect(mocks.getRecordPresentationAction).toHaveBeenCalledTimes(3));
    await vi.waitFor(() => expect(pageState(store)).toBe("content"));
    expect(store.hiddenColumns).toEqual(hiddenColumns);
    expect(mocks.getRecordPresentationAction.mock.calls[2][2]).toContain(notes);
  });

  it("lets a saved-view reload choose its own projection and does not refetch empty lists or widths", async () => {
    const store = fixture();
    const next = presentation(allHidden.filter((key) => key !== notes));
    mocks.getRecordPresentationAction.mockResolvedValueOnce({ ok: true, data: next });
    await store.reloadSavedView();
    expect(mocks.getRecordPresentationAction.mock.calls[0][2]).toBeUndefined();
    store.setViewOptions({ columnWidth: { uid: notes, width: 220 } });
    expect(mocks.getRecordPresentationAction).toHaveBeenCalledOnce();
    store.setItems({ ...next.result, items: [] });
    store.setViewOptions({ hiddenColumns: [] });
    expect(mocks.getRecordPresentationAction).toHaveBeenCalledOnce();
    expect(store.hasRequiredData).toBe(true);
  });

  it("reconciles an incomplete group-page merge with a full read while retaining other groups", async () => {
    const grouped = (hiddenColumns: string[]): RecordPresentationResult => {
      const base = presentation(hiddenColumns);
      const rows = ["a", "b"].map((key) => ({
        ...base.result.items[0],
        id: key,
        ref: { typeId, recordId: key },
        fields: [...base.result.items[0].fields, { fieldId: id("deal.stage"), result: { state: "missing" as const } }],
      }));
      return {
        ...base,
        query: {
          ...base.query,
          fields: [...(base.query.fields ?? []), id("deal.stage")],
          grouping: { field: id("deal.stage") },
        },
        result: {
          ...base.result,
          items: rows,
          viewMode: ViewMode.card,
          grouping: {
            grouping: { field: id("deal.stage") },
            kind: "customSingleSelect",
            columnId: id("deal.stage"),
            total: 2,
            supportsDragWriteBack: true,
            groups: rows.map((row) => ({
              key: row.id,
              label: row.id,
              count: 1,
              labelKind: "value",
              isNoValue: false,
              materialised: true,
              itemIds: [row.id],
              hasMore: false,
            })),
          },
        },
      };
    };
    const wide = grouped(allHidden.filter((key) => key !== notes));
    const store = new RecordsStore(root, wide);
    store.setItems(wide.result);
    const narrow = grouped(allHidden);
    if (!narrow.result.grouping) throw new Error("Grouped fixture missing its axis");
    const partial = {
      ...narrow,
      result: {
        ...narrow.result,
        items: [narrow.result.items[0]],
        grouping: { ...narrow.result.grouping, partial: true, groups: [narrow.result.grouping.groups[0]] },
      },
    };
    const full = deferred<{ ok: true; data: RecordPresentationResult }>();
    mocks.getRecordPresentationAction
      .mockResolvedValueOnce({ ok: true, data: partial })
      .mockReturnValueOnce(full.promise);
    store.loadMoreInGroup("a");
    await vi.waitFor(() => expect(mocks.getRecordPresentationAction).toHaveBeenCalledTimes(2));
    expect(mocks.getRecordPresentationAction.mock.calls[0][1].groupPage.only).toBe("a");
    expect(mocks.getRecordPresentationAction.mock.calls[1][1].groupPage.only).toBeUndefined();
    expect(store.items.find((row) => row.id === "b")?.fields.some((field) => field.fieldId === notes)).toBe(true);
    expect(pageState(store)).toBe("loading");
    full.resolve({ ok: true, data: wide });
    await vi.waitFor(() => expect(pageState(store)).toBe("content"));
  });
});

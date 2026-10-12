import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordEditorContext } from "@/features/records/get-record-editor.interactor";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { relationshipColumnKey } from "@/features/records/record-column.schema";
import { recordColumns } from "@/features/records/record-columns";

const mocks = vi.hoisted(() => ({
  mutateRecordAction: vi.fn(),
  getRecordPresentationAction: vi.fn(),
  queryRecordsAction: vi.fn(),
  resetRecordViewAction: vi.fn(),
}));
const p13n = vi.hoisted(() => ({ getP13nAction: vi.fn(), upsertP13nAction: vi.fn() }));
vi.mock("../../../actions", () => mocks);
vi.mock("@/app/actions", () => p13n);
vi.mock("@/core/utils/toast-zod-error-tree", () => ({ toastZodErrorTree: vi.fn() }));

import { EmbeddedRecordsStore, embeddedColumnLayout, embeddedPresentation } from "../embedded-records.store";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId);
const root = {
  recordWorkspaceStore: { invalidate: vi.fn() },
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;
const parentColumnId = relationshipColumnKey(id("lineItem.deal"), "outgoing");
const serviceColumnId = relationshipColumnKey(id("lineItem.service"), "outgoing");
const systemColumns = ["system:assignedTo", "system:createdAt", "system:updatedAt"];
const editor: RecordEditorContext = {
  model,
  typeId: id("deal"),
  linkColors: {},
  linkIcons: {},
  linkLabels: {},
  canManageSchema: true,
  permittedActions: ["readAll", "update"],
};
const lineFields = model.fields.filter((field) => field.typeId === id("lineItem") && !field.archived);
const formatted = lineFields.filter((field) => field.valueType === "richText").map((field) => field.id);
const ownFields = lineFields
  .filter((field) => field.id !== id("lineItem.name") && field.valueType !== "richText")
  .map((field) => field.id);
const layout = (chosen: string[] | null, columns = recordColumns(id("lineItem"), model)) =>
  embeddedColumnLayout({
    columns,
    primaryColumnId: id("lineItem.name"),
    parentColumnId,
    defaultHidden: formatted,
    chosen,
  });
const visibleOf = ({ columnOrder, hiddenColumns }: ReturnType<typeof layout>) =>
  columnOrder.filter((column) => !hiddenColumns.includes(column));

function createStore() {
  const presentation = embeddedPresentation(editor, id("lineItem"), {
    "system:createdAt": "Created at",
    "system:updatedAt": "Updated at",
    "system:assignedTo": "Assigned to",
  });
  const store = new EmbeddedRecordsStore(
    root,
    presentation,
    id("lineItem.deal"),
    () => true,
    async () => {},
  );
  store.setParent({ typeId: id("deal"), recordId: randomUUID() });
  return store;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queryRecordsAction.mockResolvedValue({
    ok: true,
    data: {
      records: [{ ref: { typeId: id("lineItem"), recordId: randomUUID() }, fields: [], relationships: [] }],
      total: 1,
      page: 1,
    },
  });
  p13n.getP13nAction.mockResolvedValue({ ok: true, data: undefined });
  p13n.upsertP13nAction.mockResolvedValue({ ok: true, data: { p13nId: "stored" } });
});

describe("sub-list columns", () => {
  it("shows the sub-list's own fields in field order and hides system columns, formatted text and the parent", () => {
    expect(formatted).toHaveLength(1);
    const quiet = layout(null);
    expect(visibleOf(quiet)).toEqual([...ownFields, serviceColumnId]);
    expect(quiet.hiddenColumns).toEqual([...formatted, ...systemColumns, parentColumnId]);
  });

  it("shows the system columns when the sub-list has no other columns", () => {
    const columns = recordColumns(id("lineItem"), model).filter(
      (column) => column.kind === "system" || column.id === id("lineItem.name") || column.id === parentColumnId,
    );
    expect(visibleOf(layout(null, columns))).toEqual(systemColumns);
  });

  it("keeps a stored choice in its order, ignores stale ids and hides fields added after the choice", () => {
    const quantity = id("lineItem.quantity");
    const amount = id("lineItem.amount");
    const chosen = layout([amount, randomUUID(), quantity, amount, "system:createdAt"]);
    expect(visibleOf(chosen)).toEqual([amount, quantity, "system:createdAt"]);
    expect(chosen.columnOrder.slice(0, 3)).toEqual([amount, quantity, "system:createdAt"]);
    expect(chosen.hiddenColumns).toContain(parentColumnId);

    const added = { ...lineFields[1], id: randomUUID(), label: "Added later" };
    const grown = recordColumns(id("lineItem"), { ...model, fields: [...model.fields, added] });
    expect(visibleOf(layout([amount, quantity], grown))).toEqual([amount, quantity]);
    expect(visibleOf(layout(null, grown))).toContain(added.id);
  });

  it("never lists the name column as a choice and always leaves it out of the stored layout", () => {
    const chosen = layout([id("lineItem.name"), id("lineItem.quantity")]);
    expect(chosen.columnOrder).not.toContain(id("lineItem.name"));
    expect(chosen.hiddenColumns).not.toContain(id("lineItem.name"));
  });

  it("loads the quiet default when nothing is stored", async () => {
    const store = createStore();
    await store.refresh();
    expect(p13n.getP13nAction).toHaveBeenCalledWith({ p13nId: `sublist-columns:${id("lineItem")}` });
    const visible = store.visibleColumns.map((column) => column.uid);
    expect(visible).toEqual([id("lineItem.name"), ...ownFields, serviceColumnId]);
    expect(store.columnChoice).toBeNull();
  });

  it("applies the stored choice, saves a new one immediately and resets to the default", async () => {
    const quantity = id("lineItem.quantity");
    const amount = id("lineItem.amount");
    p13n.getP13nAction.mockResolvedValue({
      ok: true,
      data: { p13nId: `sublist-columns:${id("lineItem")}`, settings: { columns: [amount, quantity] } },
    });
    const store = createStore();
    await store.refresh();
    expect(store.visibleColumns.map((column) => column.uid)).toEqual([id("lineItem.name"), amount, quantity]);

    const saving = store.setColumnChoice([quantity]);
    expect(store.visibleColumns.map((column) => column.uid)).toEqual([id("lineItem.name"), quantity]);
    await saving;
    expect(p13n.upsertP13nAction).toHaveBeenLastCalledWith({
      p13nId: `sublist-columns:${id("lineItem")}`,
      settings: { columns: [quantity] },
    });
    await store.refresh();
    expect(store.visibleColumns.map((column) => column.uid)).toEqual([id("lineItem.name"), quantity]);

    await store.setColumnChoice(null);
    expect(p13n.upsertP13nAction).toHaveBeenLastCalledWith({
      p13nId: `sublist-columns:${id("lineItem")}`,
      settings: null,
    });
    expect(store.columnChoice).toBeNull();
    expect(store.visibleColumns.map((column) => column.uid)).toEqual([
      id("lineItem.name"),
      ...ownFields,
      serviceColumnId,
    ]);
  });

  it("rolls the choice back when it cannot be saved", async () => {
    p13n.upsertP13nAction.mockResolvedValue({ ok: false, error: { formErrors: ["Denied"], fieldErrors: {} } });
    const store = createStore();
    await store.refresh();
    await store.setColumnChoice([id("lineItem.quantity")]);
    expect(store.columnChoice).toBeNull();
    expect(store.visibleColumns.map((column) => column.uid)).toEqual([
      id("lineItem.name"),
      ...ownFields,
      serviceColumnId,
    ]);
  });
});

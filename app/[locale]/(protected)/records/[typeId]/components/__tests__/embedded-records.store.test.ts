import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import type { RootStore } from "@/core/stores/root.store";
import type { RecordEditorContext } from "@/features/records/get-record-editor.interactor";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { relationshipColumnKey } from "@/features/records/record-column.schema";

const mocks = vi.hoisted(() => ({
  mutateRecordAction: vi.fn(),
  getRecordPresentationAction: vi.fn(),
  queryRecordsAction: vi.fn(),
  resetRecordViewAction: vi.fn(),
}));
vi.mock("../../../actions", () => mocks);
vi.mock("@/app/actions", () => ({}));

import { EmbeddedRecordsStore, embeddedColumnLayout, embeddedPresentation } from "../embedded-records.store";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
const model = createCrmPreset(companyId);
const root = {
  recordWorkspaceStore: { invalidate: vi.fn() },
  localeStore: { getTranslation: (key: string) => key },
} as unknown as RootStore;
const parentColumnId = relationshipColumnKey(id("lineItem.deal"), "outgoing");
const editor: RecordEditorContext = {
  model,
  typeId: id("deal"),
  linkColors: {},
  linkIcons: {},
  linkLabels: {},
  canManageSchema: true,
  permittedActions: ["readAll", "update"],
};

describe("sub-list columns", () => {
  it("lists every field of the sub-list in field order and hides formatted text and the parent link", () => {
    const fields = model.fields.filter((field) => field.typeId === id("lineItem") && !field.archived);
    const formatted = fields.filter((field) => field.valueType === "richText").map((field) => field.id);
    expect(formatted).toHaveLength(1);
    const layout = embeddedColumnLayout(id("lineItem"), model.fields, parentColumnId);
    expect(layout.columnOrder).toEqual(fields.map((field) => field.id));
    expect(layout.hiddenColumns).toEqual([...formatted, parentColumnId]);
  });

  it("shows all sub-list columns except the parent link after a load", async () => {
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
    mocks.queryRecordsAction.mockResolvedValue({
      ok: true,
      data: {
        records: [{ ref: { typeId: id("lineItem"), recordId: randomUUID() }, fields: [], relationships: [] }],
        total: 1,
        page: 1,
      },
    });
    await store.refresh();
    const visible = store.visibleColumns.map((column) => column.uid);
    expect(visible).toEqual(
      expect.arrayContaining([
        id("lineItem.name"),
        id("lineItem.quantity"),
        id("lineItem.pricingMode"),
        id("lineItem.effectivePrice"),
        relationshipColumnKey(id("lineItem.service"), "outgoing"),
      ]),
    );
    expect(visible).not.toContain(parentColumnId);
    const order = model.fields
      .filter((field) => field.typeId === id("lineItem") && !field.archived && field.valueType !== "richText")
      .map((field) => field.id);
    expect(store.hiddenColumns).toEqual(
      expect.arrayContaining([
        parentColumnId,
        ...model.fields
          .filter((field) => field.typeId === id("lineItem") && field.valueType === "richText")
          .map((field) => field.id),
      ]),
    );
    expect(store.hiddenColumns).toHaveLength(2);
    expect(visible.filter((uid) => order.includes(uid))).toEqual(order);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { RootStore } from "@/core/stores/root.store";
import type { RecordField } from "@/features/records/record-model.schema";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { recordInvariant } from "@/features/records/record-invariant";
vi.mock("../../../records/actions", () => ({
  applyRecordConfigurationAction: vi.fn(),
  previewRecordConfigurationAction: vi.fn(),
}));
import { FieldModalStore } from "../field-modal";
import { moveOption, optionColumnsFromField, optionsWithAttributes } from "../field-option-columns";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const id = (key: string) => presetId(company, key);
const root = { registerModalStore: vi.fn(), localeStore: { locale: "en" } } as unknown as RootStore;

const options: RecordField["options"] = [
  {
    id: "a",
    label: "Open",
    color: "warning",
    attributes: [
      { key: "code", value: { kind: "text", value: "OP" } },
      { key: "probability", value: { kind: "decimal", value: "30", currency: null } },
    ],
  },
  {
    id: "b",
    label: "Won",
    color: "success",
    attributes: [
      { key: "probability", value: { kind: "decimal", value: "100", currency: null } },
      { key: "closed", value: { kind: "boolean", value: true } },
      { key: "since", value: { kind: "date", value: "2026-01-01" } },
    ],
  },
  { id: "c", label: "Lost", color: null, attributes: [] },
];

function stageStore() {
  const model = createCrmPreset(company);
  const field = recordInvariant(model.fields.find((field) => field.id === id("deal.stage")));
  field.options = structuredClone(options);
  const store = new FieldModalStore(root, model, vi.fn());
  store.edit(model, id("deal"), field);
  return store;
}

function savedOptions(store: FieldModalStore) {
  const operation = store.operations()[0];
  if (operation.operation !== "putField") throw new Error("Expected field operation");
  return operation.field.options;
}

describe("choice option attribute columns", () => {
  it("loads attributes as shared columns with probability first and an inferred type per column", () => {
    const { columns: attributeColumns, options: drafts } = optionColumnsFromField(options);
    expect(attributeColumns.map(({ key, type }) => [key, type])).toEqual([
      ["probability", "number"],
      ["code", "text"],
      ["closed", "boolean"],
      ["since", "preserved"],
    ]);
    expect(drafts.map((draft) => attributeColumns.map((column) => draft.cells[column.id]))).toEqual([
      ["30", "OP", undefined, undefined],
      ["100", undefined, "true", { kind: "date", value: "2026-01-01" }],
      [undefined, undefined, undefined, undefined],
    ]);
    expect(optionColumnsFromField(options).columns).toEqual(attributeColumns);
  });

  it("saves loaded options unchanged except for the column order of their attributes", () => {
    const { columns: attributeColumns, options: drafts } = optionColumnsFromField(options);
    expect(optionsWithAttributes(attributeColumns, drafts)).toEqual([
      {
        ...options[0],
        attributes: [
          { key: "probability", value: { kind: "decimal", value: "30", currency: null } },
          { key: "code", value: { kind: "text", value: "OP" } },
        ],
      },
      options[1],
      options[2],
    ]);
  });

  it("stores empty cells as absent attributes and edits, renames and removes columns", () => {
    const store = stageStore();
    const [probability, code, closed, since] = store.form.choices.columns;
    store.onChange(`choices.options.0.cells.${probability.id}`, "");
    store.onChange(`choices.options.2.cells.${probability.id}`, "12,5");
    store.onChange(`choices.options.1.cells.${closed.id}`, "false");
    store.renameAttributeColumn(code.id, "  short code ");
    store.removeAttributeColumn(since.id);
    store.addAttributeColumn("rank", "number");
    const rank = store.form.choices.columns[3];
    store.onChange(`choices.options.2.cells.${rank.id}`, "3");
    expect(store.form.choices.options.some((option) => since.id in option.cells)).toBe(false);
    expect(savedOptions(store).map((option) => option.attributes)).toEqual([
      [{ key: "short code", value: { kind: "text", value: "OP" } }],
      [
        { key: "probability", value: { kind: "decimal", value: "100", currency: null } },
        { key: "closed", value: { kind: "boolean", value: false } },
      ],
      [
        { key: "probability", value: { kind: "decimal", value: "12.5", currency: null } },
        { key: "rank", value: { kind: "decimal", value: "3", currency: null } },
      ],
    ]);
  });

  it("removes a column's values from every option", () => {
    const store = stageStore();
    const probability = store.form.choices.columns[0];
    store.removeAttributeColumn(probability.id);
    expect(store.form.choices.options.some((option) => probability.id in option.cells)).toBe(false);
    expect(savedOptions(store).flatMap((option) => option.attributes.map((attribute) => attribute.key))).not.toContain(
      "probability",
    );
  });

  it("persists a new option order and marks the draft changed", () => {
    const store = stageStore();
    expect(store.hasUnsavedChanges).toBe(false);
    store.moveOption("c", "a");
    expect(store.form.choices.options.map((option) => option.id)).toEqual(["c", "a", "b"]);
    expect(store.hasUnsavedChanges).toBe(true);
    expect(savedOptions(store).map((option) => option.id)).toEqual(["c", "a", "b"]);
    store.moveOption("c", "b");
    expect(savedOptions(store).map((option) => option.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores moves to or from unknown options", () => {
    const { options: drafts } = optionColumnsFromField(options);
    expect(moveOption(drafts, "missing", "a")).toBe(drafts);
    expect(moveOption(drafts, "a", "missing")).toBe(drafts);
  });
});

import { describe, expect, it } from "vitest";

import type { RecordRow } from "@/features/records/record-presentation";
import type { RecordFieldView, RecordRelationship } from "@/features/records/record-model.schema";

import { type RecordChipColumn, isEmptyColumn, recordChipRowModel } from "../record-chip-row-model";

const TYPE = "10000000-0000-4000-8000-000000000001";
const SERVICES = "10000000-0000-4000-8000-000000000002";

function field(id: string, label: string, valueType: RecordFieldView["valueType"]): RecordChipColumn {
  return {
    kind: "field",
    id,
    label,
    sortable: true,
    field: {
      id,
      typeId: TYPE,
      label,
      valueType,
      options: [],
      behavior: { kind: "input" },
    } as unknown as RecordFieldView,
  };
}

const relation = {
  id: "10000000-0000-4000-8000-000000000003",
  sourceTypeId: TYPE,
  targetTypeId: SERVICES,
  sourceLabel: "Services",
  targetLabel: "Deals",
} as RecordRelationship;

const services: RecordChipColumn = {
  kind: "relationship",
  id: "relationship:services",
  label: "Services",
  sortable: false,
  relation,
  direction: "outgoing",
};
const owner: RecordChipColumn = { kind: "system", id: "system:assignedTo", label: "Assigned to", sortable: false };

const value = <T extends object>(scalar: T) => ({ state: "value" as const, value: scalar });

function row(overrides: Partial<RecordRow> = {}): RecordRow {
  return {
    id: "row",
    fields: [
      { fieldId: "value", result: value({ kind: "decimal", value: "342000", currency: "EUR" }) },
      { fieldId: "weighted", result: value({ kind: "decimal", value: "102600", currency: "EUR" }) },
      { fieldId: "quantity", result: value({ kind: "decimal", value: "4", currency: null }) },
      { fieldId: "tags", result: value({ kind: "selectList", value: [] }) },
      { fieldId: "done", result: value({ kind: "boolean", value: false }) },
      { fieldId: "notes", result: { state: "missing" } },
    ],
    relationships: [
      {
        relationId: relation.id,
        direction: "outgoing",
        records: [
          { ref: { typeId: SERVICES, recordId: "a" }, title: value({ kind: "text", value: "Docking" }) },
          { ref: { typeId: SERVICES, recordId: "b" }, title: value({ kind: "text", value: "Hosting" }) },
        ],
        readableCount: 3,
        hasMore: true,
      },
    ],
    assignedUsers: [],
    ...overrides,
  } as unknown as RecordRow;
}

const columns = [
  field("value", "Value", "currency"),
  field("weighted", "Weighted value", "currency"),
  field("quantity", "Quantity", "number"),
  field("tags", "Tags", "select"),
  field("done", "Done", "boolean"),
  field("notes", "Notes", "text"),
  services,
  owner,
];

describe("record chip row model", () => {
  it("shows only filled values on cards and lists the empty ones for the add chip", () => {
    const { entries, empty } = recordChipRowModel(columns, row());

    expect(entries.map((entry) => entry.column.id)).toEqual(["value", "weighted", "quantity", "relationship:services"]);
    expect(empty.map((column) => column.id)).toEqual(["tags", "done", "notes", "system:assignedTo"]);
  });

  it("names a chip only when another visible chip shares its icon", () => {
    const { entries } = recordChipRowModel(columns, row());
    const named = Object.fromEntries(entries.map((entry) => [entry.column.id, entry.showName]));

    expect(named).toEqual({ value: true, weighted: true, quantity: false, "relationship:services": false });
  });

  it("keys a link chip by the list it points to", () => {
    const { entries } = recordChipRowModel([services], row());

    expect(entries[0].icon).toBe(`list:${SERVICES}`);
  });

  it("drops the shared-icon name once the twin is empty", () => {
    const fields = row().fields.map((entry) =>
      entry.fieldId === "weighted" ? { fieldId: "weighted", result: { state: "missing" as const } } : entry,
    );
    const { entries } = recordChipRowModel(columns, row({ fields }));

    expect(entries.find((entry) => entry.column.id === "value")?.showName).toBe(false);
  });

  it("treats a true switch, linked records and assignees as filled", () => {
    const fields = [{ fieldId: "done", result: value({ kind: "boolean", value: true }) }];
    const assignedUsers = [{ id: "u", firstName: "Max", lastName: "Bergmann", avatarUrl: null }];
    const filled = row({ fields, assignedUsers } as unknown as Partial<RecordRow>);

    expect(isEmptyColumn(filled, field("done", "Done", "boolean"))).toBe(false);
    expect(isEmptyColumn(filled, services)).toBe(false);
    expect(isEmptyColumn(filled, owner)).toBe(false);
    expect(isEmptyColumn(row({ relationships: [] }), services)).toBe(true);
  });
});

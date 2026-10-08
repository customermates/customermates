import { palettePlan } from "@/components/data-view/filter-palette/palette-field-plan";
import { resolveFilterValueClass } from "@/components/data-view/filter-modal/filter-value-class";
import type { RecordField, RecordScalar } from "@/features/records/record-model.schema";
import { recordInvariant } from "@/features/records/record-invariant";
import { describe, expect, it } from "vitest";
import { FilterOperatorKey as Op } from "@/core/base/base-query-builder";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import { relatedFieldKey, type QueryFilters } from "@/features/records/record-filter-target";
import { createRecordQueryFilterTarget } from "../record-query-filter-target";

const company = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = createCrmPreset(company);
const id = (key: string) => presetId(company, key);
const path = [{ relationId: id("deal.organizations"), direction: "outgoing" as const }];
const labels = {
  createdAt: "Created",
  updatedAt: "Updated",
  assignedTo: "Assigned",
  search: "Search",
  records: "Records",
  any: "Any",
  none: "None",
  unavailable: "Unavailable",
};
function fixture(initial: QueryFilters, metadata = model) {
  let query = initial;
  let disabled = false;
  const target = createRecordQueryFilterTarget({
    model: metadata,
    typeId: id("deal"),
    labels,
    read: () => query,
    write: (next) => {
      query = next;
    },
    isDisabled: () => disabled,
    identity: () => query,
  });
  return {
    target,
    read: () => query,
    disable: () => {
      disabled = true;
    },
  };
}
const condition = (value: string) => ({
  fieldId: id("organization.name"),
  operator: "eq" as const,
  value: { kind: "text" as const, value },
});

describe("record query palette host", () => {
  it("keeps independent same-path EXISTS clauses separate when editing an unrelated root search", () => {
    const groups = ["First", "Second"].map((name) => ({
      path,
      operator: "any" as const,
      filters: [condition(name)],
      relationships: [],
    }));
    const f = fixture({ filters: [], relationships: [], relatedFilters: groups });
    expect(f.target.groups).toHaveLength(2);
    f.target.setQueryOptions({ filters: [{ field: "query:search", operator: Op.contains, value: "Deal" }] });
    expect(f.read().relatedFilters).toEqual(groups);
    const group = recordInvariant(f.target.groups?.[0]);
    group.target.setQueryOptions({
      filters: [{ field: id("organization.name"), operator: Op.equals, value: "Changed" }],
    });
    expect(f.read().relatedFilters).toEqual([{ ...groups[0], filters: [condition("Changed")] }, groups[1]]);
  });

  it("shows and edits a deep negated group with retained search, record ids and relationship conditions", () => {
    const deep = [
      ...path,
      { relationId: id("contact.organizations"), direction: "incoming" as const },
      { relationId: id("contact.organizations"), direction: "outgoing" as const },
    ];
    const recordId = id("selected");
    const relationship = {
      relationId: id("contact.organizations"),
      direction: "incoming" as const,
      operator: "none" as const,
      recordIds: null,
    };
    const initial = {
      path: deep,
      operator: "none" as const,
      filters: [condition("First")],
      relationships: [relationship],
      search: "retained search",
      recordIds: [recordId],
    };
    const f = fixture({ filters: [], relationships: [], relatedFilters: [initial] });
    const group = recordInvariant(f.target.groups?.[0]);
    expect(group.mode).toBe("none");
    expect(group.target.filters).toHaveLength(4);
    expect(group.target.filterableFields.map((field) => field.field)).toContain(id("organization.name"));
    group.target.setQueryOptions({ filters: recordInvariant(group.target.filters) });
    expect(f.read().relatedFilters).toEqual([initial]);
    group.target.removeFilterAt(
      recordInvariant(group.target.filters).findIndex((filter) => filter.field === "query:search"),
    );
    expect(f.read().relatedFilters?.[0]).toMatchObject({ ...initial, search: undefined });
    group.setMode("any");
    expect(f.read().relatedFilters?.[0].operator).toBe("any");
    group.remove();
    expect(f.read().relatedFilters).toEqual([]);
  });

  it("creates a new linked group only after a valid value is applied", () => {
    const f = fixture({ filters: [], relationships: [] });
    const opened = recordInvariant(f.target.openField?.(relatedFieldKey(path, id("organization.name"))));
    expect(f.read().relatedFilters).toBeUndefined();
    opened.group.target.setQueryOptions({ filters: [{ field: opened.field, operator: Op.contains, value: "New" }] });
    expect(f.read().relatedFilters).toHaveLength(1);
    opened.group.target.setQueryOptions({
      filters: [{ field: opened.field, operator: Op.contains, value: "Updated" }],
    });
    expect(f.read().relatedFilters).toHaveLength(1);
    expect(f.read().relatedFilters?.[0].filters[0].value).toEqual({ kind: "text", value: "Updated" });
  });

  it("preserves an unavailable field until its visible chip is removed", () => {
    const unknown = { ...condition("Retained"), fieldId: id("archived") };
    const f = fixture({ filters: [unknown], relationships: [] });
    expect(f.target.filters).toHaveLength(1);
    f.target.setQueryOptions({
      filters: [
        ...recordInvariant(f.target.filters),
        { field: "query:search", operator: Op.contains, value: "Search" },
      ],
    });
    expect(f.read().filters).toEqual([unknown]);
    f.target.removeFilterAt(0);
    expect(f.read().filters).toEqual([]);
  });

  it("blocks all host mutation paths when the form becomes read only", () => {
    const initial = {
      filters: [],
      relationships: [],
      relatedFilters: [{ path, operator: "any" as const, filters: [condition("First")], relationships: [] }],
    };
    const f = fixture(initial);
    const group = recordInvariant(f.target.groups?.[0]);
    f.disable();
    f.target.setQueryOptions({ filters: [], forceRefresh: true });
    group.target.setQueryOptions({ filters: [] });
    group.setMode("none");
    group.remove();
    expect(f.read()).toEqual(initial);
  });
});

describe("record scalar array palette values", () => {
  it.each([
    {
      type: "text" as const,
      values: ["First", "Second"],
      scalar: (value: string): RecordScalar => ({ kind: "text", value }),
      page: "text",
    },
    {
      type: "number" as const,
      values: ["10", "25.5"],
      scalar: (value: string): RecordScalar => ({ kind: "decimal", value, currency: null }),
      page: "number",
    },
    {
      type: "date" as const,
      values: ["2026-01-01", "2026-02-01"],
      scalar: (value: string): RecordScalar => ({ kind: "date", value }),
      page: "date",
    },
  ])("chooses a scalar default and round-trips both array operators for $type", ({ type, values, scalar, page }) => {
    const field: RecordField = {
      ...recordInvariant(model.fields.find((field) => field.id === id("deal.name"))),
      id: id(`array-${type}`),
      valueType: type,
    };
    const metadata = { ...model, fields: [...model.fields, field] };
    for (const operator of ["in", "notIn"] as const) {
      const original = { fieldId: field.id, operator, value: null, values: values.map(scalar) };
      const f = fixture({ filters: [original], relationships: [] }, metadata);
      expect(palettePlan(field.id, f.target.filterableFields, f.target.filterColumns).pageKind).toBe(page);
      expect(resolveFilterValueClass(field.id, operator === "in" ? Op.in : Op.notIn, f.target.filterColumns)).toBe(
        "scalarArray",
      );
      f.target.setQueryOptions({ filters: recordInvariant(f.target.filters) });
      expect(f.read().filters).toEqual([original]);
      f.target.setQueryOptions({
        filters: [{ field: field.id, operator: operator === "in" ? Op.in : Op.notIn, value: values.slice(1) }],
      });
      expect(f.read().filters).toEqual([{ ...original, values: [scalar(values[1])] }]);
    }
  });
});

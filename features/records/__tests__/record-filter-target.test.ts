import type { Filter } from "@/core/base/base-get.schema";

import { describe, expect, it } from "vitest";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { createCrmPreset, presetId } from "@/features/records/crm-preset";
import {
  paletteFiltersToRecordQuery,
  parseRelatedFieldKey,
  recordFilterTarget,
  recordQueryToPaletteFilters,
  relatedFieldKey,
  relatedRecordKey,
} from "@/features/records/record-filter-target";
import { relationshipColumnKey } from "@/features/records/record-column.schema";

const companyId = "6487f9fb-7b10-439a-b783-9d3da8184b14";
const model = createCrmPreset(companyId, "EUR");
const id = (key: string) => presetId(companyId, key);
const labels = {
  createdAt: "Created",
  updatedAt: "Updated",
  assignedTo: "Assigned to",
};
function present<T>(value: T | undefined): T {
  if (value === undefined) throw new Error("Expected a preset entry");
  return value;
}
const stage = present(model.fields.find((field) => field.id === id("deal.stage")));
const won = present(stage.options.find((option) => option.label === "Won")).id;
const amount = present(model.fields.find((field) => field.typeId === id("deal") && field.valueType === "currency"));
const toDeal = {
  relationId: id("lineItem.deal"),
  direction: "outgoing" as const,
};
const toOrganizations = {
  relationId: id("deal.organizations"),
  direction: "outgoing" as const,
};

describe("record filter target", () => {
  it("lists own fields, links as record pickers and linked fields as List › Field entries", () => {
    const target = recordFilterTarget(model, id("lineItem"), labels);
    const fields = target.filterableFields.map((entry) => entry.field);
    expect(fields).toContain("system:assignedTo");
    expect(fields).toContain(relationshipColumnKey(toDeal.relationId, toDeal.direction));
    expect(fields).toContain(relatedFieldKey([toDeal], stage.id));
    expect(fields).toContain(relatedRecordKey([toDeal, toOrganizations]));
    expect(target.filterableFields.find((entry) => entry.field === relatedFieldKey([toDeal], stage.id))?.label).toBe(
      `Deal › ${stage.label}`,
    );
    expect(target.filterColumns.find((column) => column.id === relatedFieldKey([toDeal], stage.id))).toMatchObject({
      type: "singleSelect",
    });
    expect(
      target.filterColumns.find((column) => column.id === relatedRecordKey([toDeal, toOrganizations])),
    ).toMatchObject({ type: "recordReference", typeId: id("organization") });
    expect(parseRelatedFieldKey(relatedFieldKey([toDeal, toOrganizations], "x"))).toEqual({
      path: [toDeal, toOrganizations],
      fieldId: "x",
    });
  });

  it("round-trips field, link and linked-field filters through the palette shape", () => {
    const query = {
      filters: [
        {
          fieldId: stage.id,
          operator: "in" as const,
          value: null,
          values: [{ kind: "select" as const, value: won }],
        },
        {
          fieldId: amount.id,
          operator: "gte" as const,
          value: { kind: "decimal" as const, value: "100", currency: "EUR" },
        },
        {
          fieldId: "system:createdAt",
          operator: "inLastDays" as const,
          value: { kind: "decimal" as const, value: "30", currency: null },
        },
        {
          fieldId: "system:assignedTo",
          operator: "empty" as const,
          value: null,
        },
      ],
      relationships: [
        {
          relationId: toOrganizations.relationId,
          direction: toOrganizations.direction,
          operator: "none" as const,
          recordIds: null,
        },
      ],
    };
    const palette = recordQueryToPaletteFilters(query);
    expect(palette.retained).toEqual([]);
    expect(palette.filters).toEqual([
      { field: stage.id, operator: FilterOperatorKey.in, value: [won] },
      { field: amount.id, operator: FilterOperatorKey.gte, value: "100" },
      {
        field: "system:createdAt",
        operator: FilterOperatorKey.inLastDays,
        value: 30,
      },
      { field: "system:assignedTo", operator: FilterOperatorKey.isNull },
      {
        field: relationshipColumnKey(toOrganizations.relationId, "outgoing"),
        operator: FilterOperatorKey.hasNone,
      },
    ]);
    expect(paletteFiltersToRecordQuery(palette.filters, palette.retained, model, "EUR")).toEqual(query);
  });

  it("groups linked-field conditions on one path into one linked-record filter", () => {
    const filters: Filter[] = [
      {
        field: relatedFieldKey([toDeal], stage.id),
        operator: FilterOperatorKey.in,
        value: [won],
      },
      {
        field: relatedFieldKey([toDeal], amount.id),
        operator: FilterOperatorKey.gt,
        value: "10",
      },
      {
        field: relatedRecordKey([toDeal, toOrganizations]),
        operator: FilterOperatorKey.in,
        value: [id("organization")],
      },
    ];
    const query = paletteFiltersToRecordQuery(filters, [], model, "EUR");
    expect(query.relatedFilters).toEqual([
      {
        path: [toDeal],
        operator: "any",
        relationships: [],
        filters: [
          {
            fieldId: stage.id,
            operator: "in",
            value: null,
            values: [{ kind: "select", value: won }],
          },
          {
            fieldId: amount.id,
            operator: "gt",
            value: { kind: "decimal", value: "10", currency: "EUR" },
          },
        ],
      },
      {
        path: [toDeal, toOrganizations],
        operator: "any",
        filters: [],
        relationships: [],
        recordIds: [id("organization")],
      },
    ]);
    expect(recordQueryToPaletteFilters({ ...query, filters: [], relationships: [] }).filters).toEqual(filters);
  });

  it("shows not-equal as notIn, which matches empty values exactly like ne", () => {
    const palette = recordQueryToPaletteFilters({
      filters: [
        {
          fieldId: stage.id,
          operator: "ne",
          value: { kind: "select", value: won },
        },
      ],
      relationships: [],
    });
    expect(palette.filters).toEqual([{ field: stage.id, operator: FilterOperatorKey.notIn, value: [won] }]);
  });

  it("keeps linked-record filters the palette cannot express unchanged", () => {
    const searched = {
      path: [toDeal],
      operator: "any" as const,
      filters: [],
      relationships: [],
      search: "acme",
    };
    const negated = {
      path: [toDeal],
      operator: "none" as const,
      relationships: [],
      filters: [
        {
          fieldId: stage.id,
          operator: "in" as const,
          value: null,
          values: [{ kind: "select" as const, value: won }],
        },
      ],
    };
    const palette = recordQueryToPaletteFilters({
      filters: [],
      relationships: [],
      relatedFilters: [searched, negated],
    });
    expect(palette).toEqual({ filters: [], retained: [searched, negated] });
    expect(paletteFiltersToRecordQuery([], palette.retained, model, "EUR").relatedFilters).toEqual([searched, negated]);
  });
});

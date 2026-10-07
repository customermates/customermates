import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RecordField, RecordModel } from "../record-model.schema";

import { FilterOperatorKey } from "@/core/base/base-query-builder";
import { createCrmPreset, presetId } from "../crm-preset";
import { recordColumns } from "../record-columns";
import { recordDraftValue, recordFieldTypeKey, recordInputValue } from "../record-input-value";
import { scalarMatchesType, validateRecordModel } from "../record-model-validation";
import { RecordScalarSchema } from "../record-model.schema";
import { presentationQuery, recordColumnPresentation, recordFilterableFields } from "../record-presentation";
import { invalidRecordQueryPart } from "../record-query-validation";
import { RecordQuerySchema } from "../record-query.schema";

const workspace = randomUUID();
const typeId = presetId(workspace, "organization");
const tags: RecordField = {
  id: randomUUID(),
  typeId,
  label: "Tags",
  valueType: "select",
  multiple: true,
  behavior: { kind: "input", defaultValue: { kind: "selectList", value: ["beta"] } },
  required: false,
  archived: false,
  publishedSummary: false,
  position: 20,
  options: ["alpha", "beta"].map((id) => ({ id, label: id, color: "info", attributes: [] })),
};
const model = (): RecordModel => {
  const preset = createCrmPreset(workspace, "EUR");
  return { ...preset, fields: [...preset.fields, tags] };
};

describe("multiple choice fields", () => {
  it("accept an ordered list of distinct option ids", () => {
    expect(RecordScalarSchema.safeParse({ kind: "selectList", value: ["beta", "alpha"] }).success).toBe(true);
    expect(RecordScalarSchema.safeParse({ kind: "selectList", value: ["alpha", "alpha"] }).success).toBe(false);
    expect(RecordScalarSchema.safeParse({ kind: "selectList", value: [] }).success).toBe(false);
    expect(scalarMatchesType({ kind: "selectList", value: ["alpha"] }, "select", true)).toBe(true);
    expect(scalarMatchesType({ kind: "select", value: "alpha" }, "select", true)).toBe(false);
    expect(scalarMatchesType({ kind: "selectList", value: ["alpha"] }, "select", false)).toBe(false);
  });

  it("validate defaults against the options and stay out of calculations", () => {
    expect(validateRecordModel(model()).issues).toEqual([]);
    const unknownDefault = model();
    unknownDefault.fields = unknownDefault.fields.map((field) =>
      field.id === tags.id
        ? { ...field, behavior: { kind: "input", defaultValue: { kind: "selectList", value: ["gamma"] } } }
        : field,
    );
    expect(validateRecordModel(unknownDefault).issues).toContainEqual({ code: "invalid_default", fieldId: tags.id });
    const formula = model();
    const total = formula.fields.find((field) => field.id === presetId(workspace, "organization.name"));
    if (!total) throw new Error("Missing name field");
    formula.fields = formula.fields.map((field) =>
      field.id === total.id
        ? { ...field, behavior: { kind: "formula", expression: { kind: "field", fieldId: tags.id } } }
        : field,
    );
    expect(validateRecordModel(formula).issues).toContainEqual({
      code: "multiple_choice_not_calculable",
      fieldId: total.id,
    });
  });

  it("convert form input to option lists and back", () => {
    expect(recordInputValue(["beta", "alpha"], tags, "EUR")).toEqual({ kind: "selectList", value: ["beta", "alpha"] });
    expect(recordInputValue([], tags, "EUR")).toBeNull();
    expect(recordDraftValue({ kind: "selectList", value: ["alpha"] })).toEqual(["alpha"]);
    expect(recordFieldTypeKey(tags)).toBe("multiSelect");
    expect(recordFieldTypeKey({ valueType: "select", multiple: false })).toBe("select");
  });

  it("offer any, all and none filters and map them onto the record query", () => {
    const fields = model().fields.filter((field) => field.typeId === typeId);
    expect(recordFilterableFields(fields).find((field) => field.field === tags.id)?.operators).toEqual([
      FilterOperatorKey.hasAnyOf,
      FilterOperatorKey.hasAllOf,
      FilterOperatorKey.hasNoneOf,
      FilterOperatorKey.isNull,
      FilterOperatorKey.isNotNull,
    ]);
    const query = presentationQuery(
      typeId,
      fields,
      {
        filters: [
          { field: tags.id, operator: FilterOperatorKey.hasAnyOf, value: ["alpha"] },
          { field: tags.id, operator: FilterOperatorKey.hasAllOf, value: ["alpha", "beta"] },
          { field: tags.id, operator: FilterOperatorKey.hasNoneOf, value: ["beta"] },
        ],
      },
      "EUR",
    );
    expect(query.filters.map(({ operator, values }) => [operator, values])).toEqual([
      ["in", [{ kind: "select", value: "alpha" }]],
      [
        "all",
        [
          { kind: "select", value: "alpha" },
          { kind: "select", value: "beta" },
        ],
      ],
      ["notIn", [{ kind: "select", value: "beta" }]],
    ]);
  });

  it("present as a multiple select column that cannot be sorted", () => {
    expect(recordColumnPresentation(tags)).toMatchObject({
      type: "singleSelect",
      options: {
        allowMultiple: true,
        options: [
          { value: "alpha", isDefault: false },
          { value: "beta", isDefault: true },
        ],
      },
    });
    expect(recordColumns(typeId, model()).find((column) => column.id === tags.id)).toMatchObject({ sortable: false });
    const sorted = RecordQuerySchema.parse({ typeId, sort: [{ fieldId: tags.id, direction: "asc" }] });
    expect(invalidRecordQueryPart(sorted, model())).toBe("sort");
    const unknown = RecordQuerySchema.parse({
      typeId,
      filters: [{ fieldId: tags.id, operator: "in", value: null, values: [{ kind: "select", value: "gamma" }] }],
    });
    expect(invalidRecordQueryPart(unknown, model())).toBe("filters");
  });
});

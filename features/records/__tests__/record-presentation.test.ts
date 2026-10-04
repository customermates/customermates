import type { Filter } from "@/core/base/base-get.schema";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RecordField } from "../record-model.schema";

import { createCrmPreset, presetId } from "../crm-preset";
import { presentationQuery, recordColumnPresentation, recordFilterableFields } from "../record-presentation";
import { invalidRecordQueryPart } from "../record-query-validation";
import { RecordQuerySchema } from "../record-query.schema";
import { recordViewStateIsValid } from "../record-view-state";
import { scalarMatchesType } from "../record-model-validation";
import { recordColumns } from "../record-columns";
import { RecordColumnKeySchema, RecordFieldKeySchema } from "../record-column.schema";
import { FilterOperatorKey as Operator } from "@/core/base/base-query-builder";
import {
  resolveFilterDateGranularity,
  resolveFilterValueClass,
} from "@/components/data-view/filter-modal/filter-value-class";

const workspace = randomUUID();
const id = (key: string) => presetId(workspace, key);
const model = createCrmPreset(workspace, "EUR");
const fields = model.fields.filter((field) => field.typeId === id("deal"));
const relationship = `relationship:${id("deal.organizations")}:outgoing`;
const window: RecordField = {
  id: randomUUID(),
  typeId: id("deal"),
  label: "Delivery",
  valueType: "dateTimeRange",
  behavior: { kind: "input" },
  required: false,
  publishedSummary: false,
  multiple: false,
  archived: false,
  position: 20,
  options: [],
};
const extended = { ...model, fields: [...model.fields, window] };

describe("generic record presentation filters", () => {
  it("exposes identity channels only on bound types and keeps them out of scalar query operators", () => {
    expect(recordColumns(id("contact"), model)).toContainEqual({
      kind: "identity",
      id: "system:channels",
      label: "channels",
      sortable: false,
    });
    expect(recordColumns(id("organization"), model).some((column) => column.id === "system:channels")).toBe(false);
    expect(RecordColumnKeySchema.safeParse("system:channels").success).toBe(true);
    expect(RecordFieldKeySchema.safeParse("system:channels").success).toBe(false);
    expect(recordViewStateIsValid(id("contact"), { columnOrder: ["system:channels"] }, model, "EUR")).toBe(true);
    expect(recordViewStateIsValid(id("organization"), { columnOrder: ["system:channels"] }, model, "EUR")).toBe(false);
  });
  it("preserves typed relationship, assignment and relative-date filters in saved views", () => {
    const related = randomUUID();
    const member = randomUUID();
    const filters: Filter[] = [
      { field: relationship, operator: Operator.notIn, value: [related] },
      { field: "system:assignedTo", operator: Operator.in, value: [member] },
      { field: "system:updatedAt", operator: Operator.inLastDays, value: 30 },
      { field: "system:createdAt", operator: Operator.notInLastDays, value: 3 },
    ];
    expect(recordViewStateIsValid(id("deal"), { filters }, model, "EUR")).toBe(true);
    const query = presentationQuery(id("deal"), fields, { filters }, "EUR", model.relationships);
    expect(query.relationships).toEqual([
      { relationId: id("deal.organizations"), direction: "outgoing", operator: "none", recordIds: [related] },
    ]);
    expect(query.filters).toEqual([
      { fieldId: "system:assignedTo", operator: "in", value: null, values: [{ kind: "member", value: member }] },
      { fieldId: "system:updatedAt", operator: "inLastDays", value: { kind: "decimal", value: "30", currency: null } },
      {
        fieldId: "system:createdAt",
        operator: "notInLastDays",
        value: { kind: "decimal", value: "3", currency: null },
      },
    ]);
  });

  it("distinguishes existence from selected relationship records and rejects foreign definitions", () => {
    for (const [operator, expected] of [
      [Operator.hasSome, "any"],
      [Operator.hasNone, "none"],
    ] as const) {
      expect(
        presentationQuery(
          id("deal"),
          fields,
          { filters: [{ field: relationship, operator }] },
          "EUR",
          model.relationships,
        ).relationships[0],
      ).toMatchObject({ operator: expected, recordIds: null });
    }
    expect(
      recordViewStateIsValid(
        id("organization"),
        { filters: [{ field: relationship, operator: Operator.hasSome }] },
        model,
        "EUR",
      ),
    ).toBe(false);
    expect(
      recordViewStateIsValid(
        id("deal"),
        { filters: [{ field: `relationship:${randomUUID()}:outgoing`, operator: Operator.hasSome }] },
        model,
        "EUR",
      ),
    ).toBe(false);
  });

  it("validates range boundaries at microsecond precision, including timezone offsets", () => {
    const values = ["2026-09-28T14:00:00.000002+02:00", "2026-09-28T12:00:00.000001Z"];
    expect(
      recordViewStateIsValid(
        id("deal"),
        { filters: [{ field: window.id, operator: Operator.between, value: values }] },
        extended,
        "EUR",
      ),
    ).toBe(false);
    expect(
      recordViewStateIsValid(
        id("deal"),
        { filters: [{ field: window.id, operator: Operator.between, value: [...values].reverse() }] },
        extended,
        "EUR",
      ),
    ).toBe(true);
    expect(scalarMatchesType({ kind: "range", start: values[0], end: values[1] }, "dateTimeRange")).toBe(false);
  });

  it.each(["0", "-1", "0.5", "365001"])("rejects invalid or excessive relative windows %s", (value) => {
    for (const operator of ["inLastDays", "notInLastDays"] as const) {
      const query = RecordQuerySchema.parse({
        typeId: id("deal"),
        filters: [{ fieldId: "system:createdAt", operator, value: { kind: "decimal", value, currency: null } }],
      });
      expect(invalidRecordQueryPart(query, model)).toBe("filters");
    }
  });

  it("retains all fifty saved filters without silently dropping conditions", () => {
    const filters = Array.from({ length: 50 }, () => ({
      field: id("deal.name"),
      operator: Operator.contains as const,
      value: "a",
    }));
    expect(presentationQuery(id("deal"), fields, { filters }, "EUR").filters).toHaveLength(50);
  });

  it("uses the existing date and selection controls for dynamic and system columns", () => {
    const columns = [
      recordColumnPresentation(window),
      { id: "system:updatedAt", label: "Updated", type: "dateTime" as const },
      { id: relationship, label: "Clients", type: "recordReference" as const, typeId: id("organization") },
      { id: "system:assignedTo", label: "Owner", type: "member" as const },
    ];
    expect(resolveFilterValueClass(window.id, Operator.contains, columns)).toBe("isoDate");
    expect(resolveFilterValueClass("system:updatedAt", Operator.gte, columns)).toBe("isoDate");
    expect(resolveFilterValueClass(relationship, Operator.in, columns)).toBe("stringArray");
    expect(resolveFilterValueClass("system:assignedTo", Operator.in, columns)).toBe("stringArray");
    expect(resolveFilterDateGranularity(window.id, columns)).toBe("minute");
    expect(
      recordFilterableFields([...fields, window], model.relationships, id("deal")).find(
        (field) => field.field === window.id,
      )?.operators,
    ).toContain(Operator.between);
  });
});

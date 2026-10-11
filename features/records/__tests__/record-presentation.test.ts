import type { Filter } from "@/core/base/base-get.schema";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { RecordField } from "../record-model.schema";

import { createCrmPreset, presetId } from "../crm-preset";
import {
  presentationQuery,
  recordColumnPresentation,
  recordFilterableFields,
  recordLinkColor,
  recordLinkColors,
  recordDefaults,
} from "../record-presentation";
import { RecordModelSchema } from "../record-model.schema";
import { canonicalRecordJson } from "../record-json";
import { invalidRecordQueryPart } from "../record-query-validation";
import { RecordQuerySchema } from "../record-query.schema";
import { cleanRecordViewState, recordViewStateIsValid } from "../record-view-state";
import { liveGroupSummaries, recordSummaryFields } from "../record-grouping";
import { recordInvariant } from "../record-invariant";
import { GroupingSchema } from "@/core/base/grouping/grouping.schema";
import { scalarMatchesType } from "../record-model-validation";
import { defaultHiddenColumns, recordColumns } from "../record-columns";
import { RecordColumnKeySchema, RecordFieldKeySchema } from "../record-column.schema";
import { FilterOperatorKey as Operator, ViewMode } from "@/core/base/base-query-builder";
import {
  resolveFilterDateGranularity,
  resolveFilterValueClass,
} from "@/components/data-view/filter-modal/filter-value-class";

const workspace = randomUUID();
const id = (key: string) => presetId(workspace, key);
const model = createCrmPreset(workspace);
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
  it("shows Channels as a field column of its own list and keeps it out of filters, sorting and grouping", () => {
    const channels = id("capability.identity");
    expect(recordColumns(id("contact"), model)).toContainEqual(
      expect.objectContaining({ kind: "field", id: channels, sortable: false }),
    );
    expect(recordColumns(id("organization"), model).some((column) => column.id === channels)).toBe(false);
    expect(RecordColumnKeySchema.safeParse("system:channels").success).toBe(false);
    expect(RecordFieldKeySchema.safeParse(channels).success).toBe(true);
    expect(recordViewStateIsValid(id("contact"), { columnOrder: [channels] }, model)).toBe(true);
    expect(recordViewStateIsValid(id("organization"), { columnOrder: [channels] }, model)).toBe(false);
    expect(
      recordFilterableFields(model.fields.filter((field) => field.typeId === id("contact"))).some(
        (field) => field.field === channels,
      ),
    ).toBe(false);
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
    expect(recordViewStateIsValid(id("deal"), { filters }, model)).toBe(true);
    const query = presentationQuery(id("deal"), fields, { filters }, model.relationships);
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
        presentationQuery(id("deal"), fields, { filters: [{ field: relationship, operator }] }, model.relationships)
          .relationships[0],
      ).toMatchObject({ operator: expected, recordIds: null });
    }
    expect(
      recordViewStateIsValid(
        id("organization"),
        { filters: [{ field: relationship, operator: Operator.hasSome }] },
        model,
      ),
    ).toBe(false);
    expect(
      recordViewStateIsValid(
        id("deal"),
        { filters: [{ field: `relationship:${randomUUID()}:outgoing`, operator: Operator.hasSome }] },
        model,
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
      ),
    ).toBe(false);
    expect(
      recordViewStateIsValid(
        id("deal"),
        { filters: [{ field: window.id, operator: Operator.between, value: [...values].reverse() }] },
        extended,
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
    expect(presentationQuery(id("deal"), fields, { filters }).filters).toHaveLength(50);
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

describe("record view defaults", () => {
  it("shows every field in its configured order as an ungrouped, unsorted table with Formatted text hidden", () => {
    const deal = recordInvariant(model.types.find((type) => type.id === id("deal")));
    const notes = id("deal.notes");
    const own = model.fields.filter((field) => field.typeId === deal.id).map((field) => field.id);
    expect(recordColumns(deal.id, model).some((column) => column.id === notes)).toBe(true);
    expect(recordDefaults(deal.id, model.fields)).toEqual({
      columnOrder: own,
      hiddenColumns: [notes],
      viewMode: ViewMode.table,
      grouping: null,
      sortDescriptor: null,
    });
    expect(defaultHiddenColumns(deal.id, model.fields)).toEqual([notes]);
    expect(
      defaultHiddenColumns(
        deal.id,
        model.fields.map((field) => (field.id === notes ? { ...field, archived: true } : field)),
      ),
    ).toEqual([]);
  });
});

describe("view group summaries", () => {
  const value = id("deal.totalValue");
  const weighted = id("deal.weightedValue");
  const stage = id("deal.stage");

  it("keeps only live number and currency fields of the list, each pair once", () => {
    expect(recordSummaryFields(id("deal"), model.fields).map((field) => field.id)).toEqual(
      expect.arrayContaining([value, weighted]),
    );
    expect(
      liveGroupSummaries(
        id("deal"),
        [
          { fieldId: value, aggregation: "sum" },
          { fieldId: value, aggregation: "sum" },
          { fieldId: stage, aggregation: "sum" },
          { fieldId: id("service.amount"), aggregation: "max" },
          { fieldId: weighted, aggregation: "average" },
        ],
        model.fields,
      ),
    ).toEqual([
      { fieldId: value, aggregation: "sum" },
      { fieldId: weighted, aggregation: "average" },
    ]);
    expect(liveGroupSummaries(id("deal"), undefined, model.fields)).toEqual([]);
  });

  it("validates summaries as part of a view's grouping and drops stale fields when cleaning", () => {
    const grouping = { field: stage, summaries: [{ fieldId: value, aggregation: "sum" as const }] };
    expect(recordViewStateIsValid(id("deal"), { grouping }, model)).toBe(true);
    expect(
      recordViewStateIsValid(
        id("deal"),
        { grouping: { field: stage, summaries: [{ fieldId: stage, aggregation: "sum" }] } },
        model,
      ),
    ).toBe(false);
    const archived = {
      ...model,
      fields: model.fields.map((field) => (field.id === weighted ? { ...field, archived: true } : field)),
    };
    const state = {
      grouping: {
        field: stage,
        summaries: [
          { fieldId: value, aggregation: "sum" as const },
          { fieldId: weighted, aggregation: "sum" as const },
        ],
      },
    };
    expect(recordViewStateIsValid(id("deal"), state, archived)).toBe(false);
    expect(cleanRecordViewState(id("deal"), state, archived)).toEqual({
      grouping: { field: stage, summaries: [{ fieldId: value, aggregation: "sum" }] },
    });
  });

  it("caps summaries at eight and rejects unknown aggregations in the view grouping", () => {
    const summary = { fieldId: value, aggregation: "sum" as const };
    expect(GroupingSchema.safeParse({ field: stage, summaries: Array(8).fill(summary) }).success).toBe(true);
    expect(GroupingSchema.safeParse({ field: stage, summaries: Array(9).fill(summary) }).success).toBe(false);
    expect(
      GroupingSchema.safeParse({ field: stage, summaries: [{ fieldId: value, aggregation: "count" }] }).success,
    ).toBe(false);
    expect(
      RecordQuerySchema.parse({ typeId: id("deal"), grouping: { field: stage, summaries: [summary] } }).grouping,
    ).toEqual({ field: stage });
  });
});

describe("record list colors", () => {
  it("colors links by their target list and stays neutral when the list has no color", () => {
    const model = createCrmPreset("workspace");
    const organizationId = presetId("workspace", "organization");
    const types = model.types.map((type) => (type.id === organizationId ? { ...type, color: "info" as const } : type));
    const colors = recordLinkColors(types, model.relationships);
    expect(colors).toEqual({ [organizationId]: "info" });
    expect(recordLinkColor(colors, organizationId)).toBe("info");
    expect(recordLinkColor(colors, presetId("workspace", "deal"))).toBe("secondary");
  });

  it("keeps a list color through JSON storage and rejects colors outside the chip palette", () => {
    const model = createCrmPreset("workspace");
    model.types[0].color = "success";
    expect(RecordModelSchema.parse(JSON.parse(canonicalRecordJson(model))).types[0]?.color).toBe("success");
    const invalid = JSON.parse(canonicalRecordJson(model));
    invalid.types[0].color = "purple";
    expect(RecordModelSchema.safeParse(invalid).success).toBe(false);
  });
});

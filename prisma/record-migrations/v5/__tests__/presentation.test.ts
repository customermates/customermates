import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { LegacyModel, LegacyType } from "../../v2/legacy-model";
import { createCrmPreset, presetId } from "../../v2/contract/crm-preset";
import { migrateColumnKey, LIST_SURFACES, DETAIL_SURFACES } from "../columns";
import { presentationMigrationModel } from "../model";
import { migrateDetailState, migratePresentationState } from "../state";
import { migrateQueryFilter } from "../filters";
import { migrateChartMeasure } from "../widgets";
import { readRecordModelSnapshot } from "@/features/records/record-model-snapshot";
import { recordMeasureIsValid } from "@/features/records/record-measure-validation";
import { RecordMeasureSchema } from "@/features/records/record-measure.schema";
import { recordViewStateIsValid } from "@/features/records/record-view-state";
import { DataViewStateSchema } from "@/core/data-view/data-view-state.schema";

const companyId = randomUUID();
const id = (key: string) => presetId(companyId, key);
function fixture() {
  const source: LegacyModel = {
    companyId,
    currency: "EUR",
    model: createCrmPreset(companyId, "EUR"),
    columns: [],
    issues: [],
    weightingFieldId: id("deal.stage"),
  };
  for (const kind of ["contact", "organization", "service", "task"] as const) {
    source.model.fields.push({
      id: id(`${kind}.status`),
      typeId: id(kind),
      label: "Status",
      valueType: "select",
      behavior: { kind: "input" },
      required: false,
      archived: false,
      publishedSummary: false,
      position: 20,
      options: [{ id: "open", label: "Open", color: null, attributes: [] }],
    });
  }
  return { source, model: presentationMigrationModel(source) };
}
const stateRow = () => ({
  id: randomUUID(),
  userId: randomUUID(),
  companyId,
  name: "My choices",
  position: 4,
  createdAt: "2026-01-01T12:00:00.123456Z",
  updatedAt: "2026-02-01T12:00:00.123456Z",
  filters: null,
  searchTerm: null,
  sortDescriptor: null,
  pagination: null,
  pageSize: null,
  columnOrder: null,
  hiddenColumns: null,
  columnWidths: null,
  grouping: null,
  groupingColumnId: null,
  viewMode: null,
});
const chart = (entityType: LegacyType, aggregationType = "count", groupByType = "none") => ({
  entityType,
  aggregationType,
  groupByType,
  groupByCustomColumnId: null,
  entityFilters: [],
  dealFilters: [],
});

describe("version five presentation conversion", () => {
  it("decodes a frozen metadata contract without rewriting its historical revision", () => {
    const { model } = fixture();
    const snapshot = structuredClone(model);
    const decoded = readRecordModelSnapshot(model);
    expect(model).toEqual(snapshot);
    expect(decoded).toEqual({
      ...model,
      capabilities: model.capabilities.map((binding) =>
        binding.kind === "personIdentity"
          ? { ...binding, kind: "channels", enabled: true, providerAvatar: true }
          : binding,
      ),
    });
    expect(decoded.revision).toBe(model.revision);
    expect(model.revision).toBe(3);
    expect(model.types.find((type) => type.id === id("contact"))?.defaults.hiddenColumns).toEqual([
      id("contact.firstName"),
      id("contact.lastName"),
      id("contact.avatarUrl"),
    ]);
    expect(LIST_SURFACES["organizations-card-store"]).toBe("organization");
    expect(DETAIL_SURFACES["organization-detail"]).toBe("organization");
  });

  it("maps scalar, identity, assignment, direct and line-item relationship columns without conflating types", () => {
    const { source } = fixture();
    expect(migrateColumnKey(source, "contact", "name")).toBe(id("contact.name"));
    expect(migrateColumnKey(source, "organization", "name")).toBe(id("organization.name"));
    expect(migrateColumnKey(source, "contact", "channels")).toBe("system:channels");
    expect(migrateColumnKey(source, "task", "users")).toBe("system:assignedTo");
    expect(migrateColumnKey(source, "organization", "contactIds")).toBe(
      `relationship:${id("contact.organizations")}:incoming`,
    );
    expect(migrateColumnKey(source, "service", "dealIds")).toBe(`path:${id("service.deals.path")}`);
    expect(() => migrateColumnKey(source, "organization", id("contact.status"))).toThrow(
      "unresolved_presentation_field",
    );
    expect(() => migrateColumnKey(source, "organization", "channels")).toThrow("unresolved_presentation_field");
  });

  it("preserves null, empty and explicit personal settings, owners, timestamps and cleared sorts", () => {
    const { source, model } = fixture();
    const row = {
      ...stateRow(),
      p13nId: "deals-card-store",
      activeViewKey: randomUUID(),
      columnOrder: ["name", "services"],
      hiddenColumns: [],
      columnWidths: { totalValue: 186 },
      sortDescriptor: {},
      filters: [],
      grouping: null,
      viewStateKeys: ["columnOrder", "sortDescriptor", "grouping", "hiddenColumns"],
    };
    const result = migratePresentationState(source, "deal", row, model, true);
    expect(result).toMatchObject({
      ...row,
      columnOrder: [id("deal.name"), `path:${id("deal.services.path")}`],
      hiddenColumns: [`relationship:${id("lineItem.deal")}:incoming`],
      columnWidths: { [id("deal.totalValue")]: 186 },
    });
    expect(result.sortDescriptor).toEqual({});
    expect(result.grouping).toBeNull();
    expect(result.viewStateKeys).toEqual(row.viewStateKeys);
    const inferred = migratePresentationState(source, "deal", { ...row, viewStateKeys: null }, model, true);
    expect(inferred.viewStateKeys).toEqual([
      "filters",
      "sortDescriptor",
      "columnOrder",
      "columnWidths",
      "hiddenColumns",
    ]);
  });

  it("converts named view filters, sorting and grouping to a live-valid query", () => {
    const { source, model } = fixture();
    const result = migratePresentationState(
      source,
      "deal",
      {
        ...stateRow(),
        filters: [
          { field: "totalValue", operator: "gte", value: 1000 },
          { field: "serviceIds", operator: "hasSome", value: [randomUUID()] },
        ],
        grouping: { field: "organizationIds" },
        groupingColumnId: randomUUID(),
        sortDescriptor: { field: "weightedValue", direction: "desc" },
        viewMode: "card",
        pageSize: 25,
        columnOrder: ["name", "weightedValue"],
      },
      model,
      false,
    );
    expect(result.grouping).toEqual({ field: `relationship:${id("deal.organizations")}:outgoing` });
    expect(result.groupingColumnId).toBeNull();
    const state = DataViewStateSchema.parse(
      Object.fromEntries(
        Object.entries(result).filter(
          ([key, value]) =>
            value !== null &&
            ["filters", "grouping", "sortDescriptor", "viewMode", "pageSize", "columnOrder"].includes(key),
        ),
      ),
    );
    expect(recordViewStateIsValid(id("deal"), state, readRecordModelSnapshot(model), "EUR")).toBe(true);
    expect(() =>
      migratePresentationState(
        source,
        "deal",
        { ...stateRow(), columnOrder: ["contacts", "contactIds"] },
        model,
        false,
      ),
    ).toThrow("duplicate_column_after_mapping");
    expect(() =>
      migratePresentationState(source, "deal", { ...stateRow(), grouping: { field: "name" } }, model, false),
    ).toThrow("invalid_grouping");
  });

  it("retains personal detail order fallbacks and each explicitly hidden or pinned field", () => {
    const { source, model } = fixture();
    const row = {
      ...stateRow(),
      p13nId: "contact-detail",
      columnOrder: ["firstName", "lastName", "organizations"],
      detailOptions: {
        starredFieldIds: ["channels"],
        hiddenFieldIds: ["updatedAt"],
        collapsedSectionIds: ["relations"],
      },
    };
    expect(migrateDetailState(source, "contact", row, model)).toEqual({
      ...row,
      p13nId: `record-detail:${id("contact")}`,
      columnOrder: [
        id("contact.firstName"),
        id("contact.lastName"),
        `relationship:${id("contact.organizations")}:outgoing`,
      ],
      detailOptions: {
        starredFieldIds: ["system:channels"],
        hiddenFieldIds: ["system:updatedAt"],
        collapsedSectionIds: ["relations"],
      },
    });
    expect(() => migrateDetailState(source, "contact", { ...row, detailOptions: {} }, model)).toThrow();
    expect(() => migrateDetailState(source, "contact", { ...row, columnOrder: [randomUUID()] }, model)).toThrow(
      "unresolved_presentation_field",
    );
  });

  it.each(["contact", "organization", "deal", "service", "task"] as const)(
    "migrates %s count reports with current source filters",
    (kind) => {
      const { source, model } = fixture();
      const measure = migrateChartMeasure(
        source,
        { ...chart(kind), entityFilters: [{ field: "updatedAt", operator: "inLastDays", value: 30 }] },
        model,
      );
      expect(measure.source.typeId).toBe(id(kind));
      expect(measure.aggregation).toBe("count");
      expect(measure.valueFieldId).toBeNull();
      expect(recordMeasureIsValid(RecordMeasureSchema.parse(measure), readRecordModelSnapshot(model))).toBe(true);
    },
  );

  it.each(["contact", "organization", "deal"] as const)(
    "keeps full deal attribution and filtered groups for %s value reports",
    (kind) => {
      const { source, model } = fixture();
      const status = id(`${kind}.${kind === "deal" ? "stage" : "status"}`);
      const measure = migrateChartMeasure(
        source,
        {
          ...chart(kind, "dealWeightedValue", "customColumn"),
          groupByCustomColumnId: status,
          entityFilters: [{ field: "name", operator: "contains", value: "client" }],
        },
        model,
      );
      expect(measure.source.typeId).toBe(id("deal"));
      expect(measure.valueFieldId).toBe(id("deal.weightedValue"));
      expect(measure.groupBy?.fieldId).toBe(status);
      expect(measure.groupBy?.path).toHaveLength(kind === "deal" ? 0 : 1);
      if (kind !== "deal") expect(measure.groupBy?.filter?.filters).toHaveLength(1);
      expect(recordMeasureIsValid(RecordMeasureSchema.parse(measure), readRecordModelSnapshot(model))).toBe(true);
    },
  );

  it.each(["dealValue", "dealQuantity"])(
    "uses line-item contributions for grouped and ungrouped service %s",
    (aggregation) => {
      const { source, model } = fixture();
      for (const grouping of ["none", "service", "customColumn"]) {
        const measure = migrateChartMeasure(
          source,
          {
            ...chart("service", aggregation, grouping),
            groupByCustomColumnId: id("service.status"),
            entityFilters: [{ field: "dealIds", operator: "notIn", value: [randomUUID()] }],
            dealFilters: [{ field: "serviceIds", operator: "hasSome" }],
          },
          model,
        );
        expect(measure.source.typeId).toBe(id("lineItem"));
        expect(measure.valueFieldId).toBe(id(aggregation === "dealQuantity" ? "lineItem.quantity" : "lineItem.amount"));
        expect(measure.source.relatedFilters).toHaveLength(4);
        expect(
          measure.source.relatedFilters?.some((filter) => filter.operator === "none" && filter.path.length === 3),
        ).toBe(true);
        expect(recordMeasureIsValid(RecordMeasureSchema.parse(measure), readRecordModelSnapshot(model))).toBe(true);
      }
    },
  );

  it("rejects stale widget references and previously invalid measures instead of converting them to zero", () => {
    const { source, model } = fixture();
    expect(() => migrateChartMeasure(source, chart("task", "dealValue"), model)).toThrow(
      "unsupported_legacy_widget_measure",
    );
    expect(() => migrateChartMeasure(source, chart("service", "dealWeightedValue"), model)).toThrow(
      "unsupported_legacy_widget_measure",
    );
    expect(() =>
      migrateChartMeasure(
        source,
        { ...chart("deal", "count", "customColumn"), groupByCustomColumnId: randomUUID() },
        model,
      ),
    ).toThrow("unresolved_widget_group_field");
    expect(() =>
      migrateQueryFilter(
        source,
        "deal",
        [{ field: "createdAt", operator: "between", value: ["2026-02-02", "2026-01-01"] }],
        model,
      ),
    ).toThrow();
  });
});

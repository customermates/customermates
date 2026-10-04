import { z } from "zod";
import type { LegacyModel } from "../v2/legacy-model";
import { LEGACY_TYPES } from "../v2/legacy-model";
import { presetId } from "../v2/contract/crm-preset";
import type { RecordModel } from "./contract/record-model.schema";
import { RecordMeasureSchema, type RecordMeasure } from "./contract/record-measure.schema";
import { recordMeasureIsValid } from "./contract/record-measure-validation";
import { migrateQueryFilter, type MigratedQueryFilter } from "./filters";
import { PresentationMigrationError } from "./columns";

const LegacyChart = z.object({
  entityType: z.enum(LEGACY_TYPES),
  aggregationType: z.enum(["count", "dealValue", "dealWeightedValue", "dealQuantity"]),
  groupByType: z.enum(["none", "customColumn", "contact", "organization", "deal", "service"]),
  groupByCustomColumnId: z.string().nullable(),
  entityFilters: z.unknown(),
  dealFilters: z.unknown(),
});

export function migrateChartMeasure(source: LegacyModel, raw: unknown, model: RecordModel): RecordMeasure {
  const chart = LegacyChart.parse(raw);
  const { entityType: kind, aggregationType: aggregation, groupByType } = chart;
  const id = (key: string) => presetId(source.companyId, key);
  const entity = migrateQueryFilter(source, kind, chart.entityFilters, model);
  const deals = migrateQueryFilter(source, "deal", chart.dealFilters, model);
  const isCount = aggregation === "count";
  if (
    (!isCount && kind === "task") ||
    (aggregation === "dealQuantity" && kind !== "service") ||
    (aggregation === "dealWeightedValue" && kind === "service")
  )
    throw new PresentationMigrationError("aggregationType", "unsupported_legacy_widget_measure");
  if (groupByType !== "none" && groupByType !== "customColumn" && (groupByType !== kind || isCount))
    throw new PresentationMigrationError("groupByType", "invalid_legacy_widget_group");
  const sourceType = isCount ? kind : kind === "service" ? "lineItem" : "deal";
  const related: NonNullable<MigratedQueryFilter["relatedFilters"]> = [];
  const through = (path: NonNullable<RecordMeasure["groupBy"]>["path"], filter: MigratedQueryFilter) => {
    related.push({ path, operator: "any", filters: filter.filters, relationships: filter.relationships });
    if (filter.relatedFilters?.length) {
      const singular = path.every((step) => {
        const relation = model.relationships.find((relation) => relation.id === step.relationId);
        return (
          relation &&
          (step.direction === "outgoing" ? relation.sourceCardinality : relation.targetCardinality) === "one"
        );
      });
      if (!singular) throw new PresentationMigrationError("entityFilters", "ambiguous_nested_relationship_filter");
      related.push(...filter.relatedFilters.map((nested) => ({ ...nested, path: [...path, ...nested.path] })));
    }
  };
  const entityPath: NonNullable<RecordMeasure["groupBy"]>["path"] =
    sourceType === kind
      ? []
      : [{ relationId: id(kind === "service" ? "lineItem.service" : `deal.${kind}s`), direction: "outgoing" }];
  let sourceFilter: MigratedQueryFilter;
  if (isCount) sourceFilter = entity;
  else if (kind === "deal") {
    sourceFilter = {
      filters: [...entity.filters, ...deals.filters],
      relationships: [...entity.relationships, ...deals.relationships],
      relatedFilters: [...(entity.relatedFilters ?? []), ...(deals.relatedFilters ?? [])],
    };
  } else if (kind === "service") {
    through([{ relationId: id("lineItem.deal"), direction: "outgoing" }], deals);
    sourceFilter = { filters: [], relationships: [] };
  } else sourceFilter = deals;
  if (!isCount && kind !== "deal") through(entityPath, entity);
  const valueFieldId = isCount
    ? null
    : kind === "service"
      ? id(aggregation === "dealQuantity" ? "lineItem.quantity" : "lineItem.amount")
      : id(aggregation === "dealWeightedValue" ? "deal.weightedValue" : "deal.totalValue");
  const field =
    groupByType === "customColumn"
      ? model.fields.find(
          (field) =>
            field.id === chart.groupByCustomColumnId && field.typeId === id(kind) && field.valueType === "select",
        )
      : null;
  if (groupByType === "customColumn" && !field)
    throw new PresentationMigrationError("groupByCustomColumnId", "unresolved_widget_group_field");
  const measure = RecordMeasureSchema.parse({
    source: {
      typeId: id(sourceType),
      ...sourceFilter,
      relatedFilters: [...(sourceFilter.relatedFilters ?? []), ...related],
    },
    aggregation: isCount ? "count" : "sum",
    valueFieldId,
    groupBy:
      groupByType === "none"
        ? null
        : { path: entityPath, fieldId: field?.id ?? null, ...(entityPath.length ? { filter: entity } : {}) },
    groupLimit: 1000,
  });
  if (!recordMeasureIsValid(measure, model))
    throw new PresentationMigrationError("measure", "invalid_migrated_widget_measure");
  return measure;
}

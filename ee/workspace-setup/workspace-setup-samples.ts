import type { RecordModel } from "@/features/records/record-model.schema";
import type { SpreadsheetMapping, SpreadsheetTable } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";

import { importableSpreadsheetField } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { SETUP_PLAN_LIMITS } from "@/features/workspace-setup/setup-plan.schema";

const MAX_COLUMNS = 24;
const LINK_SEPARATOR = "; ";

export type SampleColumn = {
  column: string;
  fieldId: string;
  label: string;
  valueType: string;
  multiple: boolean;
  options: string[];
  required: boolean;
};

export type SampleLink = { column: string; relationId: string; targetList: string; label: string; many: boolean };

export type SampleListSpec = {
  list: string;
  typeId: string;
  label: string;
  count: number;
  kinds: string[];
  columns: SampleColumn[];
  links: SampleLink[];
  titleColumns: string[];
};

export type GeneratedSampleList = {
  list: string;
  typeId: string;
  table: SpreadsheetTable;
  mapping: SpreadsheetMapping;
  titles: string[];
};

export function sampleListSpecs(
  entries: Array<{ list: string; typeId: string; count: number; kinds: string[] }>,
  model: RecordModel,
  exclude: ReadonlySet<string> = new Set(),
): SampleListSpec[][] {
  const byType = new Map(entries.map((entry) => [entry.typeId, entry.list]));
  const specs = entries.flatMap((entry): SampleListSpec[] => {
    const type = model.types.find((candidate) => candidate.id === entry.typeId && !candidate.archived);
    if (!type || type.embedded || entry.count === 0) return [];
    const fields = model.fields
      .filter((field) => field.typeId === type.id && !exclude.has(field.id) && importableSpreadsheetField(field))
      .sort((left, right) => left.position - right.position)
      .slice(0, MAX_COLUMNS);
    const columns = fields.map((field, index) => ({
      column: `c${index + 1}`,
      fieldId: field.id,
      label: field.label,
      valueType: field.valueType,
      multiple: field.multiple ?? false,
      options: field.options.map((option) => option.label),
      required: field.required,
    }));
    const links = model.relationships.flatMap((relation, index): SampleLink[] => {
      const targetList = byType.get(relation.targetTypeId);
      if (relation.archived || relation.sourceTypeId !== type.id || !targetList || targetList === entry.list) return [];
      if (relation.id === type.parentRelationshipId) return [];
      return [
        {
          column: `r${index + 1}`,
          relationId: relation.id,
          targetList,
          label: relation.sourceLabel,
          many: relation.sourceCardinality === "many",
        },
      ];
    });
    const primary = columns.find((column) => column.fieldId === type.primaryFieldId);
    const texts = columns.filter((column) => column.valueType === "text" && !column.multiple);
    return [
      {
        list: entry.list,
        typeId: type.id,
        label: type.pluralLabel,
        count: Math.min(entry.count, SETUP_PLAN_LIMITS.sampleRecords),
        kinds: entry.kinds,
        columns,
        links,
        titleColumns: primary ? [primary.column] : texts.slice(0, 2).map((column) => column.column),
      },
    ];
  });
  const levels: SampleListSpec[][] = [];
  const placed = new Set<string>();
  let pending = specs;
  while (pending.length) {
    const ready = pending.filter((spec) => spec.links.every((link) => placed.has(link.targetList)));
    const level = ready.length
      ? ready
      : pending.map((spec) => ({ ...spec, links: spec.links.filter((link) => placed.has(link.targetList)) }));
    levels.push(level);
    for (const spec of level) placed.add(spec.list);
    pending = pending.filter((spec) => !placed.has(spec.list));
  }
  return levels;
}

export function sampleTitle(spec: SampleListSpec, row: Record<string, string | null>): string {
  return spec.titleColumns
    .map((column) => row[column]?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

export function generatedSampleList(
  spec: SampleListSpec,
  rows: Array<Record<string, string | null>>,
  titlesByList: ReadonlyMap<string, string[]>,
  currency: string,
): GeneratedSampleList {
  const headers = [...spec.columns.map((column) => column.column), ...spec.links.map((link) => link.column)];
  const kept = rows.slice(0, spec.count);
  const table: SpreadsheetTable = {
    sheetName: spec.list,
    headers,
    rows: kept.map((row, index) => ({
      rowNumber: index + 2,
      cells: headers.map((header) => {
        const link = spec.links.find((candidate) => candidate.column === header);
        const value = row[header]?.trim() || null;
        if (!link || !value) return value;
        const known = new Set(titlesByList.get(link.targetList) ?? []);
        const names = value
          .split(/[;\n]/)
          .map((name) => name.trim())
          .filter((name) => known.has(name));
        return (link.many ? names : names.slice(0, 1)).join(LINK_SEPARATOR) || null;
      }),
    })),
  };
  const mapping: SpreadsheetMapping = {
    typeId: spec.typeId,
    locale: "en",
    timeZone: "UTC",
    columns: spec.columns.map((column) => ({
      column: column.column,
      fieldId: column.fieldId,
      ...(column.valueType === "date" || column.valueType === "dateTime" ? { dateOrder: "ymd" as const } : {}),
      ...(column.valueType === "currency" ? { currency } : {}),
    })),
    relationships: spec.links.map((link) => ({ column: link.column, relationId: link.relationId })),
  };
  return { list: spec.list, typeId: spec.typeId, table, mapping, titles: kept.map((row) => sampleTitle(spec, row)) };
}

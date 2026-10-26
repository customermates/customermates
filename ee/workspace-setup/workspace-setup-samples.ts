import type { RecordModel } from "@/features/records/record-model.schema";
import type { SpreadsheetMapping, SpreadsheetTable } from "@/features/data-transfer/spreadsheet/spreadsheet.schema";

import { importableSpreadsheetField } from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { SETUP_PLAN_LIMITS } from "@/features/workspace-setup/setup-plan.schema";

const MAX_COLUMNS = 24;
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;
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

export type SampleLink = {
  column: string;
  relationId: string;
  targetList: string;
  label: string;
  many: boolean;
  unique: boolean;
};

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
          unique: relation.targetCardinality === "one",
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

function sampleTitle(spec: SampleListSpec, row: Record<string, string | null>): string {
  return spec.titleColumns
    .map((column) => row[column]?.trim() ?? "")
    .filter(Boolean)
    .join(" ");
}

function withDistinctTitles(spec: SampleListSpec, rows: Array<Record<string, string | null>>) {
  const column = spec.titleColumns.at(-1);
  if (!column) return rows;
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const title = sampleTitle(spec, row);
    const count = (seen.get(title) ?? 0) + 1;
    seen.set(title, count);
    if (!title || count === 1) return row;
    let suffix = count;
    while (seen.has(`${title} ${suffix}`)) suffix += 1;
    seen.set(`${title} ${suffix}`, 1);
    return { ...row, [column]: `${row[column]?.trim() ?? ""} ${suffix}` };
  });
}

export type SampleCalendarDates = { starts: ReadonlySet<string>; ends: ReadonlyMap<string, string>; today: Date };

function dayOf(value: string | null | undefined): number | null {
  const day = value?.trim().match(ISO_DAY)?.[0];
  const time = day ? Date.parse(`${day}T00:00:00Z`) : Number.NaN;
  return Number.isNaN(time) ? null : time;
}

function withDay(value: string, time: number): string {
  return value.trim().replace(ISO_DAY, new Date(time).toISOString().slice(0, 10));
}

function inCurrentMonth(
  spec: SampleListSpec,
  rows: Array<Record<string, string | null>>,
  dates: SampleCalendarDates,
): Array<Record<string, string | null>> {
  const year = dates.today.getUTCFullYear();
  const month = dates.today.getUTCMonth();
  const first = Date.UTC(year, month, 1);
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const columnOf = new Map(spec.columns.map((column) => [column.fieldId, column.column]));
  const pairs = [...dates.starts].flatMap((fieldId) => {
    const start = columnOf.get(fieldId);
    const endField = dates.ends.get(fieldId);
    return start ? [{ start, end: endField ? columnOf.get(endField) : undefined }] : [];
  });
  if (!pairs.length) return rows;
  return rows.map((row, index) => {
    const next = { ...row };
    const spread = new Set(pairs.map((pair) => pair.start));
    const ordered = pairs.map((pair, offset) => ({
      ...pair,
      offset,
      ended: Boolean(pair.end && spread.has(pair.end)),
    }));
    for (const { start, end, offset, ended } of ordered.sort(
      (left, right) => Number(left.ended) - Number(right.ended),
    )) {
      const from = dayOf(row[start]);
      const until = end ? dayOf(row[end]) : null;
      if (from === null) continue;
      const span = until === null ? 0 : Math.max(0, until - from);
      if (ended && end && until !== null) {
        next[start] = withDay(row[start] ?? "", (dayOf(next[end]) ?? until) - span);
        continue;
      }
      const day = first + (Math.floor(((index + 0.5) * days) / rows.length + offset) % days) * DAY_MS;
      next[start] = withDay(row[start] ?? "", day);
      if (end && until !== null) next[end] = withDay(row[end] ?? "", day + span);
    }
    return next;
  });
}

export function generatedSampleList(
  spec: SampleListSpec,
  rows: Array<Record<string, string | null>>,
  titlesByList: ReadonlyMap<string, string[]>,
  currency: string,
  dates: SampleCalendarDates = { starts: new Set(), ends: new Map(), today: new Date() },
): GeneratedSampleList {
  const headers = [...spec.columns.map((column) => column.column), ...spec.links.map((link) => link.column)];
  const kept = inCurrentMonth(spec, withDistinctTitles(spec, rows.slice(0, spec.count)), dates);
  const linked = new Map(spec.links.map((link) => [link.column, new Set<string>()]));
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
        const taken = linked.get(link.column) ?? new Set<string>();
        const names = [
          ...new Set(
            value
              .split(/[;\n]/)
              .map((name) => name.trim())
              .filter((name) => known.has(name) && !(link.unique && taken.has(name))),
          ),
        ].slice(0, link.many ? undefined : 1);
        for (const name of names) taken.add(name);
        return names.join(LINK_SEPARATOR) || null;
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

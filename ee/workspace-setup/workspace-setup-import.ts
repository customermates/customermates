import type { RecordModel } from "@/features/records/record-model.schema";
import type {
  SpreadsheetColumnProfile,
  SpreadsheetMapping,
  SpreadsheetTable,
} from "@/features/data-transfer/spreadsheet/spreadsheet.schema";

import {
  importableSpreadsheetField,
  spreadsheetChannelParts,
  spreadsheetMappingIssues,
  spreadsheetRelatedNames,
} from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";
import { looksLikePhone, normalizeEmail } from "@/features/data-transfer/spreadsheet/spreadsheet-values";

export type SetupLinkTargetImport = {
  typeId: string;
  table: SpreadsheetTable;
  mapping: SpreadsheetMapping;
};

export function usableSetupImportMapping(
  mapping: SpreadsheetMapping,
  sheet: { table: SpreadsheetTable; profile: readonly SpreadsheetColumnProfile[] },
  model: RecordModel,
): boolean {
  if (spreadsheetMappingIssues(sheet.table.headers, mapping, model).length) return false;
  const primaryId = model.types.find((type) => type.id === mapping.typeId)?.primaryFieldId;
  const primary = model.fields.find((field) => field.id === primaryId);
  if (!primary || !importableSpreadsheetField(primary)) return true;
  const column = mapping.columns.find((entry) => entry.fieldId === primary.id)?.column;
  return sheet.profile.some((entry) => entry.column === column && entry.filled > 0);
}

function channelKind(table: SpreadsheetTable, column: string): "email" | "phone" | null {
  const index = table.headers.indexOf(column);
  let filled = 0;
  let emails = 0;
  let phones = 0;
  for (const row of table.rows) {
    const parts = spreadsheetChannelParts(row.cells[index] ?? null);
    if (parts.length === 0) continue;
    filled += 1;
    if (!parts.every((part) => normalizeEmail(part) || looksLikePhone(part))) continue;
    if (parts.some((part) => normalizeEmail(part))) emails += 1;
    else phones += 1;
  }
  if ((emails + phones) * 2 <= filled) return null;
  return emails >= phones ? "email" : "phone";
}

export function settleSetupImportMapping(
  mapping: SpreadsheetMapping,
  table: SpreadsheetTable,
  model: RecordModel,
): SpreadsheetMapping {
  const parts = new Map<string, Set<string>>();
  for (const entry of mapping.columns)
    if (entry.namePart) parts.set(entry.column, new Set([...(parts.get(entry.column) ?? []), entry.namePart]));
  const kinds = new Map(table.headers.map((column) => [column, channelKind(table, column)]));
  const channels = model.fields.find(
    (field) => field.typeId === mapping.typeId && !field.archived && field.valueType === "channels",
  );
  const columns = mapping.columns.flatMap(({ namePart, ...entry }) => {
    if (entry.fieldId === channels?.id && !kinds.get(entry.column)) return [];
    return [namePart && parts.get(entry.column)?.size === 2 ? { ...entry, namePart } : entry];
  });
  if (!channels) return { ...mapping, columns };
  const used = new Set([...mapping.columns, ...mapping.relationships].map((entry) => entry.column));
  for (const kind of ["email", "phone"] as const) {
    if (columns.some((entry) => entry.fieldId === channels.id && kinds.get(entry.column) === kind)) continue;
    const column = table.headers.find((header) => kinds.get(header) === kind && !used.has(header));
    if (column) columns.push({ column, fieldId: channels.id });
  }
  return { ...mapping, columns };
}

export function setupLinkTargetImports(
  table: SpreadsheetTable,
  mapping: SpreadsheetMapping,
  model: RecordModel,
): { mapping: SpreadsheetMapping; targets: SetupLinkTargetImport[] } {
  const names = spreadsheetRelatedNames(table, mapping, model);
  const links = mapping.relationships.flatMap((entry) => {
    const relation = model.relationships.find((candidate) => candidate.id === entry.relationId);
    const target = relation && model.types.find((type) => type.id === relation.targetTypeId);
    if (!target?.primaryFieldId || target.id === mapping.typeId) return [];
    return [{ entry, target: target.id, primaryFieldId: target.primaryFieldId }];
  });
  const groups = new Map<string, { column: string; primaryFieldId: string; names: Set<string> }>();
  for (const { entry, target, primaryFieldId } of links) {
    const listed = names.get(entry.relationId) ?? [];
    if (listed.length === 0) continue;
    const group = groups.get(target) ?? { column: entry.column, primaryFieldId, names: new Set<string>() };
    for (const name of listed) group.names.add(name);
    groups.set(target, group);
  }
  const targets: SetupLinkTargetImport[] = [];
  const refused = new Set<string>();
  for (const [typeId, group] of groups) {
    const link: SetupLinkTargetImport = {
      typeId,
      table: {
        sheetName: table.sheetName,
        headers: [group.column],
        rows: [...group.names].map((name, index) => ({ rowNumber: index + 2, cells: [name] })),
      },
      mapping: {
        typeId,
        locale: mapping.locale,
        timeZone: mapping.timeZone,
        columns: [{ column: group.column, fieldId: group.primaryFieldId }],
        relationships: [],
      },
    };
    if (spreadsheetMappingIssues(link.table.headers, link.mapping, model).length) refused.add(typeId);
    else targets.push(link);
  }
  const relationships = links.filter(({ target }) => !refused.has(target)).map(({ entry }) => entry);
  return { mapping: { ...mapping, relationships }, targets };
}

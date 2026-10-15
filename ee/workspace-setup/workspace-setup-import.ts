import type { RecordModel } from "@/features/records/record-model.schema";
import type {
  SpreadsheetColumnProfile,
  SpreadsheetMapping,
  SpreadsheetTable,
} from "@/features/data-transfer/spreadsheet/spreadsheet.schema";

import {
  importableSpreadsheetField,
  spreadsheetMappingIssues,
  spreadsheetRelatedNames,
} from "@/features/data-transfer/spreadsheet/spreadsheet-conversion";

export type SetupLinkTargetImport = {
  relationId: string;
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

export function settleSetupImportMapping(
  mapping: SpreadsheetMapping,
  profile: readonly SpreadsheetColumnProfile[],
  model: RecordModel,
): SpreadsheetMapping {
  const parts = new Map<string, Set<string>>();
  for (const entry of mapping.columns)
    if (entry.namePart) parts.set(entry.column, new Set([...(parts.get(entry.column) ?? []), entry.namePart]));
  const emails = profile.filter((column) => column.inferredType === "email").map((column) => column.column);
  const channels = model.fields.find(
    (field) => field.typeId === mapping.typeId && !field.archived && field.valueType === "channels",
  );
  const columns = mapping.columns.flatMap(({ namePart, ...entry }) => {
    if (entry.fieldId === channels?.id && !emails.includes(entry.column)) return [];
    return [namePart && parts.get(entry.column)?.size === 2 ? { ...entry, namePart } : entry];
  });
  const email = emails.find((column) => mapping.columns.every((entry) => entry.column !== column));
  if (channels && email && !columns.some((entry) => entry.fieldId === channels.id))
    columns.push({ column: email, fieldId: channels.id });
  return { ...mapping, columns };
}

export function setupLinkTargetImports(
  table: SpreadsheetTable,
  mapping: SpreadsheetMapping,
  model: RecordModel,
): { mapping: SpreadsheetMapping; targets: SetupLinkTargetImport[] } {
  const names = spreadsheetRelatedNames(table, mapping, model);
  const targets: SetupLinkTargetImport[] = [];
  const relationships = mapping.relationships.filter((entry) => {
    const relation = model.relationships.find((candidate) => candidate.id === entry.relationId);
    const target = relation && model.types.find((type) => type.id === relation.targetTypeId);
    if (!target?.primaryFieldId || target.id === mapping.typeId) return false;
    const listed = names.get(entry.relationId) ?? [];
    if (listed.length === 0) return true;
    const link: SetupLinkTargetImport = {
      relationId: entry.relationId,
      typeId: target.id,
      table: {
        sheetName: table.sheetName,
        headers: [entry.column],
        rows: listed.map((name, index) => ({ rowNumber: index + 2, cells: [name] })),
      },
      mapping: {
        typeId: target.id,
        locale: mapping.locale,
        timeZone: mapping.timeZone,
        columns: [{ column: entry.column, fieldId: target.primaryFieldId }],
        relationships: [],
      },
    };
    if (spreadsheetMappingIssues(link.table.headers, link.mapping, model).length) return false;
    targets.push(link);
    return true;
  });
  return { mapping: { ...mapping, relationships }, targets };
}

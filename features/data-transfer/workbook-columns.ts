import type { CustomFieldValueDto } from "@/core/base/base-entity.schema";
import type { CustomColumnDto } from "@/features/custom-column/custom-column.schema";
import type { WorkbookCellValue } from "./workbook-cell";

import { CustomColumnType } from "@/generated/prisma";

export const RANGE_SEPARATOR = " / ";

export const STORED_MULTI_VALUE_SEPARATOR = ",";

export const RECORD_ID_COLUMN_KEY = "__recordId";

export const RECORD_ID_COLUMN_HEADER = "ID";

export type RequestedColumn = { key: string; header: string };

export type ExportColumn = {
  key: string;
  header: string;
  hidden: boolean;
  customColumn?: CustomColumnDto;
};

export type SchemaSheetRow = {
  position: number;
  header: string;
  key: string;
  customColumnId: string;
  customColumnType: string;
  optionValues: string;
  optionLabels: string;
};

export function buildExportColumns(requested: RequestedColumn[], customColumns: CustomColumnDto[]): ExportColumn[] {
  const byId = new Map(customColumns.map((column) => [column.id, column]));

  const idColumn: ExportColumn = { key: RECORD_ID_COLUMN_KEY, header: RECORD_ID_COLUMN_HEADER, hidden: true };

  const requestedColumns = requested.map<ExportColumn>((column) => ({
    key: column.key,
    header: column.header,
    hidden: false,
    customColumn: byId.get(column.key),
  }));

  return [idColumn, ...requestedColumns];
}

export function buildSchemaSheetRows(columns: ExportColumn[]): SchemaSheetRow[] {
  return columns.map((column, index) => {
    const definition = column.customColumn;
    const options = definition?.type === CustomColumnType.singleSelect ? definition.options.options : [];

    return {
      position: index + 1,
      header: column.header,
      key: column.key,
      customColumnId: definition?.id ?? "",
      customColumnType: definition?.type ?? "",
      optionValues: options.map((option) => option.value).join(STORED_MULTI_VALUE_SEPARATOR),
      optionLabels: options.map((option) => option.label).join(STORED_MULTI_VALUE_SEPARATOR),
    };
  });
}

function parseDate(raw: string): Date | null {
  const parsed = new Date(raw);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatStoredRange(raw: string): string | null {
  const [startRaw, endRaw] = raw.split(STORED_MULTI_VALUE_SEPARATOR).map((part) => part.trim());
  if (!startRaw || !endRaw) return null;

  const start = parseDate(startRaw);
  const end = parseDate(endRaw);
  if (!start || !end) return null;

  return `${start.toISOString()}${RANGE_SEPARATOR}${end.toISOString()}`;
}

export function resolveCustomFieldCell(column: CustomColumnDto, values: CustomFieldValueDto[]): WorkbookCellValue {
  const stored = values.find((value) => value.columnId === column.id)?.value;
  if (stored === undefined || stored === null || stored === "") return null;

  switch (column.type) {
    case CustomColumnType.singleSelect: {
      const option = column.options.options.find((candidate) => candidate.value === stored);
      return option ? option.label : null;
    }

    case CustomColumnType.currency: {
      const numeric = Number(stored);
      return isNaN(numeric) ? null : numeric;
    }

    case CustomColumnType.date:
    case CustomColumnType.dateTime:
      return parseDate(stored);

    case CustomColumnType.dateRange:
    case CustomColumnType.dateTimeRange:
      return formatStoredRange(stored);

    default:
      return stored;
  }
}

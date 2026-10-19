import type {
  SpreadsheetCell,
  SpreadsheetColumnProfile,
  SpreadsheetDateOrder,
  SpreadsheetInferredType,
  SpreadsheetLocale,
  SpreadsheetPreview,
  SpreadsheetTable,
} from "./spreadsheet.schema";

import {
  SPREADSHEET_MAX_DISTINCT_VALUES,
  SPREADSHEET_SAMPLE_CELL_LENGTH,
  SPREADSHEET_SAMPLE_ROWS,
} from "./spreadsheet.schema";
import {
  cellIsEmpty,
  cellText,
  dateTextHasTime,
  defaultDateOrder,
  looksLikePhone,
  normalizeEmail,
  normalizeUrl,
  parseDateText,
  parseDateTimeText,
  parseSpreadsheetBoolean,
  parseSpreadsheetCurrency,
  parseSpreadsheetNumber,
  splitListValues,
} from "./spreadsheet-values";

const CONTACT_SEPARATORS = /[\n;,]/;
const SELECT_MIN_FILLED = 4;
const SELECT_MAX_LENGTH = 60;
const DATE_ORDERS: SpreadsheetDateOrder[] = ["dmy", "mdy", "ymd"];

function truncate(text: string): string {
  return text.length > SPREADSHEET_SAMPLE_CELL_LENGTH ? `${text.slice(0, SPREADSHEET_SAMPLE_CELL_LENGTH)}…` : text;
}

export function spreadsheetPreview(table: SpreadsheetTable, sampleRows = SPREADSHEET_SAMPLE_ROWS): SpreadsheetPreview {
  return {
    sheetName: table.sheetName,
    headers: table.headers,
    rowCount: table.rows.length,
    sample: table.rows.slice(0, sampleRows).map((row) => ({
      rowNumber: row.rowNumber,
      cells: row.cells.map((cell) => (cellIsEmpty(cell) ? null : truncate(cellText(cell)))),
    })),
  };
}

function every(values: SpreadsheetCell[], test: (cell: SpreadsheetCell) => boolean): boolean {
  return values.length > 0 && values.every(test);
}

function contactValues(cell: SpreadsheetCell): string[] {
  return typeof cell === "string" ? splitListValues(cell, CONTACT_SEPARATORS) : [];
}

function dateOrderFor(values: SpreadsheetCell[], locale: SpreadsheetLocale): SpreadsheetDateOrder | null {
  if (!values.every((cell) => typeof cell === "string")) return null;
  const texts = values.map((cell) => cellText(cell).split(/[T\s,]/)[0]);
  const preferred = defaultDateOrder(locale);
  const orders: SpreadsheetDateOrder[] = [preferred, ...DATE_ORDERS.filter((order) => order !== preferred)];
  return orders.find((order) => texts.every((text) => parseDateText(text, locale, order) !== null)) ?? null;
}

function inferType(
  values: SpreadsheetCell[],
  locale: SpreadsheetLocale,
  distinctCount: number,
  maxLength: number,
): { type: SpreadsheetInferredType | null; dateOrder: SpreadsheetDateOrder | null; currencies: string[] } {
  const none = { dateOrder: null, currencies: [] };
  if (!values.length) return { type: null, ...none };
  const numeric = every(values, (cell) => parseSpreadsheetNumber(cell, locale) !== null);
  if (
    every(values, (cell) => parseSpreadsheetBoolean(cell) !== null) &&
    !every(values, (cell) => typeof cell === "number" || /^\d+$/.test(cellText(cell)))
  )
    return { type: "boolean", ...none };
  if (every(values, (cell) => contactValues(cell).length > 0 && contactValues(cell).every((v) => normalizeEmail(v))))
    return { type: "email", ...none };
  if (
    every(
      values,
      (cell) => contactValues(cell).length > 0 && contactValues(cell).every((v) => !v.includes("@") && normalizeUrl(v)),
    ) &&
    !numeric
  )
    return { type: "url", ...none };
  const dateOrder = dateOrderFor(values, locale);
  if (dateOrder) {
    const texts = values.map(cellText);
    if (texts.every((text) => parseDateText(text, locale, dateOrder) !== null))
      return { type: "date", ...none, dateOrder };
    if (
      texts.some(dateTextHasTime) &&
      texts.every((text) => parseDateTimeText(text, locale, "UTC", dateOrder) !== null)
    )
      return { type: "dateTime", currencies: [], dateOrder };
  }
  if (every(values, (cell) => typeof cell === "string" && looksLikePhone(cell))) return { type: "phone", ...none };
  const currencies = values.map((cell) => parseSpreadsheetCurrency(cell, locale));
  if (currencies.every(Boolean) && currencies.some((value) => value?.currency)) {
    return {
      type: "currency",
      dateOrder: null,
      currencies: [...new Set(currencies.flatMap((value) => (value?.currency ? [value.currency] : [])))].sort(),
    };
  }
  if (numeric) return { type: "number", ...none };
  if (
    values.length >= SELECT_MIN_FILLED &&
    distinctCount <= SPREADSHEET_MAX_DISTINCT_VALUES &&
    distinctCount * 2 <= values.length &&
    maxLength <= SELECT_MAX_LENGTH
  )
    return { type: "select", ...none };
  return { type: "text", ...none };
}

export function profileSpreadsheet(table: SpreadsheetTable, locale: SpreadsheetLocale): SpreadsheetColumnProfile[] {
  return table.headers.map((column, index) => {
    const values = table.rows.map((row) => row.cells[index] ?? null).filter((cell) => !cellIsEmpty(cell));
    const counts = new Map<string, number>();
    let maxLength = 0;
    for (const cell of values) {
      const text = cellText(cell);
      maxLength = Math.max(maxLength, text.length);
      counts.set(text, (counts.get(text) ?? 0) + 1);
    }
    const inferred = inferType(values, locale, counts.size, maxLength);
    const dateLike = inferred.type === "date" || inferred.type === "dateTime";
    return {
      column,
      inferredType: inferred.type,
      filled: values.length,
      fillRate: table.rows.length ? Math.round((values.length / table.rows.length) * 1000) / 1000 : 0,
      distinctCount: counts.size,
      distinctValues:
        counts.size <= SPREADSHEET_MAX_DISTINCT_VALUES
          ? [...counts.entries()]
              .sort((left, right) => right[1] - left[1] || (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0))
              .map(([value, count]) => ({ value: truncate(value), count }))
          : null,
      maxLength,
      dateOrder: dateLike ? inferred.dateOrder : null,
      currencies: inferred.currencies,
      multipleValues:
        (inferred.type === "email" || inferred.type === "url") && values.some((cell) => contactValues(cell).length > 1),
    };
  });
}

import type { RecordFilePreview } from "./record-file-preview.schema";
import type { recordFilePreviewFormat } from "./record-file-preview.schema";
import type { RecordFileParserLimits } from "@/features/record-file-index/record-file-parser";

import { parseRecordFile } from "@/features/record-file-index/record-file-parser";
import {
  decodedRecordFileText,
  prettyRecordFileJson,
  RECORD_FILE_ZIP_MAX_ENTRIES,
  RECORD_FILE_ZIP_MAX_UNPACKED_BYTES,
} from "@/features/record-file-index/record-file-text";
import { checkRecordFileZip } from "@/features/record-file-index/record-file-zip";
import { codePointBoundary } from "@/core/retrieval/retrieval-sections";
import { xlsxCellText, xlsxCellValue } from "@/features/data-transfer/import/xlsx/xlsx-workbook";
import { readCsvRows } from "@/features/data-transfer/spreadsheet/spreadsheet-csv";

export const RECORD_FILE_PREVIEW_MAX_CHARS = 100_000;
export const RECORD_FILE_PREVIEW_MAX_ROWS = 200;
export const RECORD_FILE_PREVIEW_MAX_COLUMNS = 50;
const MAX_CELL_CHARS = 2_000;
const LIMITS: RecordFileParserLimits = {
  timeoutMs: 15_000,
  heapMb: 512,
  maxChars: RECORD_FILE_PREVIEW_MAX_CHARS,
  maxHtmlChars: 1_000_000,
  maxPages: 1,
  maxRows: RECORD_FILE_PREVIEW_MAX_ROWS,
  maxColumns: RECORD_FILE_PREVIEW_MAX_COLUMNS,
  maxSheets: 10,
  maxCellChars: MAX_CELL_CHARS,
};
type Format = NonNullable<ReturnType<typeof recordFilePreviewFormat>>;
type Sheet = Extract<RecordFilePreview, { kind: "sheets" }>["sheets"][number];

function clipped(text: string, length: number) {
  return text.slice(0, codePointBoundary(text, length));
}

function sheetsPreview(input: Sheet[], truncated: boolean): RecordFilePreview {
  let remaining = RECORD_FILE_PREVIEW_MAX_CHARS;
  const sheets: Sheet[] = [];
  for (const sheet of input) {
    const rows: Sheet["rows"] = [];
    for (const row of sheet.rows) {
      if (remaining <= 0) {
        truncated = true;
        break;
      }
      const cells = row.cells.slice(0, RECORD_FILE_PREVIEW_MAX_COLUMNS).map((cell) => {
        const text = clipped(cell, Math.min(MAX_CELL_CHARS, remaining));
        if (text.length < cell.length) truncated = true;
        remaining -= text.length;
        return text;
      });
      if (row.cells.length > RECORD_FILE_PREVIEW_MAX_COLUMNS) truncated = true;
      rows.push({ number: row.number, cells });
    }
    sheets.push({ name: sheet.name, rows });
  }
  return sheets.some((sheet) => sheet.rows.some((row) => row.cells.some(Boolean)))
    ? { kind: "sheets", sheets, truncated }
    : { kind: "unavailable", reason: "empty" };
}

export async function createRecordFilePreview(bytes: Uint8Array, format: Format): Promise<RecordFilePreview> {
  if (format === "csv") {
    const csv = readCsvRows(bytes, RECORD_FILE_PREVIEW_MAX_ROWS);
    return csv
      ? sheetsPreview(
          [{ name: "CSV", rows: csv.rows.map((row) => ({ number: row.rowNumber, cells: row.cells })) }],
          csv.truncated,
        )
      : { kind: "unavailable", reason: "unreadable" };
  }
  if (format === "docx" || format === "xlsx") {
    const zip = await checkRecordFileZip(bytes, {
      maxEntries: RECORD_FILE_ZIP_MAX_ENTRIES,
      maxUnpackedBytes: RECORD_FILE_ZIP_MAX_UNPACKED_BYTES,
    });
    if (zip !== "ok") return { kind: "unavailable", reason: zip === "tooLarge" ? "tooLarge" : "unreadable" };
    try {
      const parsed = await parseRecordFile(bytes, format, LIMITS);
      if (parsed.kind === "sheets") {
        return sheetsPreview(
          parsed.sheets.map((sheet) => ({
            name: sheet.name,
            rows: sheet.rows.map((row, index) => ({
              number: sheet.rowNumbers?.[index] ?? index + 1,
              cells: Array.from(row, (cell) => xlsxCellText(xlsxCellValue(cell))),
            })),
          })),
          parsed.truncated,
        );
      }
      if (parsed.kind === "text") {
        const text = clipped(parsed.text, RECORD_FILE_PREVIEW_MAX_CHARS);
        return text.trim()
          ? { kind: "text", format: "docx", text, truncated: parsed.truncated || text.length < parsed.text.length }
          : { kind: "unavailable", reason: "empty" };
      }
      return { kind: "unavailable", reason: parsed.kind === "tooLarge" ? "tooLarge" : "unreadable" };
    } catch {
      return { kind: "unavailable", reason: "unreadable" };
    }
  }
  const decoded = decodedRecordFileText(bytes, RECORD_FILE_PREVIEW_MAX_CHARS);
  if (decoded.text.includes("\u0000")) return { kind: "unavailable", reason: "unreadable" };
  const full = format === "json" && !decoded.truncated ? prettyRecordFileJson(decoded.text) : decoded.text;
  const text = clipped(full, RECORD_FILE_PREVIEW_MAX_CHARS);
  const truncated = decoded.truncated || text.length < full.length;
  return text.trim() ? { kind: "text", format, text, truncated } : { kind: "unavailable", reason: "empty" };
}

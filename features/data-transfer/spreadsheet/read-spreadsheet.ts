import type { SpreadsheetReadResult } from "./spreadsheet.schema";

import { SPREADSHEET_MAX_FILE_BYTES, SPREADSHEET_MAX_ROWS, SPREADSHEET_MAX_UNPACKED_BYTES } from "./spreadsheet.schema";
import { buildSpreadsheetTable } from "./spreadsheet-table";
import { readCsvRows } from "./spreadsheet-csv";
import { hasMacros, inspectZip, isLegacyWorkbook, isZipArchive, readXlsxRows } from "./spreadsheet-xlsx";

const MACRO_EXTENSIONS = /\.(xlsm|xltm|xlam|xlsb)$/i;
const LEGACY_EXTENSIONS = /\.(xls|ods|numbers)$/i;

export async function readSpreadsheet(
  bytes: Uint8Array,
  options: { fileName?: string; sheetName?: string } = {},
): Promise<SpreadsheetReadResult> {
  if (bytes.byteLength > SPREADSHEET_MAX_FILE_BYTES) return { ok: false, code: "fileTooLarge" };
  if (options.fileName && MACRO_EXTENSIONS.test(options.fileName)) return { ok: false, code: "macroWorkbook" };
  if (isLegacyWorkbook(bytes) || (options.fileName && LEGACY_EXTENSIONS.test(options.fileName)))
    return { ok: false, code: "unsupportedFormat" };
  if (isZipArchive(bytes)) {
    const inventory = inspectZip(bytes);
    if (!inventory) return { ok: false, code: "unreadableFile" };
    if (hasMacros(inventory)) return { ok: false, code: "macroWorkbook" };
    if (inventory.unpackedBytes > SPREADSHEET_MAX_UNPACKED_BYTES) return { ok: false, code: "fileTooLarge" };
    if (!inventory.entries.some((name) => name.startsWith("xl/"))) return { ok: false, code: "unsupportedFormat" };
    const workbook = await readXlsxRows(bytes, options.sheetName);
    if (!workbook.ok) return workbook;
    if (workbook.truncated) return { ok: false, code: "tooManyRows" };
    if (workbook.tooWide) return { ok: false, code: "tooManyColumns" };
    const built = buildSpreadsheetTable(workbook.sheetName, workbook.rows);
    if (!built.ok) return built;
    return {
      ok: true,
      format: "xlsx",
      sheetNames: workbook.sheetNames,
      table: built.table,
      formulaCellsWithoutValue: workbook.formulaCellsWithoutValue,
    };
  }
  const csv = readCsvRows(bytes, SPREADSHEET_MAX_ROWS * 10);
  if (!csv) return { ok: false, code: "unsupportedFormat" };
  if (csv.truncated) return { ok: false, code: "tooManyRows" };
  const sheetName = (options.fileName ?? "").replace(/\.[^.]+$/, "") || "Sheet";
  const built = buildSpreadsheetTable(sheetName, csv.rows);
  if (!built.ok) return built;
  return {
    ok: true,
    format: "csv",
    sheetNames: [built.table.sheetName],
    table: built.table,
    formulaCellsWithoutValue: 0,
  };
}

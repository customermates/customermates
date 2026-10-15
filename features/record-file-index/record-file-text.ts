import type { RecordFileParsed, RecordFileParserLimits, RecordFileSheet } from "./record-file-parser";

import { xlsxCellText, xlsxCellValue } from "@/features/data-transfer/import/xlsx/xlsx-workbook";
import { wikiCodePointBoundary } from "@/features/wiki/wiki-page-chunk";

import { parseRecordFile } from "./record-file-parser";
import { checkRecordFileZip } from "./record-file-zip";

export const RECORD_FILE_TEXT_MAX_BYTES = 25 * 1024 * 1024;
export const RECORD_FILE_TEXT_MAX_CHARS = 500_000;
export const RECORD_FILE_TEXT_TIMEOUT_MS = 60_000;
export const RECORD_FILE_PDF_MAX_PAGES = 1_000;
export const RECORD_FILE_ZIP_MAX_ENTRIES = 10_000;
export const RECORD_FILE_ZIP_MAX_UNPACKED_BYTES = 128 * 1024 * 1024;
export const RECORD_FILE_PARSER_HEAP_MB = 512;

const HTML_MAX_CHARS = 5_000_000;
const UTF8_MAX_BYTES_PER_CHAR = 4;
const RAW_TEXT_MAX_CHARS = RECORD_FILE_TEXT_MAX_CHARS * UTF8_MAX_BYTES_PER_CHAR;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

export type RecordFileTextFormat = "pdf" | "docx" | "xlsx" | "html" | "json" | "csv" | "markdown" | "text";

export type RecordFileText =
  | { status: "done"; text: string; truncated: boolean }
  | { status: "noText" | "failed" | "skipped" };

export type RecordFileTextLimits = Pick<RecordFileParserLimits, "timeoutMs" | "heapMb" | "maxPages">;

const FORMAT_BY_MIME_TYPE: Record<string, RecordFileTextFormat> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/html": "html",
  "application/xhtml+xml": "html",
  "application/json": "json",
  "text/csv": "csv",
  "application/csv": "csv",
  "text/tab-separated-values": "csv",
  "text/markdown": "markdown",
  "text/x-markdown": "markdown",
  "text/plain": "text",
};

const FORMAT_BY_EXTENSION: Record<string, RecordFileTextFormat> = {
  pdf: "pdf",
  docx: "docx",
  xlsx: "xlsx",
  html: "html",
  htm: "html",
  json: "json",
  csv: "csv",
  tsv: "csv",
  md: "markdown",
  markdown: "markdown",
  txt: "text",
};

const DEFAULT_LIMITS: RecordFileTextLimits = {
  timeoutMs: RECORD_FILE_TEXT_TIMEOUT_MS,
  heapMb: RECORD_FILE_PARSER_HEAP_MB,
  maxPages: RECORD_FILE_PDF_MAX_PAGES,
};

export function recordFileTextFormat(mimeType: string, name: string): RecordFileTextFormat | null {
  const type = mimeType.split(";")[0].trim().toLowerCase();
  const known = FORMAT_BY_MIME_TYPE[type] ?? (type.endsWith("+json") ? "json" : undefined);
  if (known) return known;
  const extension = /\.([a-z0-9]+)$/iu.exec(name.trim())?.[1]?.toLowerCase();
  return extension ? (FORMAT_BY_EXTENSION[extension] ?? null) : null;
}

function cleanText(text: string): string {
  return text
    .replace(/\r\n?/gu, "\n")
    .replace(CONTROL_CHARACTERS, "")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function capped(text: string, truncated = false): RecordFileText {
  const raw = text.length > RAW_TEXT_MAX_CHARS ? text.slice(0, wikiCodePointBoundary(text, RAW_TEXT_MAX_CHARS)) : text;
  const clean = cleanText(raw);
  if (!clean) return { status: "noText" };
  if (clean.length <= RECORD_FILE_TEXT_MAX_CHARS)
    return { status: "done", text: clean, truncated: truncated || raw.length < text.length };
  return {
    status: "done",
    text: clean.slice(0, wikiCodePointBoundary(clean, RECORD_FILE_TEXT_MAX_CHARS)).trimEnd(),
    truncated: true,
  };
}

function decodedText(bytes: Uint8Array, maxChars: number): { text: string; truncated: boolean } {
  const limit = maxChars * UTF8_MAX_BYTES_PER_CHAR;
  const text = new TextDecoder("utf-8").decode(bytes.subarray(0, limit)).replace(/^﻿/u, "");
  return { text, truncated: bytes.byteLength > limit };
}

function pagesText(pages: string[], numbered: boolean, truncated: boolean): RecordFileText {
  const clean = pages.map((page) => cleanText(page));
  if (!numbered) return capped(clean[0] ?? "", truncated);
  return capped(
    clean.flatMap((page, index) => (page ? [`## Page ${index + 1}\n\n${page}`] : [])).join("\n\n"),
    truncated,
  );
}

function rowText(row: unknown[]): string {
  const cells = Array.from(row, (value) => xlsxCellText(xlsxCellValue(value)).replace(/\s+/gu, " "));
  let end = cells.length;
  while (end > 0 && !cells[end - 1]) end -= 1;
  return cells.slice(0, end).join("\t");
}

function sheetsText(sheets: RecordFileSheet[], cut: boolean): RecordFileText {
  const parts: string[] = [];
  let length = 0;
  let truncated = false;
  for (const sheet of sheets) {
    const rows: string[] = [];
    for (const row of sheet.rows) {
      const line = rowText(row);
      if (!line.trim()) continue;
      rows.push(line);
      length += line.length + 1;
      truncated = length > RECORD_FILE_TEXT_MAX_CHARS;
      if (truncated) break;
    }
    if (rows.length) parts.push(`## ${sheet.name}\n\n${rows.join("\n")}`);
    if (truncated) break;
  }
  return capped(parts.join("\n\n"), truncated || cut);
}

function parsedText(parsed: RecordFileParsed): RecordFileText {
  if (parsed.kind === "invalid") return { status: "failed" };
  if (parsed.kind === "tooLarge") return { status: "skipped" };
  if (parsed.kind === "pages") return pagesText(parsed.pages, parsed.numbered, parsed.truncated);
  if (parsed.kind === "sheets") return sheetsText(parsed.sheets, parsed.truncated);
  return capped(parsed.text, parsed.truncated);
}

function jsonText(bytes: Uint8Array): RecordFileText {
  const { text, truncated } = decodedText(bytes, RECORD_FILE_TEXT_MAX_CHARS);
  if (truncated || text.length > RECORD_FILE_TEXT_MAX_CHARS) return capped(text, true);
  try {
    return capped(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    return capped(text);
  }
}

function plainText(bytes: Uint8Array): RecordFileText {
  const { text, truncated } = decodedText(bytes, RECORD_FILE_TEXT_MAX_CHARS);
  return capped(text, truncated);
}

export async function extractRecordFileText(
  bytes: Uint8Array,
  format: RecordFileTextFormat,
  limits: RecordFileTextLimits = DEFAULT_LIMITS,
): Promise<RecordFileText> {
  if (format === "json") return jsonText(bytes);
  if (format === "csv" || format === "markdown" || format === "text") return plainText(bytes);
  if (format === "docx" || format === "xlsx") {
    const zip = checkRecordFileZip(bytes, {
      maxEntries: RECORD_FILE_ZIP_MAX_ENTRIES,
      maxUnpackedBytes: RECORD_FILE_ZIP_MAX_UNPACKED_BYTES,
    });
    if (zip === "tooLarge") return { status: "skipped" };
    if (zip === "invalid") return { status: "failed" };
  }
  return parsedText(
    await parseRecordFile(bytes, format, {
      ...limits,
      maxChars: RECORD_FILE_TEXT_MAX_CHARS,
      maxHtmlChars: HTML_MAX_CHARS,
    }),
  );
}

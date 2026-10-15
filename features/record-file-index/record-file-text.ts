import type { Workbook } from "exceljs";
import type { FormatCallback } from "html-to-text";

import { xlsxCellText, xlsxCellValue } from "@/features/data-transfer/import/xlsx/xlsx-workbook";
import { wikiCodePointBoundary } from "@/features/wiki/wiki-page-chunk";

export const RECORD_FILE_TEXT_MAX_BYTES = 25 * 1024 * 1024;
export const RECORD_FILE_TEXT_MAX_CHARS = 500_000;
export const RECORD_FILE_TEXT_TIMEOUT_MS = 60_000;

const HTML_MAX_CHARS = 5_000_000;
const UTF8_MAX_BYTES_PER_CHAR = 4;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu;

export type RecordFileTextFormat = "pdf" | "docx" | "xlsx" | "html" | "json" | "csv" | "markdown" | "text";

export type RecordFileText = { status: "done"; text: string; truncated: boolean } | { status: "noText" };

type ExcelModule = { Workbook: typeof Workbook; default?: { Workbook: typeof Workbook } };

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
    .replace(/[^\S\n]+$/gmu, "")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function capped(text: string, truncated = false): RecordFileText {
  const clean = cleanText(text);
  if (!clean) return { status: "noText" };
  if (clean.length <= RECORD_FILE_TEXT_MAX_CHARS) return { status: "done", text: clean, truncated };
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

const markdownHeading =
  (level: number): FormatCallback =>
  (element, walk, builder) => {
    builder.openBlock({ leadingLineBreaks: 2 });
    builder.addLiteral(`${"#".repeat(level)} `);
    walk(element.children ?? [], builder);
    builder.closeBlock({ trailingLineBreaks: 2 });
  };

async function htmlText(html: string, truncated: boolean): Promise<RecordFileText> {
  const { compile } = await import("html-to-text");
  const levels = [1, 2, 3, 4, 5, 6];
  const convert = compile({
    wordwrap: false,
    limits: { maxInputLength: HTML_MAX_CHARS, ellipsis: "" },
    formatters: Object.fromEntries(levels.map((level) => [`heading${level}`, markdownHeading(level)])),
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      ...["img", "script", "style", "head", "title", "noscript", "template", "svg"].map((selector) => ({
        selector,
        format: "skip",
      })),
      ...levels.map((level) => ({ selector: `h${level}`, format: `heading${level}` })),
      { selector: "table", format: "dataTable", options: { uppercaseHeaderCells: false, maxColumnWidth: 120 } },
    ],
  });
  return capped(convert(html), truncated || html.length > HTML_MAX_CHARS);
}

async function pdfText(bytes: Uint8Array): Promise<RecordFileText> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes.slice(), { verbosity: 0 });
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    const pages = text.map((page) => cleanText(page));
    if (pages.length <= 1) return capped(pages[0] ?? "");
    return capped(pages.flatMap((page, index) => (page ? [`## Page ${index + 1}\n\n${page}`] : [])).join("\n\n"));
  } finally {
    await pdf.loadingTask.destroy();
  }
}

async function docxText(bytes: Uint8Array): Promise<RecordFileText> {
  const mammoth = (await import("mammoth")).default;
  const result = await mammoth.convertToHtml(
    { buffer: Buffer.from(bytes) },
    {
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
    },
  );
  return htmlText(result.value, false);
}

async function xlsxText(bytes: Uint8Array): Promise<RecordFileText> {
  const exceljs = (await import("exceljs")) as unknown as ExcelModule;
  const workbook = new (exceljs.default?.Workbook ?? exceljs.Workbook)();
  await workbook.xlsx.load(bytes.slice().buffer);
  const parts: string[] = [];
  let length = 0;
  let truncated = false;
  for (const sheet of workbook.worksheets) {
    const rows: string[] = [];
    for (let index = 1; index <= sheet.rowCount && !truncated; index += 1) {
      const values = sheet.getRow(index).values;
      const cells = (Array.isArray(values) ? values.slice(1) : []).map((value: unknown) =>
        xlsxCellText(xlsxCellValue(value)).replace(/\s+/gu, " "),
      );
      const line = cells.join("\t").replace(/\t+$/u, "");
      if (!line.trim()) continue;
      rows.push(line);
      length += line.length + 1;
      truncated = length > RECORD_FILE_TEXT_MAX_CHARS;
    }
    if (rows.length) parts.push(`## ${sheet.name}\n\n${rows.join("\n")}`);
    if (truncated) break;
  }
  return capped(parts.join("\n\n"), truncated);
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

function extract(bytes: Uint8Array, format: RecordFileTextFormat): Promise<RecordFileText> {
  if (format === "pdf") return pdfText(bytes);
  if (format === "docx") return docxText(bytes);
  if (format === "xlsx") return xlsxText(bytes);
  if (format === "html") {
    const { text, truncated } = decodedText(bytes, HTML_MAX_CHARS);
    return htmlText(text, truncated);
  }
  if (format === "json") return Promise.resolve(jsonText(bytes));
  return Promise.resolve(plainText(bytes));
}

export async function extractRecordFileText(
  bytes: Uint8Array,
  format: RecordFileTextFormat,
  timeoutMs = RECORD_FILE_TEXT_TIMEOUT_MS,
): Promise<RecordFileText> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Text extraction took longer than ${timeoutMs} ms`)), timeoutMs);
  });
  try {
    return await Promise.race([extract(bytes, format), timeout]);
  } finally {
    clearTimeout(timer);
  }
}

import type { RecordFileParserFormat } from "./record-file-parser-packages";

import { join } from "node:path";
import { Worker } from "node:worker_threads";

import { RECORD_FILE_PARSER_PACKAGES } from "./record-file-parser-packages";

export type RecordFileParserLimits = {
  timeoutMs: number;
  heapMb: number;
  maxPages: number;
  maxChars: number;
  maxHtmlChars: number;
};

export type RecordFileSheet = { name: string; rows: unknown[][] };

export type RecordFileParsed =
  | { kind: "pages"; pages: string[]; numbered: boolean; truncated: boolean }
  | { kind: "text"; text: string; truncated: boolean }
  | { kind: "sheets"; sheets: RecordFileSheet[]; truncated: boolean }
  | { kind: "invalid" }
  | { kind: "tooLarge" };

export const RECORD_FILE_PARSER_MAX_WORKERS = 2;

const PARSER_SOURCE = `(async () => {
  const { workerData, parentPort } = await import("node:worker_threads");
  const { createRequire } = await import("node:module");
  const load = createRequire(workerData.base);
  const modules = Object.fromEntries(workerData.packages.map((name) => [name, load(name)]));
  const limits = workerData.limits;
  const bytes = new Uint8Array(workerData.bytes);
  const headingLevels = [1, 2, 3, 4, 5, 6];
  const markdownHeading = (level) => (element, walk, builder) => {
    builder.openBlock({ leadingLineBreaks: 2 });
    builder.addLiteral("#".repeat(level) + " ");
    walk(element.children || [], builder);
    builder.closeBlock({ trailingLineBreaks: 2 });
  };
  const htmlText = (html, truncated) => {
    const convert = modules["html-to-text"].compile({
      wordwrap: false,
      limits: { maxInputLength: limits.maxHtmlChars, ellipsis: "" },
      formatters: Object.fromEntries(headingLevels.map((level) => ["heading" + level, markdownHeading(level)])),
      selectors: [
        { selector: "a", options: { ignoreHref: true } },
        ...["img", "script", "style", "head", "title", "noscript", "template", "svg"].map((selector) => ({
          selector,
          format: "skip",
        })),
        ...headingLevels.map((level) => ({ selector: "h" + level, format: "heading" + level })),
        { selector: "table", format: "dataTable", options: { uppercaseHeaderCells: false, maxColumnWidth: 120 } },
      ],
    });
    return { kind: "text", text: convert(html), truncated: truncated || html.length > limits.maxHtmlChars };
  };
  const cellValue = (value) => {
    if (value === null || value === undefined || typeof value !== "object" || value instanceof Date) return value;
    if ("error" in value) return { error: true };
    if ("result" in value) return { result: cellValue(value.result) };
    if ("text" in value && "hyperlink" in value) return { text: cellValue(value.text), hyperlink: "" };
    if (Array.isArray(value.richText))
      return { richText: value.richText.map((run) => ({ text: typeof run?.text === "string" ? run.text : "" })) };
    return null;
  };
  const cellLength = (value) => {
    if (value === null || value === undefined) return 0;
    if (typeof value === "string") return value.length;
    if (typeof value === "number" || typeof value === "boolean") return String(value).length;
    if (value instanceof Date) return 24;
    if (typeof value !== "object" || "error" in value) return 0;
    if ("result" in value) return cellLength(value.result);
    if ("text" in value) return cellLength(value.text);
    if (Array.isArray(value.richText))
      return value.richText.reduce((total, run) => total + (typeof run?.text === "string" ? run.text.length : 0), 0);
    return 0;
  };
  const parsers = {
    async pdf() {
      const { getDocumentProxy } = modules.unpdf;
      const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
      try {
        const count = Math.min(pdf.numPages, limits.maxPages);
        const pages = [];
        let chars = 0;
        for (let number = 1; number <= count && chars <= limits.maxChars; number += 1) {
          const page = await pdf.getPage(number);
          const content = await page.getTextContent();
          const text = content.items
            .map((item) => (item.str == null ? "" : item.str + (item.hasEOL ? "\\n" : "")))
            .join("");
          page.cleanup();
          pages.push(text);
          chars += text.length;
        }
        return { kind: "pages", pages, numbered: pdf.numPages > 1, truncated: pages.length < pdf.numPages };
      } finally {
        await pdf.loadingTask.destroy();
      }
    },
    async docx() {
      const mammoth = modules.mammoth;
      const result = await mammoth.convertToHtml(
        { buffer: Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) },
        {
          externalFileAccess: false,
          convertImage: mammoth.images.imgElement(() => Promise.resolve({ src: "" })),
        },
      );
      return htmlText(result.value, false);
    },
    async html() {
      const limit = limits.maxHtmlChars * 4;
      let html = new TextDecoder("utf-8").decode(bytes.subarray(0, limit));
      if (html.charCodeAt(0) === 0xfeff) html = html.slice(1);
      return htmlText(html, bytes.byteLength > limit);
    },
    async xlsx() {
      const exceljs = modules.exceljs;
      const workbook = new exceljs.Workbook();
      await workbook.xlsx.load(Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      const sheets = [];
      let chars = 0;
      let truncated = false;
      for (const sheet of workbook.worksheets) {
        const rows = [];
        for (let index = 1; index <= sheet.rowCount && !truncated; index += 1) {
          const values = sheet.getRow(index).values;
          const cells = Array.isArray(values) ? values.slice(1) : [];
          let last = -1;
          cells.forEach((value, column) => {
            const length = cellLength(value);
            if (length > 0) {
              chars += length;
              last = column;
            }
          });
          if (last < 0) continue;
          chars += last + 1;
          rows.push(cells.slice(0, last + 1).map(cellValue));
          truncated = chars > limits.maxChars;
        }
        sheets.push({ name: sheet.name, rows });
        if (truncated) break;
      }
      return { kind: "sheets", sheets, truncated };
    },
  };
  let parsed;
  try {
    parsed = await parsers[workerData.format]();
  } catch {
    parsed = { kind: "invalid" };
  }
  parentPort.postMessage(parsed);
})();`;

let activeWorkers = 0;
const waitingForWorker: Array<() => void> = [];

async function withWorkerSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeWorkers >= RECORD_FILE_PARSER_MAX_WORKERS)
    await new Promise<void>((resolve) => waitingForWorker.push(resolve));
  else activeWorkers += 1;
  try {
    return await run();
  } finally {
    const next = waitingForWorker.shift();
    if (next) next();
    else activeWorkers -= 1;
  }
}

function runParser(bytes: Uint8Array, format: RecordFileParserFormat, limits: RecordFileParserLimits) {
  const copy = bytes.slice();
  const worker = new Worker(PARSER_SOURCE, {
    eval: true,
    workerData: {
      base: join(process.cwd(), "package.json"),
      packages: RECORD_FILE_PARSER_PACKAGES[format],
      format,
      limits,
      bytes: copy.buffer,
    },
    transferList: [copy.buffer],
    resourceLimits: { maxOldGenerationSizeMb: limits.heapMb },
  });
  let timer: NodeJS.Timeout | undefined;
  return new Promise<RecordFileParsed>((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Text extraction took longer than ${limits.timeoutMs} ms`)),
      limits.timeoutMs,
    );
    worker.on("message", resolve);
    worker.on("error", (error: NodeJS.ErrnoException) =>
      error.code === "ERR_WORKER_OUT_OF_MEMORY" ? resolve({ kind: "tooLarge" }) : reject(error),
    );
    worker.on("exit", (code) => reject(new Error(`Text extraction stopped with exit code ${code}`)));
  }).finally(() => {
    clearTimeout(timer);
    void worker.terminate();
  });
}

export function parseRecordFile(
  bytes: Uint8Array,
  format: RecordFileParserFormat,
  limits: RecordFileParserLimits,
): Promise<RecordFileParsed> {
  return withWorkerSlot(() => runParser(bytes, format, limits));
}

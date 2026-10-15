import { describe, expect, it } from "vitest";

import { docxFixture, pdfFixture, xlsxFixture, zipFixture } from "@/tests/helpers/record-file-fixtures";

import {
  extractRecordFileText,
  RECORD_FILE_PARSER_HEAP_MB,
  RECORD_FILE_PDF_MAX_PAGES,
  RECORD_FILE_TEXT_MAX_CHARS,
  RECORD_FILE_TEXT_TIMEOUT_MS,
  RECORD_FILE_ZIP_MAX_UNPACKED_BYTES,
  recordFileTextFormat,
} from "../record-file-text";

const utf8 = (text: string) => new TextEncoder().encode(text);

const LIMITS = {
  timeoutMs: RECORD_FILE_TEXT_TIMEOUT_MS,
  heapMb: RECORD_FILE_PARSER_HEAP_MB,
  maxPages: RECORD_FILE_PDF_MAX_PAGES,
};

async function elapsedMs(run: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  await run();
  return performance.now() - started;
}

describe("record file text formats", () => {
  it("detects the format from the MIME type and falls back to the extension", () => {
    expect(recordFileTextFormat("application/pdf", "scan.bin")).toBe("pdf");
    expect(recordFileTextFormat("text/csv; charset=utf-8", "export")).toBe("csv");
    expect(recordFileTextFormat("application/ld+json", "data")).toBe("json");
    expect(recordFileTextFormat("application/vnd.ms-excel", "Leads.CSV")).toBe("csv");
    expect(recordFileTextFormat("application/octet-stream", "notes.md")).toBe("markdown");
    expect(recordFileTextFormat("", "Offer.docx")).toBe("docx");
    expect(recordFileTextFormat("image/png", "photo.png")).toBeNull();
    expect(recordFileTextFormat("application/zip", "archive")).toBeNull();
  });
});

describe("record file text extraction", () => {
  it("reads every page of a PDF text layer and marks each page as a section", async () => {
    await expect(
      extractRecordFileText(
        pdfFixture([["Quarterly report", "Revenue grew by eleven percent."], [], ["Zebra crossing"]]),
        "pdf",
      ),
    ).resolves.toEqual({
      status: "done",
      text: "## Page 1\n\nQuarterly report\nRevenue grew by eleven percent.\n\n## Page 3\n\nZebra crossing",
      truncated: false,
    });
    await expect(extractRecordFileText(pdfFixture([["Only page"]]), "pdf")).resolves.toEqual({
      status: "done",
      text: "Only page",
      truncated: false,
    });
  });

  it("reports a PDF without a text layer as noText and a broken document as failed", async () => {
    await expect(extractRecordFileText(pdfFixture([[], []]), "pdf")).resolves.toEqual({ status: "noText" });
    await expect(extractRecordFileText(utf8("not a pdf"), "pdf")).resolves.toEqual({ status: "failed" });
    await expect(extractRecordFileText(utf8("not a zip"), "docx")).resolves.toEqual({ status: "failed" });
  });

  it("keeps DOCX headings as Markdown headings and table rows on one line", async () => {
    const result = await extractRecordFileText(
      docxFixture([
        { heading: 1, text: "Renewal terms" },
        { text: "The contract renews every twelve months." },
        { heading: 2, text: "Prices" },
        {
          table: [
            ["Plan", "Price"],
            ["Pro", "29 EUR"],
          ],
        },
      ]),
      "docx",
    );
    expect(result).toEqual({
      status: "done",
      text: "# Renewal terms\n\nThe contract renews every twelve months.\n\n## Prices\n\nPlan   Price\nPro    29 EUR",
      truncated: false,
    });
  });

  it("writes each worksheet as a section of tab-separated rows and skips empty rows and sheets", async () => {
    const result = await extractRecordFileText(
      await xlsxFixture({
        Deals: [
          ["Name", "Amount", "Closed"],
          ["Acme", 1200, new Date(Date.UTC(2026, 0, 2))],
          [],
          ["Globex", { richText: [{ text: "Rich " }, { text: "text" }] }],
        ],
        Empty: [[]],
        Notes: [["Call back on Monday"]],
      }),
      "xlsx",
    );
    expect(result).toEqual({
      status: "done",
      text: "## Deals\n\nName\tAmount\tClosed\nAcme\t1200\t2026-01-02T00:00:00.000Z\nGlobex\tRich text\n\n## Notes\n\nCall back on Monday",
      truncated: false,
    });
  });

  it("converts HTML to text with Markdown headings, without scripts, images or link targets", async () => {
    const html =
      "<html><head><title>Ignored</title><script>steal()</script></head><body><h2>Visit plan</h2>" +
      "<p>See <a href='https://example.test/secret'>our site</a>.</p><img src='a.png' alt='logo'></body></html>";
    await expect(extractRecordFileText(utf8(html), "html")).resolves.toEqual({
      status: "done",
      text: "## Visit plan\n\nSee our site.",
      truncated: false,
    });
  });

  it("pretty-prints JSON, keeps invalid JSON as written and passes CSV and Markdown through", async () => {
    await expect(extractRecordFileText(utf8('{"a":1,"b":[true]}'), "json")).resolves.toEqual({
      status: "done",
      text: '{\n  "a": 1,\n  "b": [\n    true\n  ]\n}',
      truncated: false,
    });
    await expect(extractRecordFileText(utf8('{"a":'), "json")).resolves.toMatchObject({ text: '{"a":' });
    await expect(extractRecordFileText(utf8("name,city\nAcme,Berlin\n"), "csv")).resolves.toMatchObject({
      text: "name,city\nAcme,Berlin",
    });
    await expect(extractRecordFileText(utf8("# Title\n\nBody"), "markdown")).resolves.toMatchObject({
      text: "# Title\n\nBody",
    });
  });

  it("normalises line breaks and removes the byte order mark, NUL and other control characters", async () => {
    await expect(
      extractRecordFileText(utf8("﻿Line one\r\nLine\u0000 two\u0007\r\n\r\n\r\n\r\nEnd   "), "text"),
    ).resolves.toEqual({ status: "done", text: "Line one\nLine two\n\nEnd", truncated: false });
    await expect(extractRecordFileText(utf8(" \n\t\u0000 "), "text")).resolves.toEqual({ status: "noText" });
  });

  it("caps the extracted text and records the truncation", async () => {
    const result = await extractRecordFileText(utf8("lorem ipsum ".repeat(50_000)), "text");
    expect(result.status).toBe("done");
    if (result.status !== "done") return;
    expect(result.truncated).toBe(true);
    expect(result.text.length).toBeLessThanOrEqual(RECORD_FILE_TEXT_MAX_CHARS);
    expect(result.text.length).toBeGreaterThan(RECORD_FILE_TEXT_MAX_CHARS - 20);

    const sheet = await extractRecordFileText(
      await xlsxFixture({ Big: Array.from({ length: 12_000 }, (_, index) => [`Row ${index}`, "x".repeat(40)]) }),
      "xlsx",
    );
    expect(sheet).toMatchObject({ status: "done", truncated: true });
    if (sheet.status === "done") expect(sheet.text.length).toBeLessThanOrEqual(RECORD_FILE_TEXT_MAX_CHARS);
  });
});

describe("record file text extraction limits", () => {
  it("cleans two million characters of spaces in well under a second", async () => {
    const spaces = utf8(`${" ".repeat(1_999_990)}x`);
    expect(await elapsedMs(() => extractRecordFileText(spaces, "text"))).toBeLessThan(1_000);
    await expect(extractRecordFileText(spaces, "text")).resolves.toEqual({
      status: "done",
      text: "x",
      truncated: false,
    });
    const trailing = utf8(`first${" \t".repeat(990_000)}\nsecond`);
    await expect(extractRecordFileText(trailing, "text")).resolves.toMatchObject({ text: "first\nsecond" });
  });

  it("keeps the app responsive while a large document is parsed", async () => {
    const html = utf8(`<html><body>${"<p>Renewal terms and prices for every plan.</p>".repeat(100_000)}</body></html>`);
    let longestPause = 0;
    let last = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      longestPause = Math.max(longestPause, now - last);
      last = now;
    }, 5);
    try {
      await expect(extractRecordFileText(html, "html")).resolves.toMatchObject({ status: "done", truncated: true });
    } finally {
      clearInterval(timer);
      longestPause = Math.max(longestPause, performance.now() - last);
    }
    expect(longestPause).toBeLessThan(200);
  });

  it("reads spreadsheet rows with far-apart cells without slowing down", async () => {
    const wide = await xlsxFixture({
      Wide: Array.from({ length: 30 }, (_, index) => {
        const row: unknown[] = [`Row ${index}`];
        row[16_383] = "Last column";
        return row;
      }),
    });
    const result = await extractRecordFileText(wide, "xlsx");
    expect(result.status).toBe("done");
    if (result.status === "done") expect(result.text.split("\n")[2]).toBe(`Row 0${"\t".repeat(16_383)}Last column`);
    expect(await elapsedMs(() => extractRecordFileText(wide, "xlsx"))).toBeLessThan(2_000);
  });

  it("stops reading a PDF at the page limit", async () => {
    const pages = Array.from({ length: 5 }, (_, index) => [`Page text ${index + 1}`]);
    await expect(extractRecordFileText(pdfFixture(pages), "pdf", { ...LIMITS, maxPages: 2 })).resolves.toEqual({
      status: "done",
      text: "## Page 1\n\nPage text 1\n\n## Page 2\n\nPage text 2",
      truncated: true,
    });
  });

  it("skips an office file whose parts unpack beyond the limit without parsing it", async () => {
    const bomb = zipFixture({ "word/document.xml": new Uint8Array(RECORD_FILE_ZIP_MAX_UNPACKED_BYTES + 1) });
    expect(bomb.byteLength).toBeLessThan(1024 * 1024);
    await expect(extractRecordFileText(bomb, "docx", { ...LIMITS, timeoutMs: 1 })).resolves.toEqual({
      status: "skipped",
    });
  });

  it("skips a document that needs more memory than the parser may use", async () => {
    const sheet = await xlsxFixture({
      Data: Array.from({ length: 40_000 }, (_, index) => [`Customer ${index}`, index, "Berlin", "Lead", index * 3]),
    });
    await expect(extractRecordFileText(sheet, "xlsx", { ...LIMITS, heapMb: 48 })).resolves.toEqual({
      status: "skipped",
    });
    await expect(extractRecordFileText(sheet, "xlsx")).resolves.toMatchObject({ status: "done" });
  }, 60_000);
});

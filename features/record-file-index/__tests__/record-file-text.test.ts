import { describe, expect, it } from "vitest";

import { docxFixture, pdfFixture, xlsxFixture } from "@/tests/helpers/record-file-fixtures";

import { extractRecordFileText, RECORD_FILE_TEXT_MAX_CHARS, recordFileTextFormat } from "../record-file-text";

const utf8 = (text: string) => new TextEncoder().encode(text);

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

  it("reports a PDF without a text layer as noText and rejects a broken PDF", async () => {
    await expect(extractRecordFileText(pdfFixture([[], []]), "pdf")).resolves.toEqual({ status: "noText" });
    await expect(extractRecordFileText(utf8("not a pdf"), "pdf")).rejects.toThrow();
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

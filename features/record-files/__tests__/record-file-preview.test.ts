import { describe, expect, it } from "vitest";

import { docxFixture, xlsxFixture } from "@/tests/helpers/record-file-fixtures";
import { createRecordFilePreview, RECORD_FILE_PREVIEW_MAX_CHARS } from "../record-file-preview";
import { recordFilePreviewFormat, RecordFilePreviewSchema } from "../record-file-preview.schema";

const utf8 = (text: string) => new TextEncoder().encode(text);

describe("record file document previews", () => {
  it("detects previewable formats without treating old Office files or HTML as safe inline documents", () => {
    expect(recordFilePreviewFormat("application/octet-stream", "Plan.XLSX")).toBe("xlsx");
    expect(recordFilePreviewFormat("application/vnd.ms-excel", "Contacts.csv")).toBe("csv");
    for (const name of ["old.xls", "old.doc", "slides.pptx", "page.html", "picture.svg", "image.png", "offer.pdf"])
      expect(recordFilePreviewFormat("application/octet-stream", name)).toBeNull();
  });

  it("keeps text and Markdown inert, prettifies JSON and marks clipped content", async () => {
    const text = '<img src="https://example.org/pixel" onerror="alert(1)">';
    expect(await createRecordFilePreview(utf8(text), "markdown")).toEqual({
      kind: "text",
      format: "markdown",
      text,
      truncated: false,
    });
    expect(await createRecordFilePreview(utf8('{"count":2}'), "json")).toMatchObject({ text: '{\n  "count": 2\n}' });
    const large = await createRecordFilePreview(utf8("a".repeat(RECORD_FILE_PREVIEW_MAX_CHARS) + "😀"), "text");
    expect(large).toMatchObject({ kind: "text", truncated: true, text: "a".repeat(RECORD_FILE_PREVIEW_MAX_CHARS) });
    expect(await createRecordFilePreview(utf8("\u0000binary"), "text")).toEqual({
      kind: "unavailable",
      reason: "unreadable",
    });
    expect(await createRecordFilePreview(utf8(" \n"), "text")).toEqual({ kind: "unavailable", reason: "empty" });
  });

  it("uses the existing CSV decoder for quoted, multiline and semicolon-delimited rows", async () => {
    expect(await createRecordFilePreview(utf8('sep=;\nName;Notes\nAcme;"First line\nSecond; line"\n'), "csv")).toEqual({
      kind: "sheets",
      truncated: false,
      sheets: [
        {
          name: "CSV",
          rows: [
            { number: 2, cells: ["Name", "Notes"] },
            { number: 3, cells: ["Acme", "First line\nSecond; line"] },
          ],
        },
      ],
    });
    const limited = await createRecordFilePreview(utf8(Array.from({ length: 201 }, () => "a,b").join("\n")), "csv");
    expect(limited).toMatchObject({ kind: "sheets", truncated: true });
    if (limited.kind === "sheets") expect(limited.sheets[0].rows).toHaveLength(200);
  });

  it("extracts Word headings and tables with the existing isolated parser", async () => {
    const preview = await createRecordFilePreview(
      docxFixture([
        { heading: 1, text: "Project brief" },
        { text: "Kickoff in Mannheim." },
        {
          table: [
            ["Milestone", "Owner"],
            ["Review", "Alex"],
          ],
        },
      ]),
      "docx",
    );
    expect(preview).toMatchObject({ kind: "text", format: "docx", truncated: false });
    if (preview.kind === "text") {
      for (const term of ["Project brief", "Kickoff in Mannheim", "Milestone", "Alex"])
        expect(preview.text).toContain(term);
    }
    expect(RecordFilePreviewSchema.safeParse(preview).success).toBe(true);
    expect(await createRecordFilePreview(utf8("broken zip"), "docx")).toEqual({
      kind: "unavailable",
      reason: "unreadable",
    });
  });

  it("preserves worksheet names, row positions, rich text, dates and stored formula results", async () => {
    const preview = await createRecordFilePreview(
      await xlsxFixture({
        Sales: [
          ["Account", "Total"],
          [],
          ["Acme", { formula: "1+2", result: 3 }],
          [{ richText: [{ text: "Hello" }, { text: " team" }] }, new Date("2026-10-21T00:00:00Z")],
        ],
        Tasks: [
          ["Task", "Done"],
          ["Review", true],
        ],
      }),
      "xlsx",
    );
    expect(preview).toMatchObject({
      kind: "sheets",
      truncated: false,
      sheets: [
        {
          name: "Sales",
          rows: [
            { number: 1, cells: ["Account", "Total"] },
            { number: 3, cells: ["Acme", "3"] },
            { number: 4, cells: ["Hello team", "2026-10-21T00:00:00.000Z"] },
          ],
        },
        {
          name: "Tasks",
          rows: [
            { number: 1, cells: ["Task", "Done"] },
            { number: 2, cells: ["Review", "true"] },
          ],
        },
      ],
    });
    expect(RecordFilePreviewSchema.safeParse(preview).success).toBe(true);
  });

  it("bounds rows, columns and cells while retaining the other worksheet tabs", async () => {
    const preview = await createRecordFilePreview(
      await xlsxFixture({
        Large: Array.from({ length: 205 }, (_, row) => (row === 0 ? Array.from({ length: 51 }, () => "x") : ["a"])),
        Other: [["z".repeat(3000)]],
      }),
      "xlsx",
    );
    expect(preview).toMatchObject({ kind: "sheets", truncated: true });
    if (preview.kind !== "sheets") throw new Error("Expected sheets");
    expect(preview.sheets).toHaveLength(2);
    expect(preview.sheets[0].rows).toHaveLength(200);
    expect(preview.sheets[0].rows[0].cells).toHaveLength(50);
    expect(preview.sheets[1].rows[0].cells[0]).toHaveLength(2000);
  });
});

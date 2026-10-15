import { describe, expect, it } from "vitest";

import { pdfFixture } from "@/tests/helpers/record-file-fixtures";

import { RECORD_FILE_PARSER_MAX_WORKERS } from "../record-file-parser";
import { extractRecordFileText, RECORD_FILE_PARSER_HEAP_MB, RECORD_FILE_PDF_MAX_PAGES } from "../record-file-text";

describe("record file text extraction time limit", () => {
  it("stops a parser that runs longer than the time limit and frees its slot for the next file", async () => {
    const limits = { timeoutMs: 1, heapMb: RECORD_FILE_PARSER_HEAP_MB, maxPages: RECORD_FILE_PDF_MAX_PAGES };
    const slow = Array.from({ length: RECORD_FILE_PARSER_MAX_WORKERS + 1 }, () =>
      extractRecordFileText(pdfFixture([["Slow page"]]), "pdf", limits),
    );
    for (const extraction of slow) await expect(extraction).rejects.toThrow("Text extraction took longer than 1 ms");
    await expect(extractRecordFileText(pdfFixture([["Fast page"]]), "pdf")).resolves.toEqual({
      status: "done",
      text: "Fast page",
      truncated: false,
    });
  });

  it("queues files beyond the worker limit instead of failing them", async () => {
    const files = Array.from({ length: RECORD_FILE_PARSER_MAX_WORKERS * 2 + 1 }, (_, index) =>
      extractRecordFileText(pdfFixture([[`Page ${index}`]]), "pdf"),
    );
    await expect(Promise.all(files)).resolves.toEqual(
      files.map((_, index) => ({ status: "done", text: `Page ${index}`, truncated: false })),
    );
  });
});

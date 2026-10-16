import { describe, expect, it } from "vitest";

import { normalizeRecordFileMimeType, RECORD_FILE_NAME_MAX_LENGTH, sanitizeRecordFileName } from "../record-file-name";
import {
  parseRecordFileRange,
  recordFileContentDisposition,
  recordFileResponseHeaders,
  recordFileServedInline,
} from "../record-file-response";

describe("record file names", () => {
  it("keeps the last path segment and drops control and direction characters", () => {
    expect(sanitizeRecordFileName("Offer 2026.pdf")).toBe("Offer 2026.pdf");
    expect(sanitizeRecordFileName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeRecordFileName("C:\\Users\\ben\\Vertrag Müller.docx")).toBe("Vertrag Müller.docx");
    expect(sanitizeRecordFileName("in\u0000voice\u202Efdp.exe")).toBe("invoicefdp.exe");
    expect(sanitizeRecordFileName("  spaced \t\n name.txt  ")).toBe("spaced name.txt");
  });

  it("refuses names that are empty after cleaning", () => {
    for (const name of ["", "   ", "/", "folder/", "..", ".", "\u0007"])
      expect(sanitizeRecordFileName(name)).toBeNull();
  });

  it("shortens long names to 255 characters and keeps a short extension", () => {
    const long = sanitizeRecordFileName(`${"a".repeat(400)}.pdf`);
    expect(long).toHaveLength(RECORD_FILE_NAME_MAX_LENGTH);
    expect(long?.endsWith(".pdf")).toBe(true);
    expect(sanitizeRecordFileName("ü".repeat(300))).toBe("ü".repeat(RECORD_FILE_NAME_MAX_LENGTH));
    expect(sanitizeRecordFileName(`report.${"x".repeat(300)}`)).toHaveLength(RECORD_FILE_NAME_MAX_LENGTH);
  });

  it("normalizes media types and falls back to octet-stream", () => {
    expect(normalizeRecordFileMimeType("Application/PDF")).toBe("application/pdf");
    expect(normalizeRecordFileMimeType("text/plain; charset=utf-8")).toBe("text/plain");
    expect(normalizeRecordFileMimeType("application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    for (const invalid of ["", "pdf", "text/", "/plain", "text/plain\r\nx-injected: 1", "a b/c"])
      expect(normalizeRecordFileMimeType(invalid)).toBe("application/octet-stream");
  });
});

describe("record file responses", () => {
  it("shows only PDFs and raster images inline and never markup", () => {
    for (const type of ["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp"])
      expect(recordFileServedInline(type, false)).toBe(true);
    for (const type of ["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "text/plain"])
      expect(recordFileServedInline(type, false)).toBe(false);
    expect(recordFileServedInline("application/pdf", true)).toBe(false);
  });

  it("names the file for every browser without letting the name break the header", () => {
    expect(recordFileContentDisposition("Angebot Müller (final).pdf", false)).toBe(
      "attachment; filename=\"Angebot M_ller (final).pdf\"; filename*=UTF-8''Angebot%20M%C3%BCller%20%28final%29.pdf",
    );
    expect(recordFileContentDisposition('a"b\\c.png', true)).toBe(
      "inline; filename=\"a_b_c.png\"; filename*=UTF-8''a%22b%5Cc.png",
    );
    expect(recordFileContentDisposition("報告.pdf", false)).toBe(
      "attachment; filename=\"__.pdf\"; filename*=UTF-8''%E5%A0%B1%E5%91%8A.pdf",
    );
  });

  it("parses single byte ranges and refuses unsatisfiable ones", () => {
    expect(parseRecordFileRange(null, 100)).toBeNull();
    expect(parseRecordFileRange("bytes=0-9", 100)).toEqual({ start: 0, end: 9 });
    expect(parseRecordFileRange("bytes=90-", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRecordFileRange("bytes=95-200", 100)).toEqual({ start: 95, end: 99 });
    expect(parseRecordFileRange("bytes=-10", 100)).toEqual({ start: 90, end: 99 });
    expect(parseRecordFileRange("bytes=-500", 100)).toEqual({ start: 0, end: 99 });
    expect(parseRecordFileRange("bytes=100-", 100)).toBe("unsatisfiable");
    expect(parseRecordFileRange("bytes=-0", 100)).toBe("unsatisfiable");
    expect(parseRecordFileRange("bytes=0-", 0)).toBe("unsatisfiable");
    for (const ignored of ["bytes=5-1", "bytes=0-1,4-5", "items=0-1", "bytes=-", "bytes=a-b"])
      expect(parseRecordFileRange(ignored, 100)).toBeNull();
  });

  it("sends private, unsniffable headers and sandboxes what the browser shows", () => {
    expect(
      recordFileResponseHeaders({
        name: "scan.png",
        mimeType: "image/png",
        size: 100,
        inline: true,
        range: { start: 10, end: 19 },
      }),
    ).toEqual({
      "content-type": "image/png",
      "content-length": "10",
      "content-disposition": "inline; filename=\"scan.png\"; filename*=UTF-8''scan.png",
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
      "accept-ranges": "bytes",
      "content-security-policy": "sandbox; frame-ancestors 'self'",
      "content-range": "bytes 10-19/100",
    });
    const download = recordFileResponseHeaders({
      name: "page.html",
      mimeType: "text/html",
      size: 5,
      inline: false,
      range: null,
    });
    expect(download["content-disposition"]).toMatch(/^attachment;/);
    expect(download["content-length"]).toBe("5");
    expect(download["content-security-policy"]).toBe("frame-ancestors 'self'");
    expect(download).not.toHaveProperty("content-range");
  });
});

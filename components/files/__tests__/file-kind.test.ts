import { describe, expect, it } from "vitest";

import { FILE_KIND_TONE_CLASS, fileBadgeText, fileKind, fileKindAccentClass, fileTypeLabelKey } from "../file-kind";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("fileKind", () => {
  it.each([
    ["application/pdf", "offer.pdf", "pdf"],
    [XLSX, "prices.xlsx", "spreadsheet"],
    ["application/vnd.ms-excel", "legacy.xls", "spreadsheet"],
    ["text/csv", "contacts.csv", "csv"],
    ["text/plain", "contacts.csv", "csv"],
    ["application/octet-stream", "contacts.tsv", "csv"],
    [DOCX, "contract.docx", "document"],
    ["application/json", "export.json", "json"],
    ["application/ld+json", "schema", "json"],
    ["text/markdown", "notes.md", "markdown"],
    ["application/octet-stream", "README.markdown", "markdown"],
    ["text/plain", "notes.txt", "text"],
    ["text/plain", "notes", "text"],
    ["image/png", "screen.png", "image"],
    ["video/mp4", "demo.mp4", "video"],
    ["application/zip", "bundle.zip", "archive"],
    ["application/octet-stream", "blob.bin", "other"],
    ["", "", "other"],
  ])("classifies %s named %s as %s", (mimeType, name, kind) => {
    expect(fileKind(mimeType, name)).toBe(kind);
  });

  it("labels CSV, Markdown, JSON and text files as themselves, not as Excel or a generic file", () => {
    expect(fileTypeLabelKey(fileKind("text/csv", "a.csv"))).toBe("FileTypes.csv");
    expect(fileTypeLabelKey(fileKind("text/markdown", "a.md"))).toBe("FileTypes.markdown");
    expect(fileTypeLabelKey(fileKind("application/json", "a.json"))).toBe("FileTypes.json");
    expect(fileTypeLabelKey(fileKind("text/plain", "a.txt"))).toBe("FileTypes.text");
  });
});

describe("file badges", () => {
  it("shows the short extension, or the kind's abbreviation for long or missing ones", () => {
    expect(fileBadgeText("pdf", "offer.pdf")).toBe("PDF");
    expect(fileBadgeText("spreadsheet", "prices.xlsx")).toBe("XLSX");
    expect(fileBadgeText("markdown", "README.markdown")).toBe("MD");
    expect(fileBadgeText("json", "schema")).toBe("JSON");
    expect(fileBadgeText("other", "blob.bin")).toBe("BIN");
    expect(fileBadgeText("other", "archive.verylong")).toBe("");
  });

  it("colours each kind from the theme tokens", () => {
    expect(FILE_KIND_TONE_CLASS.pdf).toBe("bg-destructive/15 text-destructive");
    expect(FILE_KIND_TONE_CLASS.spreadsheet).toBe("bg-success/15 text-success");
    expect(FILE_KIND_TONE_CLASS.document).toBe("bg-info/15 text-info");
    expect(FILE_KIND_TONE_CLASS.csv).toBe("bg-chart-2/15 text-chart-2");
    expect(FILE_KIND_TONE_CLASS.json).toBe("bg-warning/15 text-warning");
    expect(FILE_KIND_TONE_CLASS.markdown).toBe("bg-primary/15 text-primary");
    expect(FILE_KIND_TONE_CLASS.text).toBe("bg-foreground/5 text-muted-foreground");
    expect(Object.values(FILE_KIND_TONE_CLASS).join(" ")).not.toMatch(/#[0-9a-f]{3,6}/iu);
    expect(fileKindAccentClass("pdf")).toBe("text-destructive");
  });
});

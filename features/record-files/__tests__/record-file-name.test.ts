import { describe, expect, it } from "vitest";

import { renamedRecordFileName } from "../record-file-name";

describe("renamedRecordFileName", () => {
  it.each([
    ["Offer.pdf", "Signed", "Signed.pdf"],
    ["Offer.pdf", "  Signed   offer  ", "Signed offer.pdf"],
    ["Offer.pdf", "Signed.docx", "Signed.docx"],
    ["Offer.pdf", "Q3 v1.2", "Q3 v1.2"],
    ["README", "Notes", "Notes"],
    ["archive.tar.gz", "backup", "backup.gz"],
    ["Offer.pdf", "Offer.pdf", "Offer.pdf"],
  ])("renames %s to %j as %s", (current, requested, expected) => {
    expect(renamedRecordFileName(current, requested)).toBe(expected);
  });

  it("refuses empty names, folders and names of only dots or control characters", () => {
    for (const requested of ["", "   ", "folder/Offer", "C:\\Offer", "..", ".", "\u0000\u0007"])
      expect(renamedRecordFileName("Offer.pdf", requested), JSON.stringify(requested)).toBeNull();
  });

  it("cuts a long name to 255 characters and keeps the extension", () => {
    const renamed = renamedRecordFileName("Offer.pdf", "x".repeat(400));
    expect(renamed).toHaveLength(255);
    expect(renamed?.endsWith(".pdf")).toBe(true);
  });
});

import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, walkFiles } from "./walk";

// Records hold files in File fields, phone numbers live in Channels, and the field type list grew past ten.
// Marketing and help copy written before that kept saying the opposite, so these exact phrasings stay retired.
// The docs keep their history note about the former Phone field type and are not scanned.

const STALE_CLAIMS = [
  {
    id: "record-file-denial",
    pattern:
      /\b(?:records?|Customermates)\b[^.!?|\n]{0,40}\b(?:do(?:es)? not|don['’]t|cannot|can['’]t)\s+(?:hold|store|keep|upload|have)\b[^.!?|\n]{0,30}\b(?:file attachments?|general attachments?|attachments to|files to)\b|\bno file attachments on records\b/iu,
    why: "File fields hold up to 20 files per record field",
  },
  {
    id: "record-file-denial-de",
    pattern:
      /\b(?:Datensätze|Customermates)\b[^.!?|\n]{0,40}\b(?:enthalten|haben|speichern)\s+keine\s+(?:Datei|Dokument)?anhänge\b|\bDateianhänge gibt es an Datensätzen nicht\b|\blädt keine Dateien an Datensätze\b|\bDateien hängen nicht an Datensätzen\b/iu,
    why: "Felder vom Typ Datei fassen bis zu 20 Dateien",
  },
  {
    id: "phone-field-type",
    pattern: /\b(?:field of type|Feld vom Typ) (?:phone|Telefon)\b|\bphone field type\b|\bFeldtyp Telefon\b|\bphone field on the\b/iu,
    why: "Phone numbers are channels of a record, there is no Phone field type",
  },
  {
    id: "ten-field-types",
    pattern:
      /\b(?:10|ten|zehn)\s+(?:typed\s+|typisierte\w*\s+)?(?:custom[- ](?:field|column)[- ]types?|(?:custom )?field types|Feldtypen|Spaltentypen|Custom-Field-Typen|column types)\b/iu,
    why: "The field type list is the one in content/docs/en/concepts.mdx",
  },
] as const;

const UNSCANNED = ["docs", "api", "legal"];

function staleClaims(file: string, text: string): string[] {
  return STALE_CLAIMS.flatMap(({ id, pattern, why }) => {
    const match = text.match(pattern);
    return match ? [`${file} [${id}] "${match[0]}": ${why}`] : [];
  });
}

function scannedFiles(): string[] {
  return [
    ...walkFiles(join(REPO_ROOT, "content"), (path) => {
      const [, section] = relative(REPO_ROOT, path).split(sep);
      return path.endsWith(".mdx") && !UNSCANNED.includes(section);
    }),
    ...walkFiles(join(REPO_ROOT, "i18n", "locales"), (path) => path.endsWith(".json")),
  ];
}

describe("record field claims", () => {
  it(
    "keeps public and in-app copy free of retired file, phone field and field-count claims",
    () => {
      const files = scannedFiles();
      expect(files.length).toBeGreaterThan(300);
      const violations = files.flatMap((path) => staleClaims(relative(REPO_ROOT, path), readFileSync(path, "utf8")));
      expect(violations).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );

  it("recognizes the retired phrasings", () => {
    for (const claim of [
      "Records do not hold file attachments. Keep photos in your file storage.",
      "Customermates does not upload general attachments to deal records.",
      "No file attachments on records and no CSV import.",
      "Datensätze enthalten keine Dateianhänge.",
      "Eine Festnetznummer speichern Sie in einem Feld vom Typ Telefon.",
      "Customermates supports ten custom field types: text, link, email, phone.",
      "Customermates liefert zehn typisierte Feldtypen.",
    ])
      expect(staleClaims("example.mdx", claim), claim).toHaveLength(1);
  });

  it("leaves import limits, inbox attachments and channel phone numbers alone", () => {
    for (const claim of [
      "An XLSX import carries no attachments, and there is no complete account transfer.",
      "Drafts cannot keep attachments.",
      "Phone numbers go into the Channels field next to email addresses.",
      "Add a File field to the job: up to 20 files per field, 25 MB each.",
      "Der Import übernimmt keine Dateianhänge.",
      "Telefonnummern gehören in das Feld Kanäle.",
    ])
      expect(staleClaims("example.mdx", claim), claim).toEqual([]);
  });
});

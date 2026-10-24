import { readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, walkFiles } from "./walk";

// Records hold files in File fields, phone numbers and email addresses live in the Contact details field, and the
// field type list is the sixteen types of the concepts page. Marketing and help copy written before that kept saying
// the opposite, so these exact phrasings stay retired. "Channels" now only names the inbox's connected accounts.
// The docs keep their history note about the former Phone and Email field types and are not scanned.

const STALE_CLAIMS = [
  {
    id: "record-file-denial",
    pattern:
      /\b(?:records?|deals?|contacts?|Customermates)\b[^.!?|\n]{0,40}\b(?:do(?:es)? not|don['’]t|cannot|can['’]t)\s+(?:hold|store|keep|upload|have)\b[^.!?|\n]{0,30}\b(?:file attachments?|general attachments?|attachments to|files to)\b|\b(?:records?|deals?|contacts?|Customermates)\s+(?:has|have|hold)\s+no\s+file attachments\b|\bno\s+(?:file\s+(?:attachments?|storage|uploads?)|files)\s+(?:on|to)\s+records\b/iu,
    why: "File fields hold up to 20 files per record field",
  },
  {
    id: "record-file-denial-de",
    pattern:
      /\b(?:Datensätze|Deals|Kontakte|Customermates)\b[^.!?|\n]{0,40}\b(?:enthalten|haben|speichern|kennt)\s+keine\s+(?:Datei|Dokument)?anhänge\b|\b(?:Datensätze|Deals|Kontakte)\s+keine\s+(?:Datei|Dokument)?anhänge\s+haben\b|\bkeine\s+(?:Dateianhänge|Dateiablage|Dateien)\s+(?:an|am)\s+(?:Datensätzen|Datensatz)\b|\bkein\s+Datei-Upload\s+an\s+Datensätze\b|\bDateianhänge gibt es an Datensätzen nicht\b|\blädt keine Dateien an Datensätze\b|\bDateien hängen nicht an Datensätzen\b/iu,
    why: "Felder vom Typ Datei fassen bis zu 20 Dateien",
  },
  {
    id: "phone-field-type",
    pattern:
      /\b(?:field of type|Feld vom Typ) (?:phone|Telefon)\b|\bphone field type\b|\bFeldtyp Telefon\b|\bphone field on the\b|\b(?:a|an|custom|own)\s+phone\s+(?:custom\s+)?field\b|\bphone custom field\b|\bEmail, Phone, Web address\b|\bE-Mail, Telefon, Webadresse\b/iu,
    why: "Phone numbers live in the Contact details field, there is no Phone field type",
  },
  {
    id: "email-field-type",
    pattern:
      /\b(?:field of type|Feld vom Typ) (?:email|E-Mail)\b|\bemail field type\b|\bFeldtyp E-Mail\b|\bE-Mail-Feldtyp\b|\b(?:a|an|custom|own)\s+email\s+(?:custom\s+)?field\b|\bMultiple choice, Email, Web address\b|\bMehrfachauswahl, E-Mail, Webadresse\b/iu,
    why: "Email addresses live in the Contact details field, there is no Email field type",
  },
  {
    id: "channels-field",
    pattern:
      /\bChannels field\b|\bFeld (?:\*\*)?Kanäle\b|\bKanäle-Feld|\bFile (?:and|or) Channels\b|\bDatei (?:und|oder) Kanäle\b/iu,
    why: "The field is called Contact details (type Phone, email & social); Channels are the inbox's connected accounts",
  },
  {
    id: "old-field-type-count",
    pattern:
      /\b(?:10|15|17|ten|fifteen|seventeen|zehn|fünfzehn|siebzehn)\s+(?:typed\s+|typisierte\w*\s+)?(?:custom[- ](?:field|column)[- ]types?|(?:custom )?field types|Feldtypen|Spaltentypen|Custom-Field-Typen|column types)\b/iu,
    why: "The field type list is the one in content/docs/en/concepts.mdx",
  },
  {
    id: "no-address-field",
    pattern:
      /\bno (?:built-in |dedicated |separate )?address field\b|\bAdressfeld gibt es nicht\b|\bkein(?:e[ns]?)? (?:eingebaute[sn]? |eigene[sn]? )?Adress(?:feld|feldtyp|typ)\b/iu,
    why: "An Address field holds one structured postal address",
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
    "keeps public and in-app copy free of retired file, phone, email and channels field, address field and field-count claims",
    () => {
      const files = scannedFiles();
      expect(files.length).toBeGreaterThan(200);
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
      "Records have no file attachments; notes can embed images and tables.",
      "Deals have no file attachments, and there is no mobile app.",
      "No web forms, no mobile app and no file storage on records.",
      "No file uploads to records.",
      "Datensätze enthalten keine Dateianhänge.",
      "Nicht importiert, da Datensätze keine Dateianhänge haben.",
      "Keine Dateianhänge an Datensätzen, nur Bilder und Tabellen in Notizen.",
      "Kein Mandantenportal und keine Dateiablage am Datensatz.",
      "Kein Datei-Upload an Datensätze.",
      "Eine Festnetznummer speichern Sie in einem Feld vom Typ Telefon.",
      "A landline goes in a Phone field.",
      "Map WhatsApp numbers to channels; a plain phone number goes into a custom Phone field.",
      "The field types are Text, Email, Phone, Web address and Member.",
      "Store the work address in a field of type Email.",
      "Ein zweites Postfach speichern Sie in einem Feld vom Typ E-Mail.",
      "Add a custom Email field for the billing address.",
      "Single choice, Multiple choice, Email, Web address, Member, Address and File.",
      "Text, Web address, Member, Address, File and Channels.",
      "Phone numbers go into the Channels field.",
      "Telefonnummern gehören in das Feld Kanäle.",
      "Customermates has 17 field types, among them Date, Money and Single choice.",
      "Siebzehn Feldtypen stehen bereit.",
      "Customermates supports ten custom field types: text, link, email, phone.",
      "Customermates liefert zehn typisierte Feldtypen.",
      "Customermates has 15 field types, among them Date, Money and Single choice.",
      "Fifteen field types and calculated fields are available.",
      "Fünfzehn Feldtypen stehen bereit.",
      "There is no built-in address field, so the address lives in that field.",
      "Ein eingebautes Adressfeld gibt es nicht, die Anschrift steht in diesem Feld.",
      "Customermates hat kein Adressfeld.",
    ])
      expect(staleClaims("example.mdx", claim), claim).toHaveLength(1);
  });

  it("leaves import limits, inbox attachments, contact details, connected channels and current field types alone", () => {
    for (const claim of [
      "An XLSX import carries no attachments, and there is no complete account transfer.",
      "Drafts cannot keep attachments.",
      "Message attachments stay in their inbox thread, not on the contact.",
      "Phone numbers go into the Contact details field next to email addresses.",
      "A phone number goes into the Contact details field, and calls happen on your own phone system.",
      "Connect Gmail under Settings › Channels.",
      "Each member connects their own channels.",
      "Map the email column to the contact's Contact details field.",
      "Add a File field to the job: up to 20 files per field, 25 MB each.",
      "Add an Address field to the contact.",
      "Customermates has 16 field types, among them Date, Money and Single choice.",
      "If your sales process needs more than 15 fields per deal, budget for Pro.",
      "Standard allows 10 custom fields per module.",
      "Der Import übernimmt keine Dateianhänge.",
      "Telefonnummern gehören in das Feld Kontaktdaten.",
      "Verbinden Sie Ihr Postfach unter Einstellungen › Kanäle.",
      "Ein Feld vom Typ Adresse enthält eine Postadresse.",
      "Sechzehn Feldtypen stehen bereit.",
      "Keine passende Adresse gefunden.",
    ])
      expect(staleClaims("example.mdx", claim), claim).toEqual([]);
  });
});

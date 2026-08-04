import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const LOCALES = ["en", "de"] as const;
const DOCUMENTS = ["privacy", "terms", "dpa", "subprocessors"] as const;

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

type Formats = { iso: string; longEn: string; longDe: string; numeric: string };

export function formatDate(iso: string): Formats {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Expected an ISO date such as 2026-08-20, received "${iso}"`);

  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day)
    throw new Error(`"${iso}" is not a real calendar date`);

  return {
    iso,
    longEn: `${day} ${MONTHS_EN[month - 1]} ${year}`,
    longDe: `${day}. ${MONTHS_DE[month - 1]} ${year}`,
    numeric: `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`,
  };
}

export function stampDocument(source: string, locale: "en" | "de", formats: Formats): string {
  const long = locale === "en" ? formats.longEn : formats.longDe;

  const versionWithDate = locale === "en" ? `, last updated ${long}` : `, Stand ${long}`;

  return source
    .replace(/^_Version \d{4}-\d{2}-\d{2}(, (?:last updated|Stand) [^_]*)?_$/m, (_line, suffix: string | undefined) =>
      suffix ? `_Version ${formats.iso}${versionWithDate}_` : `_Version ${formats.iso}_`,
    )
    .replace(/^_Version 1\.0,.*_$/m, () =>
      locale === "en" ? `_Version 1.0, effective ${long}_` : `_Version 1.0, gültig ab ${long}_`,
    )
    .replace(/^_Last updated: .*_$/m, `_Last updated: ${long}_`)
    .replace(/^_Stand: .*_$/m, `_Stand: ${long}_`)
    .replace(/^\*Last Update: .*\*$/m, `*Last Update: ${formats.numeric}*`)
    .replace(/^\*Stand: .*\*$/m, `*Stand: ${formats.numeric}*`);
}

function main(): void {
  const iso = process.argv[2];

  if (!iso) {
    console.error("Usage: yarn legal:date <YYYY-MM-DD>");
    console.error("Stamps the version and effective date across every legal document in both locales.");
    process.exit(1);
  }

  const formats = formatDate(iso);
  const root = process.cwd();
  let changed = 0;

  for (const locale of LOCALES) {
    for (const document of DOCUMENTS) {
      const path = join(root, "content", "legal", locale, `${document}.mdx`);
      const source = readFileSync(path, "utf8");
      const stamped = stampDocument(source, locale, formats);

      if (stamped !== source) {
        writeFileSync(path, stamped, "utf8");
        changed += 1;
      }
    }
  }

  console.log(`Stamped ${changed} document(s) with ${formats.iso} (${formats.longEn} / ${formats.longDe}).`);
}

if (process.argv[1]?.endsWith("stamp-legal-date.ts")) main();

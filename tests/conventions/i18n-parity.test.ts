import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { APP_LOCALES, CONTENT_LOCALES, DEFAULT_LOCALE } from "@/i18n/locale-registry";

const ENFORCED = true;

function contentCollections(): string[] {
  return readdirSync(join(REPO_ROOT, "content"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function loadLocaleLeaves(locale: string): Map<string, string> {
  const raw = readFileSync(join(REPO_ROOT, "i18n", "locales", `${locale}.json`), "utf8");
  const leaves = new Map<string, string>();
  collectLeaves(JSON.parse(raw), "", leaves);
  return leaves;
}

function collectLeaves(value: unknown, prefix: string, into: Map<string, string>): void {
  if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) collectLeaves(child, prefix ? `${prefix}.${key}` : key, into);
    return;
  }

  into.set(prefix, String(value));
}

function icuArgumentNames(message: string): string {
  const names = new Set<string>();
  parseIcuMessage(message, 0, names);
  return [...names].sort().join(",");
}

function parseIcuMessage(text: string, start: number, names: Set<string>): number {
  let index = start;
  while (index < text.length) {
    if (text[index] === "}") return index;
    if (text[index] !== "{") {
      index += 1;
      continue;
    }
    index = parseIcuArgument(text, index + 1, names);
  }
  return index;
}

function parseIcuArgument(text: string, start: number, names: Set<string>): number {
  let index = start;
  while (index < text.length && text[index] !== "," && text[index] !== "}") index += 1;
  const name = text.slice(start, index).trim();
  if (name) names.add(name);
  if (text[index] !== ",") return index + 1;

  index += 1;
  const typeStart = index;
  while (index < text.length && text[index] !== "," && text[index] !== "}") index += 1;
  const type = text.slice(typeStart, index).trim();
  if (text[index] !== ",") return index + 1;

  index += 1;
  if (type === "plural" || type === "select" || type === "selectordinal") {
    while (index < text.length && text[index] !== "}") {
      if (text[index] === "{") {
        index = parseIcuMessage(text, index + 1, names) + 1;
        continue;
      }
      index += 1;
    }
    return index + 1;
  }

  let depth = 1;
  while (index < text.length && depth > 0) {
    if (text[index] === "{") depth += 1;
    if (text[index] === "}") depth -= 1;
    index += 1;
  }
  return index;
}

function listContentFiles(root: string): string[] {
  return walkFiles(root, (path) => !basename(path).startsWith("."))
    .map((path) => relative(root, path))
    .sort();
}

describe("i18n parity", () => {
  const referenceLeaves = loadLocaleLeaves(DEFAULT_LOCALE);
  const otherAppLocales = APP_LOCALES.filter((locale) => locale !== DEFAULT_LOCALE);

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has every default-locale leaf key in every app locale", () => {
    const problems: string[] = [];
    for (const locale of otherAppLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const key of referenceLeaves.keys()) if (!leaves.has(key)) problems.push(`${locale}.json is missing ${key}`);
    }
    expect(problems, `leaf keys missing from an app locale:\n${problems.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has no leaf key outside the default locale catalog", () => {
    const problems: string[] = [];
    for (const locale of otherAppLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const key of leaves.keys()) {
        if (!referenceLeaves.has(key)) problems.push(`${DEFAULT_LOCALE}.json is missing ${key} (present in ${locale})`);
      }
    }
    expect(problems, `leaf keys missing from the default locale:\n${problems.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps ICU placeholder names aligned per shared key", () => {
    const mismatches: string[] = [];
    for (const locale of otherAppLocales) {
      const leaves = loadLocaleLeaves(locale);
      for (const [key, referenceValue] of referenceLeaves) {
        const value = leaves.get(key);
        if (value === undefined) continue;
        const referenceArguments = icuArgumentNames(referenceValue);
        const localeArguments = icuArgumentNames(value);
        if (referenceArguments !== localeArguments) {
          mismatches.push(`${key}: ${DEFAULT_LOCALE}={${referenceArguments}} ${locale}={${localeArguments}}`);
        }
      }
    }
    expect(mismatches, `ICU placeholder mismatches:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("mirrors every content collection across content locales", () => {
    const problems: string[] = [];
    const collections = contentCollections();

    expect(collections.length, "expected content collections on disk").toBeGreaterThan(0);

    for (const collection of collections) {
      const referenceDir = join(REPO_ROOT, "content", collection, DEFAULT_LOCALE);
      if (!existsSync(referenceDir)) continue;
      const referenceFiles = new Set(listContentFiles(referenceDir));

      for (const locale of CONTENT_LOCALES) {
        if (locale === DEFAULT_LOCALE) continue;
        const localeDir = join(REPO_ROOT, "content", collection, locale);
        const localeFiles = new Set(existsSync(localeDir) ? listContentFiles(localeDir) : []);

        for (const file of referenceFiles) {
          if (!localeFiles.has(file)) problems.push(`content/${collection}/${locale} is missing ${file}`);
        }
        for (const file of localeFiles) {
          if (!referenceFiles.has(file)) {
            problems.push(`content/${collection}/${DEFAULT_LOCALE} is missing ${file} (present in ${locale})`);
          }
        }
      }
    }

    expect(problems, `content tree locale mismatches:\n${problems.join("\n")}`).toEqual([]);
  });
});

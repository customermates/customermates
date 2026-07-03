import { existsSync, readFileSync } from "node:fs";
import { basename, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const CONTENT_SECTIONS = ["docs", "blog", "features", "compare", "for", "legal"];

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
  const enLeaves = loadLocaleLeaves("en");
  const deLeaves = loadLocaleLeaves("de");

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has every en leaf key in de", () => {
    const missingInDe = [...enLeaves.keys()].filter((key) => !deLeaves.has(key));
    expect(missingInDe, `leaf keys missing in de.json:\n${missingInDe.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("has every de leaf key in en", () => {
    const missingInEn = [...deLeaves.keys()].filter((key) => !enLeaves.has(key));
    expect(missingInEn, `leaf keys missing in en.json:\n${missingInEn.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("keeps ICU placeholder names aligned per shared key", () => {
    const mismatches: string[] = [];
    for (const [key, enValue] of enLeaves) {
      const deValue = deLeaves.get(key);
      if (deValue === undefined) continue;
      const enArguments = icuArgumentNames(enValue);
      const deArguments = icuArgumentNames(deValue);
      if (enArguments !== deArguments) mismatches.push(`${key}: en={${enArguments}} de={${deArguments}}`);
    }
    expect(mismatches, `ICU placeholder mismatches:\n${mismatches.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("mirrors the content file tree across both locales", () => {
    const problems: string[] = [];
    for (const section of CONTENT_SECTIONS) {
      const enDir = join(REPO_ROOT, "content", section, "en");
      const deDir = join(REPO_ROOT, "content", section, "de");
      if (!existsSync(enDir) || !existsSync(deDir)) continue;
      const enFiles = new Set(listContentFiles(enDir));
      const deFiles = new Set(listContentFiles(deDir));
      for (const file of enFiles) if (!deFiles.has(file)) problems.push(`content/${section}/de is missing ${file}`);
      for (const file of deFiles) if (!enFiles.has(file)) problems.push(`content/${section}/en is missing ${file}`);
    }
    expect(problems, `content tree locale mismatches:\n${problems.join("\n")}`).toEqual([]);
  });
});

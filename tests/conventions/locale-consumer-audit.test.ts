import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

import { ROUTING_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const SCANNED_ROOTS = ["app", "components", "core", "ee", "features", "i18n", "scripts", "tests", "__tests__"];

// The registry owns the locale set. These files may still name locales:
// the registry itself, and fixtures that deliberately model other registries.
const ALLOWED = new Set([
  "i18n/locale-registry.ts",
  "tests/conventions/locale-consumer-audit.test.ts",
  "tests/conventions/locale-registry.test.ts",
  "__tests__/proxy-locales.test.ts",
  "__tests__/proxy.test.ts",
  "tests/helpers/mock-user.ts",
]);

// Derived from the registry rather than spelled out, so a locale added later is
// policed on the day it is registered. Spelling the set out here meant the
// patterns only ever recognised the two locales that existed when they were
// written, and `["fr","it"]` passed the gate cleanly.
const LOCALE_ALTERNATION = ROUTING_LOCALES.join("|");
const LOCALE_LIST_LITERAL = new RegExp(
  `\\[\\s*["'](?:${LOCALE_ALTERNATION})["']\\s*(?:,\\s*["'](?:${LOCALE_ALTERNATION})["']\\s*)+\\]`,
);
const LOCALE_UNION_TYPE = new RegExp(
  `["'](?:${LOCALE_ALTERNATION})["']\\s*\\|\\s*["'](?:${LOCALE_ALTERNATION})["']`,
);
const REDECLARED_LOCALE_ALIAS = /\(typeof\s+(?:ROUTING_LOCALES|APP_LOCALES|CONTENT_LOCALES)\)\[number\]/;

const DOMAIN_EXPECTATIONS: Array<{ file: string; imports: string }> = [
  { file: "app/sitemap.ts", imports: "CONTENT_LOCALES" },
  { file: "core/fumadocs/i18n.ts", imports: "CONTENT_LOCALES" },
  { file: "core/fumadocs/metadata.ts", imports: "CONTENT_LOCALES" },
  { file: "components/shared/language-selector.tsx", imports: "CONTENT_LOCALES" },
  { file: "scripts/generate-raw-docs-manifest.ts", imports: "CONTENT_LOCALES" },
  { file: "app/[locale]/(protected)/profile/components/profile-settings-form.tsx", imports: "APP_LOCALES" },
  { file: "features/user/upsert/update-user-details.interactor.ts", imports: "APP_LOCALES" },
];

function scannedFiles(): string[] {
  return SCANNED_ROOTS.flatMap((root) =>
    walkFiles(join(REPO_ROOT, root), (path) => path.endsWith(".ts") || path.endsWith(".tsx")),
  );
}

function violations(pattern: RegExp): string[] {
  const found: string[] = [];

  for (const path of scannedFiles()) {
    const repoPath = relative(REPO_ROOT, path);
    if (ALLOWED.has(repoPath)) continue;

    const source = readFileSync(path, "utf8");
    source.split("\n").forEach((line, index) => {
      if (pattern.test(line)) found.push(`${repoPath}:${index + 1}: ${line.trim()}`);
    });
  }

  return found;
}

describe("locale consumer audit", () => {
  it.skipIf(!ENFORCED)("declares no locale list outside the registry", () => {
    const found = violations(LOCALE_LIST_LITERAL);
    expect(found, `hard-coded locale lists (import from @/i18n/locale-registry instead):\n${found.join("\n")}`).toEqual(
      [],
    );
  });

  it.skipIf(!ENFORCED)("declares no locale union type outside the registry", () => {
    const found = violations(LOCALE_UNION_TYPE);
    expect(
      found,
      `hard-coded locale union types (use AppLocale, ContentLocale or RoutingLocale):\n${found.join("\n")}`,
    ).toEqual([]);
  });

  it.skipIf(!ENFORCED)("re-declares no locale alias from a registry array", () => {
    const found = violations(REDECLARED_LOCALE_ALIAS);
    expect(found, `re-declared locale aliases (import the exported type instead):\n${found.join("\n")}`).toEqual([]);
  });

  it.skipIf(!ENFORCED)("binds each locale consumer to its own domain", () => {
    const problems: string[] = [];

    for (const { file, imports } of DOMAIN_EXPECTATIONS) {
      const source = readFileSync(join(REPO_ROOT, file), "utf8");
      if (!source.includes(imports)) problems.push(`${file} should derive its locales from ${imports}`);
    }

    expect(problems, `locale consumers bound to the wrong domain:\n${problems.join("\n")}`).toEqual([]);
  });
});

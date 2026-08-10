import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";
import ts from "typescript";

import { REPO_ROOT, walkFiles } from "./walk";

import { REGISTERED_LOCALES } from "@/i18n/locale-registry";

const ENFORCED = true;

const ALLOWED = new Set([
  "i18n/locale-registry.ts",
  "tests/conventions/locale-consumer-audit.test.ts",
  "tests/conventions/locale-registry.test.ts",
  "__tests__/proxy-locales.test.ts",
  "__tests__/proxy.test.ts",
  "tests/helpers/mock-user.ts",
]);

const LOCALE_ALTERNATION = REGISTERED_LOCALES.join("|");
const LOCALE_LIST_LITERAL = new RegExp(
  `\\[\\s*["'](?:${LOCALE_ALTERNATION})["']\\s*(?:,\\s*["'](?:${LOCALE_ALTERNATION})["']\\s*)+\\]`,
);
const LOCALE_UNION_TYPE = new RegExp(
  `["'](?:${LOCALE_ALTERNATION})["']\\s*\\|\\s*["'](?:${LOCALE_ALTERNATION})["']`,
);
const REDECLARED_LOCALE_ALIAS =
  /\(typeof\s+(?:REGISTERED_LOCALES|ROUTING_LOCALES|APP_LOCALES|CONTENT_LOCALES|FORMATTING_LOCALES)\)\[number\]/;

const DOMAIN_EXPECTATIONS: Array<{ file: string; imports: string }> = [
  { file: "app/sitemap.ts", imports: "CONTENT_LOCALES" },
  { file: "core/fumadocs/i18n.ts", imports: "CONTENT_LOCALES" },
  { file: "core/fumadocs/metadata.ts", imports: "CONTENT_LOCALES" },
  { file: "components/shared/language-selector.tsx", imports: "CONTENT_LOCALES" },
  { file: "scripts/generate-raw-docs-manifest.ts", imports: "CONTENT_LOCALES" },
  { file: "app/[locale]/(protected)/profile/components/profile-settings-form.tsx", imports: "APP_LOCALES" },
  { file: "app/[locale]/(protected)/profile/components/profile-settings-form.tsx", imports: "FORMATTING_LOCALES" },
  { file: "features/user/upsert/update-user-details.interactor.ts", imports: "DISPLAY_LANGUAGE_VALUES" },
  { file: "features/user/upsert/update-user-details.interactor.ts", imports: "FORMATTING_LOCALE_VALUES" },
  { file: "core/stores/intl.store.ts", imports: "isFormattingLocale" },
];

function scannedFiles(): string[] {
  return walkFiles(REPO_ROOT, (path) => path.endsWith(".ts") || path.endsWith(".tsx"));
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

function isProductionSource(repoPath: string): boolean {
  return (
    !/(^|\/)(?:tests|__tests__)(?:\/|$)/.test(repoPath) &&
    !repoPath.startsWith("app/[locale]/(protected)/test/")
  );
}

function hardCodedLocaleComparisonsInSource(source: string, repoPath: string): string[] {
  const localeValues = new Set<string>(REGISTERED_LOCALES);
  const found: string[] = [];
  const sourceFile = ts.createSourceFile(repoPath, source, ts.ScriptTarget.Latest, true);

  const record = (node: ts.Node): void => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    found.push(`${repoPath}:${line}: ${node.getText(sourceFile)}`);
  };

  const visit = (node: ts.Node): void => {
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;
      const comparesEquality =
        operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        operator === ts.SyntaxKind.EqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsToken;
      const left = ts.isStringLiteralLike(node.left) ? node.left : null;
      const right = ts.isStringLiteralLike(node.right) ? node.right : null;
      const literal = left ?? right;

      if (comparesEquality && literal && localeValues.has(literal.text)) record(node);
    }

    if (
      ts.isCaseClause(node) &&
      ts.isStringLiteralLike(node.expression) &&
      localeValues.has(node.expression.text)
    ) {
      record(node);
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function hardCodedLocaleComparisons(): string[] {
  const found: string[] = [];

  for (const path of scannedFiles()) {
    const repoPath = relative(REPO_ROOT, path);
    if (ALLOWED.has(repoPath) || !isProductionSource(repoPath)) continue;

    found.push(...hardCodedLocaleComparisonsInSource(readFileSync(path, "utf8"), repoPath));
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

  it.skipIf(!ENFORCED)("contains no direct language-code comparison outside the registry", () => {
    const found = hardCodedLocaleComparisons();
    expect(
      found,
      `hard-coded locale comparisons (model the behavior in the locale registry):\n${found.join("\n")}`,
    ).toEqual([]);
  });

  it("detects aliased equality and switch comparisons", () => {
    const found = hardCodedLocaleComparisonsInSource(
      `const current = useLocale();
       const label = current === "de" ? title : fallback;
       switch (current) {
         case "fr": return title;
       }`,
      "fixture.ts",
    );

    expect(found).toHaveLength(2);
    expect(found.join("\n")).toContain('current === "de"');
    expect(found.join("\n")).toContain('case "fr"');
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

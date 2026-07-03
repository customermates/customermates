import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const PRISMA_REPOSITORY_SPECIFIER = /prisma-[^"']*\.repository/;
const DI_FILE = "core/di.ts";
const OPENAPI_SPEC_FILE = "core/openapi/openapi-spec.ts";

function isTestPath(path: string) {
  return path.includes("__tests__") || path.startsWith("tests/");
}

function sourceFilesUnder(dirs: string[]) {
  return dirs.flatMap((dir) => walkFiles(join(REPO_ROOT, dir), (path) => /\.(ts|tsx)$/.test(path)));
}

function parse(path: string, text: string) {
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
}

function isTypeOnlyImport(statement: ts.ImportDeclaration) {
  const clause = statement.importClause;
  if (!clause) return false;
  if (clause.isTypeOnly) return true;
  if (clause.name) return false;
  if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) return false;

  return clause.namedBindings.elements.every((element) => element.isTypeOnly);
}

function importSpecifiers(path: string) {
  const source = parse(path, readFileSync(path, "utf8"));
  const specifiers: { specifier: string; typeOnly: boolean; line: number }[] = [];
  for (const statement of source.statements) {
    const isImport = ts.isImportDeclaration(statement);
    const isExport = ts.isExportDeclaration(statement);
    if (!isImport && !isExport) continue;
    const moduleSpecifier = statement.moduleSpecifier;
    if (!moduleSpecifier || !ts.isStringLiteral(moduleSpecifier)) continue;
    specifiers.push({
      specifier: moduleSpecifier.text,
      typeOnly: isImport ? isTypeOnlyImport(statement) : statement.isTypeOnly,
      line: ts.getLineAndCharacterOfPosition(source, moduleSpecifier.getStart(source)).line + 1,
    });
  }
  return specifiers;
}

function specifiersImportedBy(registryFile: string) {
  return new Set(importSpecifiers(join(REPO_ROOT, registryFile)).map((entry) => entry.specifier));
}

function unregistered(pattern: RegExp, registryFile: string) {
  const registered = specifiersImportedBy(registryFile);

  return sourceFilesUnder(["features", "ee"])
    .map((path) => relative(REPO_ROOT, path))
    .filter((file) => pattern.test(file) && !isTestPath(file))
    .filter((file) => !registered.has(`@/${file.replace(/\.ts$/, "")}`))
    .map((file) => `${file} is not imported by ${registryFile}`);
}

describe("dependency injection boundaries", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "only core/di.ts value-imports prisma-*.repository files",
    () => {
      const violations: string[] = [];
      for (const path of sourceFilesUnder(["app", "components", "features", "ee", "core", "workflows"])) {
        const file = relative(REPO_ROOT, path);
        if (file === DI_FILE || isTestPath(file)) continue;
        const text = readFileSync(path, "utf8");
        if (!PRISMA_REPOSITORY_SPECIFIER.test(text)) continue;
        for (const entry of importSpecifiers(path)) {
          if (!PRISMA_REPOSITORY_SPECIFIER.test(entry.specifier)) continue;
          if (entry.typeOnly) continue;
          violations.push(`${file}:${entry.line} value-imports "${entry.specifier}" outside ${DI_FILE}`);
        }
      }

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("every interactor is registered in core/di.ts", () => {
    const violations = unregistered(/\.interactor\.ts$/, DI_FILE);

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "every openapi operation file is registered in the openapi spec",
    () => {
      const violations = unregistered(/\.openapi\.ts$/, OPENAPI_SPEC_FILE);

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it("sees the expected wiring surface", () => {
    const diImports = specifiersImportedBy(DI_FILE);
    const prismaImports = [...diImports].filter((specifier) => PRISMA_REPOSITORY_SPECIFIER.test(specifier));
    expect([...diImports].filter((specifier) => specifier.endsWith(".interactor")).length).toBeGreaterThan(100);
    expect(prismaImports.length).toBeGreaterThan(10);
    const specImports = specifiersImportedBy(OPENAPI_SPEC_FILE);
    expect([...specImports].filter((specifier) => specifier.endsWith(".openapi")).length).toBeGreaterThan(50);
  });
});

import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, parseSource, readSourceText, walkFiles } from "./walk";

const RUNTIME_DIRECTORIES = /^(app|components|core|ee|features|workflows|hooks|constants|i18n)\//;
const PRESET_MODULE = /(^|\/)(crm-preset|crm-preset-options|workspace-record-preset)$/;
const PRESET_FILES = new Set([
  "features/records/crm-preset.ts",
  "features/records/crm-preset-options.ts",
  "features/records/workspace-record-preset.ts",
]);

function isTestPath(path: string) {
  return path.includes("__tests__") || /\.test\.tsx?$/.test(path) || path.startsWith("tests/");
}

function runtimeFiles() {
  return walkFiles(REPO_ROOT, (path) => /\.(ts|tsx)$/.test(path))
    .map((path) => relative(REPO_ROOT, path))
    .filter((file) => RUNTIME_DIRECTORIES.test(file) && !isTestPath(file) && !PRESET_FILES.has(file));
}

function presetImports(file: string) {
  const path = join(REPO_ROOT, file);
  const source = parseSource(path, readSourceText(path), file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    const specifier =
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
        ? node.moduleSpecifier
        : ts.isCallExpression(node) &&
            node.expression.kind === ts.SyntaxKind.ImportKeyword &&
            node.arguments[0] &&
            ts.isStringLiteral(node.arguments[0])
          ? node.arguments[0]
          : null;
    if (specifier && PRESET_MODULE.test(specifier.text)) {
      const line = ts.getLineAndCharacterOfPosition(source, specifier.getStart(source)).line + 1;
      found.push(`${file}:${line} imports ${specifier.text}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

describe("starter preset boundary", () => {
  it(
    "keeps the starter preset out of registration and runtime code; only seeds, tests and e2e helpers build data with it",
    () => {
      expect(runtimeFiles().length).toBeGreaterThan(100);
      expect(runtimeFiles().flatMap(presetImports)).toEqual([]);
    },
    REPO_SCAN_TIMEOUT_MS,
  );
});

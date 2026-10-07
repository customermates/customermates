import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";

import { REPO_ROOT, walkFiles } from "./walk";

const PRODUCT_DIRECTORIES = ["app", "components", "features", "ee"];

const NON_PRODUCT_PREFIXES = [
  "app/[locale]/(static)/",
  "app/[locale]/(public)/",
  "app/[locale]/(protected)/test/",
  "app/api/",
  "app/.well-known/",
  "components/marketing/",
  "components/emails/",
  "components/acquisition/",
  "components/seo/",
  "app/components/public-navbar",
  "app/components/footer",
  "app/components/navigation/public-",
  "app/og/",
];

export type SourceFile = { file: string; text: string; ast: ts.SourceFile };

export type Finding = { file: string; line: number; snippet: string };

function isProductSource(file: string) {
  if (!/\.tsx?$/.test(file)) return false;
  if (/(^|\/)__tests__\//.test(file) || /\.test\.tsx?$/.test(file)) return false;
  return !NON_PRODUCT_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function loadProductSources(): SourceFile[] {
  return PRODUCT_DIRECTORIES.flatMap((directory) => walkFiles(join(REPO_ROOT, directory), () => true))
    .map((absolute) => relative(REPO_ROOT, absolute))
    .filter(isProductSource)
    .map((file) => {
      const text = readFileSync(join(REPO_ROOT, file), "utf8");
      const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      return { file, text, ast: ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind) };
    });
}

export const PRODUCT_SOURCES = loadProductSources();

export function lineOf(source: SourceFile, position: number) {
  return source.ast.getLineAndCharacterOfPosition(position).line + 1;
}

export function finding(source: SourceFile, position: number, snippet: string): Finding {
  return { file: source.file, line: lineOf(source, position), snippet: snippet.replace(/\s+/g, " ").slice(0, 140) };
}

export function visit(node: ts.Node, callback: (node: ts.Node) => void) {
  callback(node);
  node.forEachChild((child) => visit(child, callback));
}

export function patternFindings(sources: SourceFile[], pattern: RegExp): Finding[] {
  return sources.flatMap((source) =>
    [...source.text.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))].map(
      (match) => finding(source, match.index ?? 0, match[0]),
    ),
  );
}

export function importsFrom(source: SourceFile, modulePattern: RegExp) {
  return source.ast.statements.some(
    (statement) =>
      ts.isImportDeclaration(statement) &&
      ts.isStringLiteral(statement.moduleSpecifier) &&
      modulePattern.test(statement.moduleSpecifier.text),
  );
}

export function tagNameOf(node: ts.Node) {
  if (ts.isJsxElement(node)) return node.openingElement.tagName.getText();
  if (ts.isJsxSelfClosingElement(node)) return node.tagName.getText();
  return undefined;
}

export function attributesOf(node: ts.JsxElement | ts.JsxSelfClosingElement) {
  const opening = ts.isJsxElement(node) ? node.openingElement : node;
  return opening.attributes;
}

export function attributeText(node: ts.JsxElement | ts.JsxSelfClosingElement, name: string) {
  const attribute = attributesOf(node).properties.find(
    (property) => ts.isJsxAttribute(property) && property.name.getText() === name,
  );
  if (!attribute || !ts.isJsxAttribute(attribute)) return undefined;
  return attribute.initializer?.getText() ?? "true";
}

export function formatFindings(findings: Finding[]) {
  return findings.map(({ file, line, snippet }) => `${file}:${line}: ${snippet}`);
}

export function filesOf(findings: Finding[]) {
  return [...new Set(findings.map(({ file }) => file))].sort();
}

export function outsideAllowlist(findings: Finding[], allowlist: Readonly<Record<string, string>>) {
  return formatFindings(findings.filter(({ file }) => !(file in allowlist)));
}

export function staleAllowlistEntries(findings: Finding[], allowlist: Readonly<Record<string, string>>) {
  const violating = new Set(findings.map(({ file }) => file));
  return Object.keys(allowlist).filter((file) => !violating.has(file));
}

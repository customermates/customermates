import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const READ_PATH_FILE = "core/base/base-get.interactor.ts";
const STATE_REPO_FILE = "core/data-view/data-view-state.repo.ts";
const STATE_SCHEMA_FILE = "features/data-view/data-view.schema.ts";
const STATE_WRITE_FILE = "features/data-view/save-data-view-state.interactor.ts";
const OPERATOR_DECORATOR_FILE = "core/decorators/operator-interactor.decorator.ts";

const WRITE_VERB = /^(upsert|update|delete)/i;
const VIEW_MUTATION_KEYS = ["id", "name", "position", "activeViewKey"];

function parse(relativePath: string): ts.SourceFile {
  const path = join(REPO_ROOT, relativePath);

  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
}

function collectIdentifiers(source: ts.SourceFile): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isIdentifier(node)) names.push(node.text);
    ts.forEachChild(node, visit);
  };
  visit(source);

  return names;
}

function findClass(source: ts.SourceFile, name: string): ts.ClassDeclaration {
  let found: ts.ClassDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isClassDeclaration(node) && node.name?.text === name) found = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!found) throw new Error(`Class ${name} not found in ${source.fileName}`);

  return found;
}

function findObjectLiteralKeys(source: ts.SourceFile, variableName: string): string[] {
  let declaration: ts.VariableDeclaration | undefined;
  const visit = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === variableName)
      declaration = node;
    ts.forEachChild(node, visit);
  };
  visit(source);
  if (!declaration?.initializer) throw new Error(`Variable ${variableName} not found in ${source.fileName}`);

  const keys: string[] = [];
  const collect = (node: ts.Node) => {
    if (ts.isObjectLiteralExpression(node))
      for (const property of node.properties)
        if (property.name && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)))
          keys.push(property.name.text);
    ts.forEachChild(node, collect);
  };
  collect(declaration.initializer);

  return keys;
}

function propertyAccessNames(source: ts.SourceFile): string[] {
  const names: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node)) names.push(node.name.text);
    ts.forEachChild(node, visit);
  };
  visit(source);

  return names;
}

describe("data view read and write separation", () => {
  it("keeps every write verb out of the list read path", () => {
    const offenders = [...new Set(collectIdentifiers(parse(READ_PATH_FILE)))].filter((name) => WRITE_VERB.test(name));

    expect(offenders).toEqual([]);
  });

  it("gives the read port exactly one method and no write method to call", () => {
    const declaration = findClass(parse(STATE_REPO_FILE), "DataViewStateRepo");
    const members = declaration.members.map((member) =>
      member.name && ts.isIdentifier(member.name) ? member.name.text : "",
    );

    expect(members).toEqual(["loadSurfaceState"]);
    expect(declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword)).toBe(true);
  });

  it("denies the autosave writer any key that could name, move or switch a view", () => {
    const keys = findObjectLiteralKeys(parse(STATE_SCHEMA_FILE), "SaveDataViewStateSchema");

    expect(keys).toEqual(["surfaceKey", "viewKey", "state"]);
    for (const forbidden of VIEW_MUTATION_KEYS) expect(keys).not.toContain(forbidden);
  });

  it("keeps the autosave writer away from a view's identity and from the remembered tab", () => {
    const source = parse(STATE_WRITE_FILE);
    const identifiers = new Set([...collectIdentifiers(source), ...propertyAccessNames(source)]);

    for (const forbidden of VIEW_MUTATION_KEYS.filter((key) => key !== "id")) expect(identifiers).not.toContain(forbidden);
  });

  it("leaves the operator decorator establishing an operator frame only", () => {
    const source = parse(OPERATOR_DECORATOR_FILE);

    expect(collectIdentifiers(source)).not.toContain("runWithTenant");
    expect(source.text).not.toContain("runWithTenant");
  });
});

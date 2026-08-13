import { readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";

export type McpRegistryFacts = {
  alwaysOn: number;
  grouped: number;
  groups: Readonly<Record<string, number>>;
  toolsets: number;
  total: number;
};

function exportedInitializer(sourceFile: ts.SourceFile, exportName: string): ts.Expression {
  for (const statement of sourceFile.statements) {
    if (
      !ts.isVariableStatement(statement) ||
      !statement.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    )
      continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && declaration.name.text === exportName && declaration.initializer)
        return declaration.initializer;
    }
  }
  throw new Error(`MCP registry source is missing exported ${exportName}`);
}

function arrayIdentifiers(expression: ts.Expression, label: string): readonly ts.Identifier[] {
  if (!ts.isArrayLiteralExpression(expression)) throw new Error(`${label} must be an array literal`);
  if (!expression.elements.every(ts.isIdentifier)) throw new Error(`${label} must contain only direct tool references`);
  return expression.elements;
}

function propertyName(property: ts.PropertyAssignment): string {
  if (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) return property.name.text;
  throw new Error("MCP tool group names must be identifiers or string literals");
}

export function readMcpRegistryFacts(root = process.cwd()): McpRegistryFacts {
  const registryPath = join(root, "features", "mcp-tools", "tool-registry.ts");
  const source = readFileSync(registryPath, "utf8");
  const sourceFile = ts.createSourceFile(registryPath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const groupExpression = exportedInitializer(sourceFile, "MCP_TOOL_GROUPS");
  if (!ts.isObjectLiteralExpression(groupExpression)) throw new Error("MCP_TOOL_GROUPS must be an object literal");
  const groups: Record<string, number> = {};

  for (const property of groupExpression.properties) {
    if (!ts.isPropertyAssignment(property)) throw new Error("MCP_TOOL_GROUPS must use direct property assignments");
    const name = propertyName(property);
    if (name in groups) throw new Error(`Duplicate MCP tool group: ${name}`);
    const count = arrayIdentifiers(property.initializer, `MCP tool group ${name}`).length;
    if (count === 0) throw new Error(`MCP tool group ${name} has no statically declared tools`);
    groups[name] = count;
  }

  if (Object.keys(groups).length === 0) throw new Error("MCP_TOOL_GROUPS has no tool groups");

  const grouped = Object.values(groups).reduce((total, count) => total + count, 0);
  const alwaysOn = arrayIdentifiers(
    exportedInitializer(sourceFile, "MCP_ALWAYS_ON_TOOLS"),
    "MCP_ALWAYS_ON_TOOLS",
  ).length;
  return {
    alwaysOn,
    grouped,
    groups,
    toolsets: Object.keys(groups).length,
    total: grouped + alwaysOn,
  };
}

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const TENANT_CONTEXT_MODULE = /(^|\/)tenant-context$/;
const BACKGROUND_TENANT_MODULE = /(^|\/)background-tenant$/;

const AUTHENTICATED_TENANT_ENTRYPOINTS = [
  "app/[locale]/(protected)/test/error/actions.ts",
  "core/decorators/background-tenant.ts",
  "core/decorators/tenant-interactor.decorator.ts",
  "ee/agent-chat/agent-runner.ts",
  "features/onboarding-wizard/complete-onboarding-wizard.interactor.ts",
  "features/user/register/register-user.interactor.ts",
];

const BACKGROUND_TENANT_DEFINITION = "core/decorators/background-tenant.ts";
const BACKGROUND_TENANT_CALLER_PREFIX = "workflows/";

function isTestPath(path: string) {
  return path.includes("__tests__") || path.startsWith("tests/");
}

function sourceFiles() {
  return walkFiles(REPO_ROOT, (path) => /\.(ts|tsx)$/.test(path))
    .map((path) => relative(REPO_ROOT, path))
    .filter((file) => /^(app|components|features|ee|core|workflows|scripts)\//.test(file))
    .filter((file) => !isTestPath(file));
}

function valueImportsOf(file: string) {
  const path = join(REPO_ROOT, file);
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const found: { specifier: string; name: string; line: number }[] = [];

  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement)) continue;

    const clause = statement.importClause;
    if (!clause || clause.isTypeOnly) continue;
    if (!clause.namedBindings || !ts.isNamedImports(clause.namedBindings)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;

    const specifier = statement.moduleSpecifier.text;
    const line = ts.getLineAndCharacterOfPosition(source, statement.moduleSpecifier.getStart(source)).line + 1;

    for (const element of clause.namedBindings.elements) {
      if (element.isTypeOnly) continue;
      found.push({ specifier, name: element.name.text, line });
    }
  }

  return found;
}

function importersOf(modulePattern: RegExp, symbol: string) {
  return sourceFiles().filter((file) =>
    valueImportsOf(file).some((entry) => modulePattern.test(entry.specifier) && entry.name === symbol),
  );
}

describe("background tenant boundary", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("only authenticated entrypoints assume a tenant identity", () => {
    const violations = importersOf(TENANT_CONTEXT_MODULE, "runWithTenant")
      .filter((file) => !AUTHENTICATED_TENANT_ENTRYPOINTS.includes(file))
      .map(
        (file) =>
          `${file} value-imports runWithTenant. Assuming a tenant identity is limited to entrypoints that derive the user from an authenticated source; load a user by id only through runAsBackgroundTenant.`,
      );

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)("only workflows act as a background tenant", () => {
    const violations = importersOf(BACKGROUND_TENANT_MODULE, "runAsBackgroundTenant")
      .filter((file) => file !== BACKGROUND_TENANT_DEFINITION)
      .filter((file) => !file.startsWith(BACKGROUND_TENANT_CALLER_PREFIX))
      .map((file) => `${file} value-imports runAsBackgroundTenant outside ${BACKGROUND_TENANT_CALLER_PREFIX}`);

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("sees the identity-assuming surface it is meant to guard", () => {
    expect(sourceFiles().length).toBeGreaterThan(100);
    expect(importersOf(TENANT_CONTEXT_MODULE, "runWithTenant").sort()).toEqual(
      [...AUTHENTICATED_TENANT_ENTRYPOINTS].sort(),
    );
    expect(valueImportsOf(BACKGROUND_TENANT_DEFINITION).some((entry) => entry.name === "runWithTenant")).toBe(true);
  });
});

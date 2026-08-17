import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const SCANNED_DIRECTORIES = ["core", "ee", "features", "workflows", "app"];
const WRITE_OPERATIONS = new Set(["update", "updateMany", "upsert"]);
const PRISMA_TARGET = /(^|\.)prisma\.\w+$|^tx\.\w+$/;
const ACCESS_WHERE_HELPER = /accessWhere|AccessWhere/;
const BYPASS_DECORATOR = "BypassTenantGuard";

const GUARD_EXEMPT_MODELS = new Set([
  "authUser",
  "authAccount",
  "authSession",
  "authVerification",
  "apikey",
  "oauthApplication",
  "oauthAccessToken",
  "oauthConsent",
  "company",
]);

const REACHED_ONLY_FROM_BYPASSED_CALLERS = new Set([
  "core/auth/better-auth.ts:99",
  "ee/messaging/persistence/prisma-messaging.repository.ts:506",
  "ee/messaging/persistence/prisma-messaging.repository.ts:566",
  "ee/messaging/persistence/prisma-messaging.repository.ts:584",
  "features/user/prisma-user.repository.ts:573",
  "features/user/prisma-user.repository.ts:583",
  "features/user/prisma-user.repository.ts:593",
  "features/user/prisma-user.repository.ts:603",
  "features/user/prisma-user.repository.ts:612",
]);

type WriteSite = {
  file: string;
  line: number;
  operation: string;
  method: string;
  scoped: boolean;
};

function sourceFiles() {
  return SCANNED_DIRECTORIES.flatMap((dir) =>
    walkFiles(join(REPO_ROOT, dir), (path) => path.endsWith(".ts") && !path.includes("__tests__")),
  );
}

function enclosingMethod(node: ts.Node): ts.MethodDeclaration | undefined {
  let current: ts.Node | undefined = node;
  while (current) {
    if (ts.isMethodDeclaration(current)) return current;
    current = current.parent;
  }
  return undefined;
}

function bypassesTenantGuard(method: ts.MethodDeclaration | undefined): boolean {
  if (!method) return false;
  return (method.modifiers ?? []).some(
    (modifier) =>
      ts.isDecorator(modifier) &&
      ts.isIdentifier(modifier.expression) &&
      modifier.expression.text === BYPASS_DECORATOR,
  );
}

function whereInitializer(call: ts.CallExpression, source: ts.SourceFile): ts.Expression | undefined {
  const [arg] = call.arguments;
  if (!arg || !ts.isObjectLiteralExpression(arg)) return undefined;

  for (const property of arg.properties)
    if (ts.isPropertyAssignment(property) && property.name.getText(source) === "where") return property.initializer;

  return undefined;
}

function carriesCompanyId(where: ts.Expression | undefined, operation: string, source: ts.SourceFile): boolean {
  if (!where || !ts.isObjectLiteralExpression(where)) return false;

  for (const property of where.properties) {
    if (ts.isSpreadAssignment(property) && ACCESS_WHERE_HELPER.test(property.expression.getText(source))) return true;

    const name = property.name?.getText(source);
    if (name === "companyId") return true;

    const isCompoundSelector = operation === "upsert" && name?.includes("_");
    if (isCompoundSelector && ts.isPropertyAssignment(property) && ts.isObjectLiteralExpression(property.initializer))
      for (const nested of property.initializer.properties)
        if (nested.name?.getText(source) === "companyId") return true;
  }

  return false;
}

function writeSites(): WriteSite[] {
  const sites: WriteSite[] = [];

  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    if (!WRITE_OPERATIONS.values().some((operation) => text.includes(`.${operation}(`))) continue;

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const operation = node.expression.name.text;
        const target = node.expression.expression.getText(source);

        const model = target.split(".").pop() ?? "";

        if (WRITE_OPERATIONS.has(operation) && PRISMA_TARGET.test(target) && !GUARD_EXEMPT_MODELS.has(model)) {
          const method = enclosingMethod(node);
          const relativePath = relative(REPO_ROOT, file);
          const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;

          if (!bypassesTenantGuard(method) && !REACHED_ONLY_FROM_BYPASSED_CALLERS.has(`${relativePath}:${line}`))
            sites.push({
              file: relativePath,
              line,
              operation,
              method: method?.name.getText(source) ?? "(module scope)",
              scoped: carriesCompanyId(whereInitializer(node, source), operation, source),
            });
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return sites;
}

describe("tenant-scoped writes", () => {
  const sites = writeSites();

  it.runIf(ENFORCED)("scopes every tenant-guarded update, updateMany and upsert by companyId in its where", () => {
    const unscoped = sites
      .filter((site) => !site.scoped)
      .map((site) => `${site.file}:${site.line} ${site.operation} in ${site.method}`);

    expect(unscoped).toEqual([]);
  });

  it("still finds the write sites it is meant to guard", () => {
    expect(sites.length).toBeGreaterThan(10);
  });
});

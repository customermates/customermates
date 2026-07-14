import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const BYPASS_DECORATOR = "BypassTenantGuard";
const SCOPE_SUFFIX = /Unscoped|CompanyWide/;
const OR_THROW_NAME = /OrThrow(Unscoped|CompanyWide)?$/;
const NOT_FOUND_MESSAGE = /not found/i;
const OR_THROW_ALLOWLIST = new Set([
  "features/company/prisma-company.repository.ts#getDetails",
  "features/user/prisma-user.repository.ts#updateDetails",
  "features/user/prisma-user.repository.ts#createCompanyAndUser",
  "features/user/prisma-user.repository.ts#registerExistingCompany",
]);

type RepoMethod = {
  file: string;
  line: number;
  name: string;
  hasBypassDecorator: boolean;
  hasOrThrowBody: boolean;
  isPrivate: boolean;
};

function repoFiles() {
  return ["features", "ee", "core"].flatMap((dir) =>
    walkFiles(join(REPO_ROOT, dir), (path) => /(\.repo\.ts|\.repository\.ts|-repository\.ts)$/.test(path)),
  );
}

function hasBypassDecorator(node: ts.MethodDeclaration) {
  return (node.modifiers ?? []).some(
    (modifier) =>
      ts.isDecorator(modifier) && ts.isIdentifier(modifier.expression) && modifier.expression.text === BYPASS_DECORATOR,
  );
}

function throwsNotFound(body: ts.Block, source: ts.SourceFile) {
  let found = false;
  const visit = (node: ts.Node) => {
    if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
      const message = node.expression.arguments?.[0];
      if (message && NOT_FOUND_MESSAGE.test(message.getText(source))) found = true;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return found;
}

function collectRepoMethods() {
  const methods: RepoMethod[] = [];
  for (const path of repoFiles()) {
    const file = relative(REPO_ROOT, path);
    const text = readFileSync(path, "utf8");
    const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
    const visit = (node: ts.Node) => {
      if (ts.isMethodDeclaration(node) && node.body && ts.isIdentifier(node.name)) {
        const bodyText = node.body.getText(source);
        methods.push({
          file,
          line: ts.getLineAndCharacterOfPosition(source, node.name.getStart(source)).line + 1,
          name: node.name.text,
          hasBypassDecorator: hasBypassDecorator(node),
          hasOrThrowBody: /\bfind(First|Unique)OrThrow\b/.test(bodyText) || throwsNotFound(node.body, source),
          isPrivate: (node.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.PrivateKeyword),
        });
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return methods;
}

const methods = collectRepoMethods();

describe("repository naming conventions", () => {
  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "every method named *Unscoped* carries @BypassTenantGuard",
    () => {
      const violations = methods
        .filter((method) => /Unscoped/.test(method.name) && !method.hasBypassDecorator)
        .map((method) => `${method.file}:${method.line} ${method.name} is named Unscoped but lacks @BypassTenantGuard`);

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "every @BypassTenantGuard method is named *Unscoped* or *CompanyWide*",
    () => {
      const violations = methods
        .filter((method) => method.hasBypassDecorator && !SCOPE_SUFFIX.test(method.name))
        .map(
          (method) =>
            `${method.file}:${method.line} ${method.name} carries @BypassTenantGuard without Unscoped/CompanyWide name`,
        );

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it.skipIf(!ENFORCED && !process.env.AUDIT_REPORT)(
    "every public method with an OrThrow body is named *OrThrow (allowlisted invariant reads excepted)",
    () => {
      const violations = methods
        .filter(
          (method) =>
            method.hasOrThrowBody &&
            !method.isPrivate &&
            !OR_THROW_NAME.test(method.name) &&
            !OR_THROW_ALLOWLIST.has(`${method.file}#${method.name}`),
        )
        .map(
          (method) =>
            `${method.file}:${method.line} ${method.name} throws on missing rows but is not named *OrThrow`,
        );

      expect(violations, violations.join("\n")).toEqual([]);
    },
  );

  it("sees the expected repository surface", () => {
    expect(methods.length).toBeGreaterThan(100);
    expect(methods.some((method) => method.hasBypassDecorator)).toBe(true);
    expect(methods.some((method) => OR_THROW_NAME.test(method.name))).toBe(true);
  });

  it("keeps the OrThrow allowlist free of stale entries", () => {
    const known = new Set(methods.map((method) => `${method.file}#${method.name}`));
    const stale = [...OR_THROW_ALLOWLIST].filter((entry) => !known.has(entry));

    expect(stale, stale.join("\n")).toEqual([]);
  });
});

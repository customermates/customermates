import { readFileSync } from "node:fs";
import { relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, REPO_SCAN_TIMEOUT_MS, walkFiles } from "./walk";
import { errorClasses, introducedErrorClasses, type SourceFile } from "./error-subclass-introduction";
import { listBaseFiles, readBaseSource } from "./review-base";

const SOURCE_ROOTS = ["core", "features", "ee"];
const ACCESS_ERROR_CONSTRUCTORS = new Set([
  "AuthError",
  "ForbiddenError",
  "DemoModeError",
]);
const ACCESS_ERROR_OWNER_FILES = new Set([
  "core/decorators/system-interactor.decorator.ts",
  "core/decorators/tenant-interactor.decorator.ts",
  "ee/operator/operator-access.service.ts",
  "features/user/user.service.ts",
]);
const FEATURE_ERROR_ROOTS = ["app", "components", "ee", "features", "workflows"];
const LEGACY_MCP_FAILURE_IDENTIFIERS = new Set([
  "customErrorMessage",
  "validationError",
  "VALIDATION_ERROR_PREFIX",
]);

function sourceFiles() {
  return SOURCE_ROOTS.flatMap((root) =>
    walkFiles(
      `${REPO_ROOT}/${root}`,
      (path) => path.endsWith(".ts") && !path.includes("/__tests__/"),
    ),
  );
}

function parse(path: string) {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

function decoratorName(modifier: ts.ModifierLike): string | null {
  if (!ts.isDecorator(modifier)) return null;
  const expression = ts.isCallExpression(modifier.expression)
    ? modifier.expression.expression
    : modifier.expression;
  return ts.isIdentifier(expression) ? expression.text : null;
}

function hasDecorator(
  node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> },
  name: string,
) {
  return (
    node.modifiers?.some((modifier) => decoratorName(modifier) === name) ??
    false
  );
}

function isPlainInvariantThrow(node: ts.ThrowStatement) {
  return (
    ts.isNewExpression(node.expression) &&
    ts.isIdentifier(node.expression.expression) &&
    node.expression.expression.text === "Error"
  );
}

function isCatchRethrow(node: ts.ThrowStatement) {
  if (!ts.isIdentifier(node.expression)) return false;
  let parent: ts.Node | undefined = node.parent;
  while (parent) {
    if (ts.isCatchClause(parent)) {
      const declaration = parent.variableDeclaration;
      return Boolean(
        declaration &&
          ts.isIdentifier(declaration.name) &&
          declaration.name.text === node.expression.text,
      );
    }
    if (ts.isClassDeclaration(parent)) return false;
    parent = parent.parent;
  }
  return false;
}

describe("interactor error contract", () => {
  it("keeps access AppError construction inside access infrastructure", () => {
    const violations: string[] = [];
    for (const path of sourceFiles()) {
      const file = parse(path);
      const visit = (node: ts.Node) => {
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ACCESS_ERROR_CONSTRUCTORS.has(node.expression.text)
        ) {
          const fileName = relative(REPO_ROOT, path);
          if (!ACCESS_ERROR_OWNER_FILES.has(fileName)) {
            const line =
              file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
            violations.push(
              `${fileName}:${line} constructs ${node.expression.text}`,
            );
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(violations).toEqual([]);
  }, REPO_SCAN_TIMEOUT_MS);

  it("requires tenant interactors to return expected failures instead of throwing them", () => {
    const violations: string[] = [];
    for (const path of sourceFiles().filter((file) =>
      file.endsWith(".interactor.ts"),
    )) {
      const file = parse(path);
      const visit = (node: ts.Node) => {
        if (
          ts.isClassDeclaration(node) &&
          hasDecorator(node, "TenantInteractor")
        ) {
          const scanClass = (child: ts.Node) => {
            if (ts.isThrowStatement(child) && !isCatchRethrow(child) && !isPlainInvariantThrow(child)) {
              const line =
                file.getLineAndCharacterOfPosition(child.getStart(file)).line +
                1;
              violations.push(`${relative(REPO_ROOT, path)}:${line}`);
            }
            ts.forEachChild(child, scanClass);
          };
          node.members.forEach(scanClass);
          return;
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(violations).toEqual([]);
  });

  it("runs output validation inside explicit transactions", () => {
    const violations: string[] = [];
    for (const path of sourceFiles().filter((file) =>
      file.endsWith(".interactor.ts"),
    )) {
      const file = parse(path);
      const visit = (node: ts.Node) => {
        if (ts.isMethodDeclaration(node)) {
          const decorators = node.modifiers?.filter(ts.isDecorator) ?? [];
          const names = decorators.map(decoratorName);
          const transactionIndex = names.indexOf("Transaction");
          const outputIndex = names.indexOf("ValidateOutput");
          if (
            transactionIndex >= 0 &&
            outputIndex >= 0 &&
            transactionIndex > outputIndex
          ) {
            const line =
              file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
            violations.push(`${relative(REPO_ROOT, path)}:${line}`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(violations).toEqual([]);
  });

  it("classifies every id validator's not-found code as not_found", async () => {
    const { interactorFailureKind, interactorFailureStatus, createZodError } = await import(
      "@/core/validation/validation.utils"
    );
    const violations: string[] = [];
    for (const path of walkFiles(
      `${REPO_ROOT}/core/validation/validators`,
      (file) => file.endsWith(".interactor.ts") && !file.includes("/__tests__/"),
    )) {
      const source = readFileSync(path, "utf8");
      for (const [, code] of source.matchAll(/CustomErrorCode\.(\w+)\s*\)/g)) {
        const error = createZodError("missing", ["ids"], { error: code });
        if (interactorFailureKind(error) !== "not_found" || interactorFailureStatus(error) !== 404)
          violations.push(`${relative(REPO_ROOT, path)} produces ${code}, which classifies as ${interactorFailureKind(error)}`);
      }
    }
    expect(violations).toEqual([]);
  });

  it("introduces no Error subclass in feature code since the review base", () => {
    const isFeatureSource = (path: string) => /\.tsx?$/.test(path) && !path.includes("/__tests__/");
    const head: SourceFile[] = FEATURE_ERROR_ROOTS.flatMap((root) =>
      walkFiles(`${REPO_ROOT}/${root}`, isFeatureSource),
    ).map((path) => ({ path: relative(REPO_ROOT, path), source: readFileSync(path, "utf8") }));
    const classes = errorClasses(head);
    expect(classes.length, "the detector should still see the pre-existing Error subclasses").toBeGreaterThan(0);
    expect(
      introducedErrorClasses(classes, readBaseSource, () =>
        FEATURE_ERROR_ROOTS.flatMap((root) => listBaseFiles(root)).filter(isFeatureSource),
      ),
      "Return a typed failure instead of adding an Error subclass",
    ).toEqual([]);
  }, REPO_SCAN_TIMEOUT_MS);

  describe("Error subclass introduction fixtures", () => {
    const base: Record<string, string> = {
      "ee/a/limits.ts": "export class LimitError extends Error {}",
      "ee/b/old-place.ts": "export class MovedError extends Error {}",
      "ee/c/remote.ts": "export class RemoteError extends TypeError {}",
    };
    const introduced = (files: SourceFile[]) =>
      introducedErrorClasses(
        errorClasses(files),
        (path) => base[path],
        () => Object.keys(base),
      );

    it("accepts unchanged classes and verified relocations", () => {
      expect(introduced([{ path: "ee/a/limits.ts", source: base["ee/a/limits.ts"] }])).toEqual([]);
      expect(introduced([{ path: "ee/b/new-place.ts", source: "export class MovedError extends Error {}" }])).toEqual([]);
    });

    it("rejects a new class in an existing file and a relocation that changes its parent", () => {
      expect(
        introduced([
          { path: "ee/a/limits.ts", source: `${base["ee/a/limits.ts"]}\nexport class QuotaError extends Error {}` },
        ]),
      ).toEqual(["ee/a/limits.ts:QuotaError extends Error"]);
      expect(introduced([{ path: "ee/c/moved.ts", source: "export class RemoteError extends Error {}" }])).toEqual([
        "ee/c/moved.ts:RemoteError extends Error",
      ]);
    });

    it("rejects aliases, class expressions and indirect inheritance", () => {
      expect(introduced([{ path: "ee/d/alias.ts", source: "const Base = Error;\nexport class Hidden extends Base {}" }])).toEqual([
        "ee/d/alias.ts:Hidden extends Error",
      ]);
      expect(introduced([{ path: "ee/d/expression.ts", source: "export const Anonymous = class extends Error {};" }])).toEqual([
        "ee/d/expression.ts:Anonymous extends Error",
      ]);
      expect(
        introduced([
          { path: "ee/a/limits.ts", source: base["ee/a/limits.ts"] },
          {
            path: "ee/d/indirect.ts",
            source: 'import { LimitError as Upstream } from "../a/limits";\nexport class Wrapped extends Upstream {}',
          },
        ]),
      ).toEqual(["ee/d/indirect.ts:Wrapped extends LimitError"]);
    });
  });

  it("keeps terminal MCP failures structured", () => {
    const violations: string[] = [];
    for (const path of sourceFiles().filter((file) => file.endsWith(".mcp-tools.ts"))) {
      const file = parse(path);
      const visit = (node: ts.Node) => {
        if (ts.isIdentifier(node) && LEGACY_MCP_FAILURE_IDENTIFIERS.has(node.text)) {
          const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
          violations.push(`${relative(REPO_ROOT, path)}:${line} uses ${node.text}`);
        }
        if (ts.isStringLiteralLike(node) && node.text.includes("Validation error:")) {
          const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
          violations.push(`${relative(REPO_ROOT, path)}:${line} embeds a legacy validation result`);
        }
        ts.forEachChild(node, visit);
      };
      visit(file);
    }
    expect(violations).toEqual([]);
  });
});

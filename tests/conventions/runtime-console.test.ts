import { readFileSync } from "node:fs";
import { relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ALLOWED_CALLS = new Map<string, string[]>([
  ["features/email/email.service.ts", ["log"]],
  ["features/event/event.service.ts", ["log"]],
  ["instrumentation-client.ts", ["error"]],
  ["instrumentation.ts", ["error", "error"]],
  ["workflows/capture-failure.ts", ["error", "error", "warn", "error"]],
]);

type ConsoleCall = { method: string; line: number };

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    ts.isParenthesizedExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression) ||
    ts.isNonNullExpression(expression)
  )
    return unwrap(expression.expression);
  return expression;
}

function propertyName(expression: ts.PropertyAccessExpression | ts.ElementAccessExpression): string {
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  const argument = expression.argumentExpression;
  return argument && (ts.isStringLiteral(argument) || ts.isNoSubstitutionTemplateLiteral(argument))
    ? argument.text
    : "<dynamic>";
}

function isConsoleObject(expression: ts.Expression): boolean {
  const target = unwrap(expression);
  if (ts.isIdentifier(target)) return target.text === "console";
  if (!ts.isPropertyAccessExpression(target) && !ts.isElementAccessExpression(target)) return false;

  const owner = unwrap(target.expression);
  return (
    ts.isIdentifier(owner) &&
    ["global", "globalThis", "self", "window"].includes(owner.text) &&
    propertyName(target) === "console"
  );
}

function consoleCalls(source: ts.SourceFile): ConsoleCall[] {
  const calls: ConsoleCall[] = [];

  const visit = (node: ts.Node) => {
    if (
      (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) &&
      isConsoleObject(node.expression)
    ) {
      calls.push({
        method: propertyName(node),
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };

  visit(source);
  return calls;
}

function consoleCallsIn(path: string): ConsoleCall[] {
  const text = readFileSync(path, "utf8");
  const kind = path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  return consoleCalls(ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind));
}

function excluded(file: string): boolean {
  return (
    file.startsWith(".source/") ||
    file.startsWith("tests/") ||
    file.startsWith("scripts/") ||
    file.startsWith("ee/scripts/") ||
    file === "next-env.d.ts" ||
    file === "prisma/seed.ts" ||
    file.includes("/__tests__/") ||
    /\.(spec|test)\.tsx?$/.test(file)
  );
}

function runtimeFiles(): string[] {
  return walkFiles(REPO_ROOT, (path) => {
    if (!/\.tsx?$/.test(path)) return false;
    const file = relative(REPO_ROOT, path).replaceAll("\\", "/");
    return !excluded(file);
  });
}

describe("runtime console boundary", () => {
  it("keeps console calls inside the approved runtime boundaries", () => {
    const mismatches: string[] = [];
    const seen = new Set<string>();

    for (const path of runtimeFiles()) {
      const file = relative(REPO_ROOT, path).replaceAll("\\", "/");
      const calls = consoleCallsIn(path);
      const expected = ALLOWED_CALLS.get(file) ?? [];
      if (calls.length === 0 && expected.length === 0) continue;
      seen.add(file);

      const methods = calls.map((call) => call.method);
      if (methods.join(",") === expected.join(",")) continue;
      mismatches.push(
        `${file}: expected [${expected.join(", ")}], found [${calls.map((call) => `${call.method}:${call.line}`).join(", ")}]`,
      );
    }

    for (const file of ALLOWED_CALLS.keys()) {
      if (!seen.has(file)) mismatches.push(`${file}: expected an explicit console-call boundary, found none`);
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("detects direct and qualified console access in a synthetic runtime source", () => {
    const source = ts.createSourceFile(
      "probe.ts",
      [
        'console.warn("direct");',
        'globalThis.console["error"]("qualified");',
        'console.log.call(console, "aliased call");',
        'const warning = (window.console.warn);',
      ].join("\n"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );

    expect(consoleCalls(source)).toEqual([
      { method: "warn", line: 1 },
      { method: "error", line: 2 },
      { method: "log", line: 3 },
      { method: "warn", line: 4 },
    ]);
  });
});

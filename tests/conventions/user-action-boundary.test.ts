import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SCANNED_DIRECTORIES = ["app", "components", "core", "features"];
const LIFECYCLE_HANDLER_NAMES = new Set([
  "onAbort",
  "onCanPlay",
  "onCanPlayThrough",
  "onDurationChange",
  "onEmptied",
  "onEnded",
  "onError",
  "onLoad",
  "onLoadedData",
  "onLoadedMetadata",
  "onProgress",
  "onStalled",
  "onSuspend",
  "onWaiting",
]);
const INTENTIONAL_UNHANDLED_USER_ACTIONS = new Set([
  "app/[locale]/(protected)/test/error/error-test-card.tsx:onClick:void errorTestStore.triggerUnexpectedServerError()",
  "app/[locale]/(protected)/test/error/error-test-card.tsx:onClick:void handleWorkflowError()",
]);

type Finding = {
  expression: string;
  handler: string | null;
};

function normalize(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function propertyName(node: ts.PropertyName): string {
  return node.getText().replace(/^['"]|['"]$/g, "");
}

function owningUserHandler(node: ts.Node): string | null {
  let current: ts.Node | undefined = node.parent;
  while (current && !ts.isSourceFile(current)) {
    if (ts.isJsxAttribute(current)) {
      const name = current.name.getText();
      return /^on[A-Z]/.test(name) && !LIFECYCLE_HANDLER_NAMES.has(name) ? name : null;
    }
    if (ts.isPropertyAssignment(current) && ts.isObjectLiteralExpression(current.parent)) {
      const name = propertyName(current.name);
      return /^on[A-Z]/.test(name) && !LIFECYCLE_HANDLER_NAMES.has(name) ? name : null;
    }
    current = current.parent;
  }
  return null;
}

function hasTerminalCatch(node: ts.Node): boolean {
  const expression = ts.isVoidExpression(node) ? node.expression : node;
  if (
    ts.isCallExpression(expression) &&
    ts.isPropertyAccessExpression(expression.expression) &&
    expression.expression.name.text === "catch"
  ) {
    return true;
  }
  return false;
}

function findingsIn(text: string, file = "probe.tsx"): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isVoidExpression(node)) {
      findings.push({
        expression: normalize(node.getText(source)),
        handler: owningUserHandler(node),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);

  return findings;
}

function applicationFindings() {
  const files = SCANNED_DIRECTORIES.flatMap((dir) =>
    walkFiles(join(REPO_ROOT, dir), (path) => path.endsWith(".tsx") && !path.includes("/__tests__/")),
  );
  const violations: string[] = [];
  const intentional: string[] = [];

  for (const path of files) {
    const file = relative(REPO_ROOT, path);
    const text = readFileSync(path, "utf8");
    for (const finding of findingsIn(text, file)) {
      const key = `${file}:${finding.handler ?? "background"}:${finding.expression}`;
      if (INTENTIONAL_UNHANDLED_USER_ACTIONS.has(key)) {
        intentional.push(key);
        continue;
      }
      if (finding.handler || !hasTerminalCatchInText(finding.expression)) violations.push(key);
    }
  }

  return { intentional: intentional.sort(), violations: violations.sort() };
}

function hasTerminalCatchInText(expression: string): boolean {
  const source = ts.createSourceFile("expression.tsx", expression, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const statement = source.statements[0];
  return Boolean(statement && ts.isExpressionStatement(statement) && hasTerminalCatch(statement.expression));
}

describe("user action promise boundaries", () => {
  it("uses runUserAction for UI gestures and explicit catches for background work", () => {
    const { intentional, violations } = applicationFindings();

    expect(violations, violations.join("\n")).toEqual([]);
    expect(intentional).toEqual([...INTENTIONAL_UNHANDLED_USER_ACTIONS].sort());
  });

  it("detects raw JSX, object-action, and detached named-handler promises", () => {
    const source = `
      const direct = <Button onClick={() => void save()} />;
      const configured = { onSelect: () => void choose() };
      function handleSubmit() { void submit(); }
    `;

    expect(findingsIn(source)).toEqual([
      { expression: "void save()", handler: "onClick" },
      { expression: "void choose()", handler: "onSelect" },
      { expression: "void submit()", handler: null },
    ]);
  });

  it("accepts the shared UI boundary and explicitly handled background work", () => {
    const source = `
      const action = <Button onClick={() => runUserAction(() => save())} />;
      const media = <audio onError={() => { void classify().catch(reportApplicationError); }} />;
      useEffect(() => { void load().catch(reportApplicationError); }, []);
    `;
    const findings = findingsIn(source);

    expect(findings).toEqual([
      {
        expression: "void classify().catch(reportApplicationError)",
        handler: null,
      },
      {
        expression: "void load().catch(reportApplicationError)",
        handler: null,
      },
    ]);
    expect(findings.every((finding) => hasTerminalCatchInText(finding.expression))).toBe(true);
  });
});

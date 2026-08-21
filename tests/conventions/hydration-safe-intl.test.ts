import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const SCANNED_DIRECTORIES = ["app", "components", "core", "features"];
const HYDRATION_SENSITIVE_INTL_MEMBER =
  /\.(?:(?:date|dateTime)FormatMap|rendersZonedValues|use12Hour|resolvedFormattingLanguageTag|companyCurrency|collator|format(?:Numerical(?:Long|Short)Date(?:Time)?|Descriptive(?:Short|Long)Date(?:Time)?|Time|RelativeTime|Currency|Number(?:ForEditing)?))\b/;
const HYDRATION_BOUNDARY = /\b(?:useHydratedIntlStore|HydrationSafeIntlStore)\b/;

function usesHydrationSensitiveIntl(text: string): boolean {
  return HYDRATION_SENSITIVE_INTL_MEMBER.test(text);
}

function hasHydrationBoundary(text: string): boolean {
  return HYDRATION_BOUNDARY.test(text);
}

function acquiresIntlStoreFromRoot(text: string): boolean {
  const source = ts.createSourceFile("consumer.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const rootStoreIdentifiers = new Set<string>();
  let violation = false;

  const isRootStoreCall = (node: ts.Node): node is ts.CallExpression =>
    ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "useRootStore";

  const collect = (node: ts.Node) => {
    if (ts.isVariableDeclaration(node) && node.initializer && isRootStoreCall(node.initializer)) {
      if (ts.isIdentifier(node.name)) rootStoreIdentifiers.add(node.name.text);
      if (
        ts.isObjectBindingPattern(node.name) &&
        node.name.elements.some((element) => (element.propertyName ?? element.name).getText(source) === "intlStore")
      ) {
        violation = true;
      }
    }
    ts.forEachChild(node, collect);
  };
  collect(source);

  const inspect = (node: ts.Node) => {
    if (
      ts.isPropertyAccessExpression(node) &&
      node.name.text === "intlStore" &&
      (isRootStoreCall(node.expression) ||
        (ts.isIdentifier(node.expression) && rootStoreIdentifiers.has(node.expression.text)))
    ) {
      violation = true;
    }
    ts.forEachChild(node, inspect);
  };
  inspect(source);
  return violation;
}

describe("hydration-safe Intl rendering", () => {
  it("routes every production TSX display formatter through the consumer-local hydration boundary", () => {
    const files = SCANNED_DIRECTORIES.flatMap((directory) =>
      walkFiles(
        join(REPO_ROOT, directory),
        (path) => path.endsWith(".tsx") && !path.includes("/__tests__/") && !path.includes("/test/error/"),
      ),
    );
    const violations = files
      .filter((path) => {
        const text = readFileSync(path, "utf8");
        return acquiresIntlStoreFromRoot(text) || (usesHydrationSensitiveIntl(text) && !hasHydrationBoundary(text));
      })
      .map((path) => relative(REPO_ROOT, path))
      .sort();

    expect(violations, violations.join("\n")).toEqual([]);
  });

  it("distinguishes unsafe direct formatters from the shared boundary", () => {
    expect(usesHydrationSensitiveIntl("intlStore.formatTime(value)")).toBe(true);
    expect(usesHydrationSensitiveIntl("intlStore.formatCurrency(value)")).toBe(true);
    expect(hasHydrationBoundary("const intlStore = useHydratedIntlStore()")).toBe(true);
    expect(hasHydrationBoundary("const { intlStore } = useRootStore()")).toBe(false);
    expect(acquiresIntlStoreFromRoot("const { intlStore } = useRootStore()")).toBe(true);
    expect(acquiresIntlStoreFromRoot("const rootStore = useRootStore(); rootStore.intlStore.formatNumber(1)")).toBe(
      true,
    );
    expect(acquiresIntlStoreFromRoot("const intlStore = useHydratedIntlStore()")).toBe(false);
  });
});

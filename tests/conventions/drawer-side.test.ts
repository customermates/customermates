import { join, relative } from "path";

import ts from "typescript";
import { describe, it, expect } from "vitest";

import { REPO_ROOT, parseSource, readSourceText, walkFiles } from "./walk";

function sideAttributes(file: string, tagName: string) {
  const source = parseSource(file, readSourceText(file));
  const found: Array<{ value: string | null; line: number }> = [];
  const visit = (node: ts.Node) => {
    if (
      (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) &&
      node.tagName.getText(source) === tagName
    ) {
      for (const attribute of node.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || attribute.name.getText(source) !== "side") continue;
        const initializer = attribute.initializer;
        found.push({
          value: initializer && ts.isStringLiteral(initializer) ? initializer.text : null,
          line: source.getLineAndCharacterOfPosition(attribute.getStart(source)).line + 1,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

const sources = ["app", "components"].flatMap((folder) =>
  walkFiles(join(REPO_ROOT, folder), (path) => path.endsWith(".tsx")),
);

describe("drawer side placement (rule 60: every drawer opens from the right)", () => {
  it("opens the shared AppModal sheet from the right only", () => {
    expect(sideAttributes(join(REPO_ROOT, "components/modal/app-modal.tsx"), "SheetContent")).toEqual([
      expect.objectContaining({ value: "right" }),
    ]);
  });

  it("never lets an AppModal caller choose a drawer side", () => {
    const offenders = sources.flatMap((file) =>
      sideAttributes(file, "AppModal").map(({ line }) => `${relative(REPO_ROOT, file)}:${line}`),
    );

    expect(offenders).toEqual([]);
  });

  it("opens every sheet with a fixed side from the right", () => {
    const offenders = sources.flatMap((file) =>
      sideAttributes(file, "SheetContent")
        .filter(({ value }) => value !== null && value !== "right")
        .map(({ value, line }) => `${relative(REPO_ROOT, file)}:${line} side="${value}"`),
    );

    expect(offenders).toEqual([]);
  });

  it("opens the record drawer as a shared AppModal sheet", () => {
    const source = readSourceText(
      join(REPO_ROOT, "app/[locale]/(protected)/records/[typeId]/components/record-editor.tsx"),
    );

    expect(source).toMatch(/<AppModal\b[^>]*\bsheet\b/);
  });
});

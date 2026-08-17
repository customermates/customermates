import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const ENFORCED = true;

const SCANNED_DIRECTORIES = ["core", "ee", "features", "workflows", "app"];

const CRM_ACCESS_KEYS = ["companyId", "users"];

const HELPER_KEYS: Record<string, string[]> = {
  'accessWhere("user")': ["companyId", "id"],
  'accessWhere("contact")': CRM_ACCESS_KEYS,
  'accessWhere("organization")': CRM_ACCESS_KEYS,
  'accessWhere("deal")': CRM_ACCESS_KEYS,
  'accessWhere("service")': CRM_ACCESS_KEYS,
  'accessWhere("task")': CRM_ACCESS_KEYS,
  "threadAccessWhere(": ["companyId", "OR"],
  "calendarAccessWhere(": ["companyId", "connectedAccount"],
  "calendarEventAccessWhere(": ["companyId", "connectedAccount"],
  "accountActivityAccessWhere(": ["companyId", "connectedAccount"],
  "folderMessageWhere(": ["OR"],
  "threadFolderMembershipWhere(": ["OR"],
  "threadHasActivityWhere(": ["OR"],
};

type Collision = { file: string; line: number; key: string; helper: string };

function sourceFiles() {
  return SCANNED_DIRECTORIES.flatMap((dir) =>
    walkFiles(join(REPO_ROOT, dir), (path) => path.endsWith(".ts") && !path.includes("__tests__")),
  );
}

function helperFor(expression: string): [string, string[]] | undefined {
  for (const [needle, keys] of Object.entries(HELPER_KEYS)) if (expression.includes(needle)) return [needle, keys];
  return undefined;
}

function collisions(): { found: Collision[]; helpersSeen: Set<string> } {
  const found: Collision[] = [];
  const helpersSeen = new Set<string>();

  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    if (!/accessWhere|AccessWhere|folderMessageWhere|threadHasActivityWhere/.test(text)) continue;

    for (const helper of Object.keys(HELPER_KEYS)) if (text.includes(helper)) helpersSeen.add(helper);

    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);

    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const properties = node.properties;

        for (const property of properties) {
          if (!ts.isSpreadAssignment(property)) continue;

          const match = helperFor(property.expression.getText(source));
          if (!match) continue;

          const [helper, keys] = match;
          helpersSeen.add(helper);

          for (const sibling of properties) {
            if (sibling === property) continue;

            const name = sibling.name?.getText(source);
            if (!name || !keys.includes(name)) continue;

            found.push({
              file: relative(REPO_ROOT, file),
              line: source.getLineAndCharacterOfPosition(sibling.getStart()).line + 1,
              key: name,
              helper,
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    };

    visit(source);
  }

  return { found, helpersSeen };
}

describe("access-where composition", () => {
  const { found, helpersSeen } = collisions();

  it.runIf(ENFORCED)("never spreads an access predicate beside a key that predicate also sets", () => {
    const clashes = found.map((c) => `${c.file}:${c.line} key '${c.key}' collides with ${c.helper}`);

    expect(clashes).toEqual([]);
  });

  it("keeps the helper key map in step with the helpers that exist", () => {
    const unused = Object.keys(HELPER_KEYS).filter((helper) => !helpersSeen.has(helper));

    expect(unused).toEqual([]);
  });
});

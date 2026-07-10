import { describe, expect, it } from "vitest";

import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";

import { REPO_ROOT, walkFiles } from "./walk";

describe("openapi colocation", () => {
  it("keeps every openapi file in a directory with interactors", () => {
    const violations: string[] = [];
    for (const root of ["features", "ee"]) {
      for (const file of walkFiles(join(REPO_ROOT, root), (path) => path.endsWith(".openapi.ts"))) {
        const siblings = readdirSync(dirname(file));
        if (!siblings.some((name) => name.endsWith(".interactor.ts"))) {
          violations.push(`${file.slice(REPO_ROOT.length + 1)} has no interactor in its directory`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});

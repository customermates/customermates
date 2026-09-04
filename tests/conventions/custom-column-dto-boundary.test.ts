import { readFileSync } from "node:fs";
import { relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const CAST = "as CustomColumnDto";
const OWNER = "features/custom-column/custom-column.dto.ts";

function isTestFile(path: string): boolean {
  return path.includes("__tests__") || path.endsWith(".test.ts") || path.endsWith(".test.tsx");
}

const offenders = walkFiles(REPO_ROOT, (path) => path.endsWith(".ts") || path.endsWith(".tsx"))
  .filter((path) => !isTestFile(path))
  .filter((path) => relative(REPO_ROOT, path) !== OWNER)
  .filter((path) => readFileSync(path, "utf8").includes(CAST))
  .map((path) => relative(REPO_ROOT, path))
  .sort();

describe("every custom column DTO crosses one boundary", () => {
  it("casts a stored row to a CustomColumnDto in exactly one non test source file", () => {
    expect(offenders).toEqual([]);
  });

  it("keeps that boundary function present and exported", () => {
    const source = readFileSync(`${REPO_ROOT}/${OWNER}`, "utf8");

    expect(source).toContain("export function toCustomColumnDto");
    expect(source).toContain("orderByOptionIndex");
  });
});

import { readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT, walkFiles } from "./walk";

const read = (path: string) => readFileSync(join(REPO_ROOT, path), "utf8");

const NO_STORED_OPTION_ORDER = [
  "components/data-view/data-kanban-view.tsx",
  "components/data-view/data-table.tsx",
  "core/base/base-get.interactor.ts",
] as const;

const AXIS_CALLERS = [
  "core/base/grouping/group-axis.ts",
  "core/base/base-get.interactor.ts",
] as const;

function sourceFiles(): string[] {
  return walkFiles(
    REPO_ROOT,
    (path) => /\.tsx?$/.test(path) && !path.includes("/__tests__/") && !/\.test\.tsx?$/.test(path),
  ).map((path) => relative(REPO_ROOT, path));
}

describe("the group order is decided once, on the server", () => {
  it("keeps every renderer of a group away from the stored option array", () => {
    for (const path of NO_STORED_OPTION_ORDER) {
      expect(read(path), path).not.toContain("options.options");
      expect(read(path), path).not.toContain("KANBAN_EMPTY_GROUP_KEY");
    }
  });

  it("calls resolveGroupAxis from its own module and the interactor, nowhere else", () => {
    const callers = sourceFiles().filter((path) => read(path).includes("resolveGroupAxis("));

    expect(callers.sort()).toEqual([...AXIS_CALLERS].sort());
  });

  it("orders a custom single select axis through the one shared comparator", () => {
    const axis = read("core/base/grouping/group-axis.ts");

    expect(axis).toContain("orderByOptionIndex(spec.options)");
    expect(read("core/base/grouping/groupable-field.ts")).not.toContain("orderByOptionIndex");
  });

  it("lets no client re-derive the group order from the counts map", () => {
    const calls = {
      "components/data-view/data-kanban-view.tsx": "visibleGroups(store.groupingResult, { keepEmptyNoValue: true })",
      "components/data-view/data-table.tsx": "visibleGroups(store.groupingResult)",
    };

    for (const [path, call] of Object.entries(calls)) {
      expect(read(path), path).not.toContain("store.groupCounts");
      expect(read(path), path).toContain(call);
    }
  });
});

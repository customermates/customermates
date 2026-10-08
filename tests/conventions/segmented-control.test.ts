import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

describe("the shared SegmentedControl stays a segmented control (design rule 57)", () => {
  it("keeps the shared SegmentedControl equal-width and container-sized", () => {
    const source = readFileSync(join(REPO_ROOT, "components/ui/segmented-control.tsx"), "utf8");
    expect(source).toContain("auto-cols-fr grid-flow-col");
    expect(source).toContain("w-full");
    expect(source).not.toMatch(/border-b\b/);
  });
});

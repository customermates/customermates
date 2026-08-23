import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { REPO_ROOT } from "./walk";

const STYLEGUIDE = join(REPO_ROOT, "app", "[locale]", "(static)", "styleguide", "components");

function read(file: string): string {
  return readFileSync(join(STYLEGUIDE, file), "utf8");
}

describe("style guide pattern coverage", () => {
  const patterns = read("section-patterns.tsx");
  const contract = read("responsive-contract.tsx");
  const declared = [...patterns.matchAll(/id="(S-\d+)"/g)].map((match) => match[1]);

  it("declares a pattern library worth documenting", () => {
    expect(new Set(declared).size).toBeGreaterThan(8);
  });

  it("gives every declared pattern a row in the collapse table", () => {
    const covered = new Set([...contract.matchAll(/(S-\d+)/g)].map((match) => match[1]));
    const missing = [...new Set(declared)].filter((id) => !covered.has(id)).sort();

    expect(
      missing,
      `the style guide states that a pattern with no collapse entry is unchecked, so every pattern in section-patterns.tsx must appear in responsive-contract.tsx`,
    ).toEqual([]);
  });

  it("does not document a collapse rule for a pattern that no longer exists", () => {
    const declaredSet = new Set(declared);
    const covered = [...new Set([...contract.matchAll(/(S-\d+)/g)].map((match) => match[1]))];
    const orphans = covered.filter((id) => !declaredSet.has(id)).sort();

    expect(orphans, `responsive-contract.tsx documents a pattern that section-patterns.tsx no longer renders`).toEqual(
      [],
    );
  });
});
